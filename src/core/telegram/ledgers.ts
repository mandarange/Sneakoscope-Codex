import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  appendJsonlBounded,
  ensureDir,
  nowIso,
  readJson,
  sha256,
  writeJsonAtomic
} from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import type {
  RemoteActionV1,
  TelegramActionAliasV1,
  TelegramAuditEventV1,
  TelegramTopicRouteV1
} from './types.js';

interface TopicRegistryFileV1 {
  schema: 'sks.telegram-topic-registry.v1';
  routes: TelegramTopicRouteV1[];
}

interface ActionLedgerFileV1 {
  schema: 'sks.telegram-action-ledger.v1';
  actions: RemoteActionV1[];
  aliases: TelegramActionAliasV1[];
}

export class TelegramTopicRegistry {
  constructor(private readonly file: string) {}

  async list(): Promise<TelegramTopicRouteV1[]> {
    const registry = await readJson<TopicRegistryFileV1>(this.file, { schema: 'sks.telegram-topic-registry.v1', routes: [] });
    return registry.schema === 'sks.telegram-topic-registry.v1' && Array.isArray(registry.routes) ? registry.routes : [];
  }

  async findBySession(machineId: string, projectId: string, sessionId: string): Promise<TelegramTopicRouteV1 | null> {
    return (await this.list()).find((route) => route.machine_id === machineId && route.project_id === projectId && route.session_id === sessionId) ?? null;
  }

  async findByTopic(chatId: string, messageThreadId: number): Promise<TelegramTopicRouteV1 | null> {
    return (await this.list()).find((route) => route.chat_id === chatId && route.message_thread_id === messageThreadId) ?? null;
  }

