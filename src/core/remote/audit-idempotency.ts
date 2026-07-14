import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import {
  REMOTE_EVENT_SCHEMA,
  type RemoteCommandEnvelopeV1,
  type RemoteCommandReceiptV1,
  type RemoteEventCursorV1,
  type RemoteEventV1
} from './types.js';

interface CommandLedgerEntry {
  readonly idempotency_key: string;
  readonly command_id: string;
  readonly request_hash: string;
  readonly status: 'inflight' | 'completed';
  readonly claimed_at: string;
  readonly completed_at: string | null;
  readonly receipt: RemoteCommandReceiptV1 | null;
}

interface CommandLedgerFile {
  readonly schema: 'sks.remote-command-ledger.v1';
  readonly entries: readonly CommandLedgerEntry[];
}

interface EventJournalFile {
  readonly schema: 'sks.remote-event-journal.v1';
  readonly next_seq: number;
  readonly events: readonly RemoteEventV1[];
}

export type CommandClaimResult =
  | { readonly status: 'claimed'; readonly request_hash: string }
  | { readonly status: 'duplicate_completed'; readonly receipt: RemoteCommandReceiptV1 }
  | { readonly status: 'duplicate_inflight' }
  | { readonly status: 'idempotency_conflict' };

export function remoteRuntimePaths(root: string): {
  readonly root: string;
  readonly commands: string;
  readonly commandLock: string;
  readonly audit: string;
  readonly events: string;
  readonly eventLock: string;
  readonly owners: string;
} {
  const runtimeRoot = path.join(path.resolve(root), '.sneakoscope', 'remote');
  return {
    root: runtimeRoot,
    commands: path.join(runtimeRoot, 'commands.json'),
    commandLock: path.join(runtimeRoot, 'commands.lock'),
    audit: path.join(runtimeRoot, 'audit.jsonl'),
    events: path.join(runtimeRoot, 'events.json'),
    eventLock: path.join(runtimeRoot, 'events.lock'),
    owners: path.join(runtimeRoot, 'owners')
  };
}

export class RemoteCommandLedger {
  private readonly file: string;
  private readonly lockPath: string;
  private readonly maxEntries: number;

  constructor(file: string, options: { lockPath?: string; maxEntries?: number } = {}) {
    this.file = path.resolve(file);
    this.lockPath = path.resolve(options.lockPath ?? `${file}.lock`);
    this.maxEntries = Math.max(16, Math.min(4096, options.maxEntries ?? 512));
  }

  async claim(envelope: RemoteCommandEnvelopeV1): Promise<CommandClaimResult> {
    return withFileLock({ lockPath: this.lockPath, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const ledger = await this.read();
      const requestHash = commandRequestHash(envelope);
      const existing = ledger.entries.find((entry) => entry.idempotency_key === envelope.idempotency_key);
      const sameCommand = ledger.entries.find((entry) => entry.command_id === envelope.command_id);
      if (existing) {
        if (existing.command_id !== envelope.command_id || existing.request_hash !== requestHash) return { status: 'idempotency_conflict' };
        if (existing.status === 'completed' && existing.receipt) return { status: 'duplicate_completed', receipt: existing.receipt };
        return { status: 'duplicate_inflight' };
      }
      if (sameCommand) return { status: 'idempotency_conflict' };
      const next: CommandLedgerEntry = {
        idempotency_key: envelope.idempotency_key,
        command_id: envelope.command_id,
        request_hash: requestHash,
        status: 'inflight',
        claimed_at: nowIso(),
        completed_at: null,
        receipt: null
      };
      await this.write({ schema: 'sks.remote-command-ledger.v1', entries: boundedCommandEntries([...ledger.entries, next], this.maxEntries) });
      return { status: 'claimed', request_hash: requestHash };
    });
  }

  async complete(envelope: RemoteCommandEnvelopeV1, receipt: RemoteCommandReceiptV1): Promise<void> {
    await withFileLock({ lockPath: this.lockPath, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const ledger = await this.read();
      const requestHash = commandRequestHash(envelope);
      const index = ledger.entries.findIndex((entry) => entry.idempotency_key === envelope.idempotency_key);
      if (index < 0) throw new Error('remote_idempotency_claim_missing');
      const existing = ledger.entries[index];
      if (!existing || existing.command_id !== envelope.command_id || existing.request_hash !== requestHash) {
        throw new Error('remote_idempotency_completion_conflict');
      }
      const entries = [...ledger.entries];
      entries[index] = {
        ...existing,
        status: 'completed',
        completed_at: receipt.completed_at,
        receipt: redactRemoteValue(receipt) as unknown as RemoteCommandReceiptV1
      };
      await this.write({ schema: 'sks.remote-command-ledger.v1', entries: boundedCommandEntries(entries, this.maxEntries) });
    });
  }