  async upsert(input: Omit<TelegramTopicRouteV1, 'schema' | 'created_at' | 'updated_at' | 'generation'> & { recreate?: boolean }): Promise<TelegramTopicRouteV1> {
    return withFileLock({ lockPath: `${this.file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const routes = await this.list();
      const sessionIndex = routes.findIndex((route) => route.machine_id === input.machine_id && route.project_id === input.project_id && route.session_id === input.session_id);
      const collision = routes.find((route, index) => index !== sessionIndex && route.chat_id === input.chat_id && route.message_thread_id === input.message_thread_id);
      if (collision) throw new Error('telegram_topic_collision');
      const current = sessionIndex >= 0 ? routes[sessionIndex] : undefined;
      const at = nowIso();
      const next: TelegramTopicRouteV1 = {
        schema: 'sks.telegram-topic-route.v1',
        machine_id: input.machine_id,
        project_id: input.project_id,
        session_id: input.session_id,
        chat_id: input.chat_id,
        message_thread_id: input.message_thread_id,
        pinned_message_id: input.pinned_message_id,
        created_at: current?.created_at ?? at,
        updated_at: at,
        generation: current ? current.generation + (input.recreate === true ? 1 : 0) : 1
      };
      if (sessionIndex >= 0) routes[sessionIndex] = next;
      else routes.push(next);
      await writeJsonAtomic(this.file, { schema: 'sks.telegram-topic-registry.v1', routes } satisfies TopicRegistryFileV1);
      return next;
    });
  }
}

export function buildTelegramTopicName(
  input: { machine: string; repo: string; branch: string; title: string },
  existingNames: readonly string[] = [],
  maxLength = 128
): string {
  const normalized = [input.machine, `${input.repo}/${input.branch}`, input.title]
    .map((part) => part.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
  const base = normalized.slice(0, Math.max(1, maxLength));
  if (!existingNames.includes(base)) return base;
  const suffix = ` · ${sha256(normalized).slice(0, 8)}`;
  return `${base.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
}

export class TelegramIdempotencyLedger {
  constructor(private readonly file: string) {}

  async claim(updateId: number): Promise<boolean> {
    if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error('telegram_update_id_invalid');
    return withFileLock({ lockPath: `${this.file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const rows = await readJsonLines(this.file);
      if (rows.some((row) => row.update_id === updateId)) return false;
      await appendJsonlBounded(this.file, { schema: 'sks.telegram-update-idempotency.v1', update_id: updateId, claimed_at: nowIso() }, 5 * 1024 * 1024);
      return true;
    });
  }
}

export class TelegramActionBroker {
  constructor(private readonly file: string) {}

  async create(
    action: RemoteActionV1,
    route: { chat_id: string; message_thread_id: number }
  ): Promise<{ action: RemoteActionV1; callback_data: string }> {
    if (action.risk === 'R3') throw new Error('telegram_r3_always_denied');
    return this.mutate((ledger) => {
      if (ledger.actions.some((candidate) => candidate.action_id === action.action_id)) throw new Error('telegram_action_id_exists');
      const alias = createAlias();
      const callbackData = `cb:${alias}`;
      if (Buffer.byteLength(callbackData, 'utf8') < 1 || Buffer.byteLength(callbackData, 'utf8') > 64) throw new Error('telegram_callback_data_out_of_bounds');
      ledger.actions.push(action);
      ledger.aliases.push({
        alias,
        action_id: action.action_id,
        session_id: action.session_id,
        chat_id: route.chat_id,
        message_thread_id: route.message_thread_id,
        revision: action.revision,
        expires_at: action.expires_at,
        used_at: null
      });
      return { action, callback_data: callbackData };
    });
  }

  async resolve(input: {
    callback_data: string;
    chat_id: string;
    message_thread_id: number;
    revision: number;
    now?: number;
  }): Promise<{ ok: boolean; status: string; action: RemoteActionV1 | null }> {
    return this.mutate((ledger) => {
      const aliasValue = input.callback_data.startsWith('cb:') ? input.callback_data.slice(3) : '';
      const alias = ledger.aliases.find((entry) => entry.alias === aliasValue);
      if (!alias) return { ok: false, status: 'unknown_alias', action: null };
      const action = ledger.actions.find((entry) => entry.action_id === alias.action_id) ?? null;
      if (!action) return { ok: false, status: 'unknown_action', action: null };
      if (alias.used_at || ['claimed', 'resolved', 'cancelled'].includes(action.status)) return { ok: false, status: 'already_resolved', action };
      const now = input.now ?? Date.now();
      if (Date.parse(alias.expires_at) <= now || Date.parse(action.expires_at) <= now) {
        action.status = 'expired';
        return { ok: false, status: 'expired', action };
      }
      if (alias.chat_id !== input.chat_id || alias.message_thread_id !== input.message_thread_id) return { ok: false, status: 'wrong_topic', action };
      if (alias.revision !== input.revision || action.revision !== input.revision) return { ok: false, status: 'revision_mismatch', action };
      const usedAt = new Date(now).toISOString();
      alias.used_at = usedAt;
      action.status = 'claimed';
      return { ok: true, status: 'claimed', action };
    });
  }

  async complete(actionId: string, status: 'resolved' | 'cancelled'): Promise<void> {
    await this.mutate((ledger) => {
      const action = ledger.actions.find((entry) => entry.action_id === actionId);
      if (!action) throw new Error('telegram_action_not_found');
      action.status = status;
      return undefined;
    });
  }

  private async mutate<T>(fn: (ledger: ActionLedgerFileV1) => T): Promise<T> {
    return withFileLock({ lockPath: `${this.file}.lock`, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const ledger = await readJson<ActionLedgerFileV1>(this.file, { schema: 'sks.telegram-action-ledger.v1', actions: [], aliases: [] });
      if (ledger.schema !== 'sks.telegram-action-ledger.v1') throw new Error('telegram_action_ledger_schema_invalid');
      const result = fn(ledger);
      await writeJsonAtomic(this.file, ledger);
      return result;
    });
  }
}

export class TelegramAuditLedger {
  constructor(private readonly file: string, private readonly salt: string) {}

  async record(input: Omit<TelegramAuditEventV1, 'schema' | 'at' | 'chat_id_hash'> & { chat_id: string }): Promise<TelegramAuditEventV1> {
    const event: TelegramAuditEventV1 = {
      schema: 'sks.telegram-audit.v1',
      at: nowIso(),
      update_id: input.update_id,
      chat_id_hash: `sha256:${sha256(`${this.salt}:${input.chat_id}`)}`,
      topic_id: input.topic_id,
      action_alias: input.action_alias,
      command_kind: sanitizeAuditField(input.command_kind),
      decision: input.decision,
      policy_reason: sanitizeAuditField(input.policy_reason),
      effect_receipt: input.effect_receipt ? sanitizeAuditField(input.effect_receipt) : null
    };
    await appendJsonlBounded(this.file, event, 5 * 1024 * 1024);
    return event;
  }
}

async function readJsonLines(file: string): Promise<Array<Record<string, unknown>>> {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return text.split('\n').filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line) as unknown;
        return value && typeof value === 'object' ? [value as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
  } catch {
    await ensureDir(path.dirname(file));
    return [];
  }
}

function createAlias(): string {
  return crypto.randomBytes(12).toString('base64url');
}

function sanitizeAuditField(value: string): string {
  return value
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/(?:\/Users|\/home|[A-Za-z]:\\)[^\s]+/g, '[path-redacted]')
    .slice(0, 240);
}