  private async read(): Promise<CommandLedgerFile> {
    const value = await readJson<CommandLedgerFile>(this.file, { schema: 'sks.remote-command-ledger.v1', entries: [] });
    if (value.schema !== 'sks.remote-command-ledger.v1' || !Array.isArray(value.entries)) {
      throw new Error('remote_command_ledger_invalid');
    }
    return value;
  }

  private async write(value: CommandLedgerFile): Promise<void> {
    await writeJsonAtomic(this.file, value);
  }
}

export class RemoteEventJournal {
  private readonly file: string;
  private readonly lockPath: string;
  private readonly maxEvents: number;

  constructor(file: string, options: { lockPath?: string; maxEvents?: number } = {}) {
    this.file = path.resolve(file);
    this.lockPath = path.resolve(options.lockPath ?? `${file}.lock`);
    this.maxEvents = Math.max(8, Math.min(4096, options.maxEvents ?? 512));
  }

  async append(input: Omit<RemoteEventV1, 'schema' | 'seq' | 'ts'> & { readonly ts?: string }): Promise<RemoteEventV1> {
    return withFileLock({ lockPath: this.lockPath, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const journal = await this.read();
      const event: RemoteEventV1 = {
        schema: REMOTE_EVENT_SCHEMA,
        seq: journal.next_seq,
        ts: input.ts ?? nowIso(),
        type: input.type,
        session_id: input.session_id,
        command_id: input.command_id,
        summary: redactRemoteValue(input.summary) as Record<string, unknown>
      };
      await this.write({
        schema: 'sks.remote-event-journal.v1',
        next_seq: journal.next_seq + 1,
        events: [...journal.events, event].slice(-this.maxEvents)
      });
      return event;
    });
  }

  async watch(afterSeq: number, sessionId?: string): Promise<{ readonly cursor: RemoteEventCursorV1; readonly events: readonly RemoteEventV1[] }> {
    const journal = await this.read();
    const first = journal.events[0]?.seq ?? journal.next_seq;
    const last = journal.events.at(-1)?.seq ?? Math.max(0, journal.next_seq - 1);
    const gap = afterSeq < first - 1;
    const events = gap
      ? []
      : journal.events.filter((event) => event.seq > afterSeq && (!sessionId || event.session_id === sessionId)).slice(0, 128);
    const nextAfter = events.at(-1)?.seq ?? afterSeq;
    return {
      cursor: {
        requested_after_seq: afterSeq,
        first_available_seq: first,
        last_available_seq: last,
        next_after_seq: nextAfter,
        gap
      },
      events
    };
  }

  private async read(): Promise<EventJournalFile> {
    const value = await readJson<EventJournalFile>(this.file, { schema: 'sks.remote-event-journal.v1', next_seq: 1, events: [] });
    if (value.schema !== 'sks.remote-event-journal.v1' || !Number.isSafeInteger(value.next_seq) || value.next_seq < 1 || !Array.isArray(value.events)) {
      throw new Error('remote_event_journal_invalid');
    }
    return value;
  }

  private async write(value: EventJournalFile): Promise<void> {
    await writeJsonAtomic(this.file, value);
  }
}

export class RemoteAuditLog {
  private readonly lockPath: string;

  constructor(private readonly file: string, private readonly maxBytes: number = 1024 * 1024, lockPath?: string) {
    this.lockPath = path.resolve(lockPath ?? `${file}.lock`);
  }

  async append(entry: Record<string, unknown>): Promise<void> {
    await withFileLock({ lockPath: this.lockPath, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      await appendJsonlBounded(this.file, {
        schema: 'sks.remote-audit.v1',
        ts: nowIso(),
        ...(redactRemoteValue(entry) as Record<string, unknown>)
      }, this.maxBytes);
    });
  }
}

export function commandRequestHash(envelope: RemoteCommandEnvelopeV1): string {
  return sha256(stableStringify(envelope));
}

export function redactRemoteValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRemoteValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/(token|secret|password|passwd|cookie|authorization|credential|owner_nonce|private_key|raw_input|prompt|reasoning)/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactRemoteValue(entry);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return value
      .replace(/\b(?:Bearer\s+)?(?:sk|xai)-[A-Za-z0-9_-]{16,}\b/gi, '[REDACTED]')
      .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]');
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function boundedCommandEntries(entries: readonly CommandLedgerEntry[], maxEntries: number): readonly CommandLedgerEntry[] {
  const inflight = entries.filter((entry) => entry.status === 'inflight');
  if (inflight.length > maxEntries) throw new Error('remote_command_ledger_inflight_capacity_exceeded');
  const completedCapacity = maxEntries - inflight.length;
  const completed = completedCapacity > 0
    ? entries.filter((entry) => entry.status === 'completed').slice(-completedCapacity)
    : [];
  const keep = new Set([...inflight, ...completed]);
  return entries.filter((entry) => keep.has(entry));
}
