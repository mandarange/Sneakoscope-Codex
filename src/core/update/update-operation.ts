import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomId, writeJsonAtomic } from '../fsx.js';

export const UPDATE_OPERATION_SCHEMA = 'sks.update-operation.v1' as const;

export type UpdateOperationState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'terminal_uncertain'
  | 'rolled_back';

export interface UpdateOperationStageReceipt {
  id: string;
  ok: boolean;
  status: string;
  updated_at: string;
  detail: Record<string, unknown>;
}

export interface UpdateOperationReceipt {
  schema: typeof UPDATE_OPERATION_SCHEMA;
  id: string;
  kind: 'update' | 'rollback';
  state: UpdateOperationState;
  current_stage: string | null;
  started_at: string;
  updated_at: string;
  from_version: string;
  target_version: string | null;
  previous_version: string;
  rollback_command: string;
  side_effects_started: boolean;
  stages: UpdateOperationStageReceipt[];
  result_status: string | null;
  public_error: string | null;
  receipt_path: string;
}

export type UpdateRollbackAuthorization =
  | { ok: true; receipt: UpdateOperationReceipt; receiptPath: string }
  | { ok: false; blocker: string; receiptPath: string | null };

const ROLLBACK_RECEIPT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class UpdateOperationRecorder {
  readonly receiptPath: string;
  private receipt: UpdateOperationReceipt;
  private writes: Promise<void> = Promise.resolve();
  private readonly env: NodeJS.ProcessEnv;

  private constructor(input: {
    env: NodeJS.ProcessEnv;
    kind: 'update' | 'rollback';
    fromVersion: string;
    targetVersion: string | null;
    now: Date;
  }) {
    this.env = input.env;
    const id = `update-${input.now.toISOString().replace(/[:.]/g, '-')}-${randomId(8)}`;
    this.receiptPath = updateOperationReceiptPath(id, input.env);
    this.receipt = {
      schema: UPDATE_OPERATION_SCHEMA,
      id,
      kind: input.kind,
      state: 'queued',
      current_stage: null,
      started_at: input.now.toISOString(),
      updated_at: input.now.toISOString(),
      from_version: input.fromVersion,
      target_version: input.targetVersion,
      previous_version: input.fromVersion,
      rollback_command: `sks update rollback --version ${input.fromVersion} --json`,
      side_effects_started: false,
      stages: [],
      result_status: null,
      public_error: null,
      receipt_path: this.receiptPath
    };
  }

  static async create(input: {
    env?: NodeJS.ProcessEnv;
    kind?: 'update' | 'rollback';
    fromVersion: string;
    targetVersion: string | null;
    now?: Date;
  }): Promise<UpdateOperationRecorder> {
    const recorder = new UpdateOperationRecorder({
      env: input.env || process.env,
      kind: input.kind || 'update',
      fromVersion: input.fromVersion,
      targetVersion: input.targetVersion,
      now: input.now || new Date()
    });
    recorder.enqueueWrite();
    await recorder.flush();
    return recorder;
  }

  recordStage(id: string, ok: boolean, status: string, detail: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    const stage: UpdateOperationStageReceipt = {
      id,
      ok,
      status: String(status || (ok ? 'completed' : 'failed')).slice(0, 120),
      updated_at: now,
      detail: publicDetail(detail, this.env)
    };
    const existing = this.receipt.stages.findIndex((entry) => entry.id === id);
    if (existing >= 0) this.receipt.stages[existing] = stage;
    else this.receipt.stages.push(stage);
    this.receipt.state = 'running';
    this.receipt.current_stage = id;
    this.receipt.updated_at = now;
    const skippedSideEffect = /^(dry_run|skipped(?:_|$)|already_current)/.test(stage.status);
    if (['global_install', 'menubar_rebuild'].includes(id) && !skippedSideEffect) {
      this.receipt.side_effects_started = true;
    }
    this.enqueueWrite();
  }

  async finish(input: {
    state: Exclude<UpdateOperationState, 'queued' | 'running'>;
    resultStatus: string;
    error?: string | null;
  }): Promise<UpdateOperationReceipt> {
    this.receipt.state = input.state;
    this.receipt.result_status = input.resultStatus;
    this.receipt.public_error = input.error ? publicString(input.error, this.env) : null;
    this.receipt.updated_at = new Date().toISOString();
    this.enqueueWrite();
    await this.flush();
    return structuredClone(this.receipt);
  }

  async flush(): Promise<void> {
    await this.writes;
  }

  snapshot(): UpdateOperationReceipt {
    return structuredClone(this.receipt);
  }

  private enqueueWrite(): void {
    const snapshot = structuredClone(this.receipt);
    const latestPath = updateOperationLatestPath(this.env);
    this.writes = this.writes.then(async () => {
      await writeJsonAtomic(this.receiptPath, snapshot);
      await fs.chmod(this.receiptPath, 0o600).catch(() => undefined);
      await writeJsonAtomic(latestPath, snapshot);
      await fs.chmod(latestPath, 0o600).catch(() => undefined);
    });
  }
}

export function updateOperationReceiptPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = String(env.SKS_UPDATE_OPERATION_RECEIPT_PATH || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(updateGlobalRoot(env), 'operations', `${id}.json`);
}

export function updateOperationLatestPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(updateGlobalRoot(env), 'operations', 'update-latest.json');
}

export async function authorizeUpdateRollback(input: {
  targetVersion: string;
  currentVersion: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<UpdateRollbackAuthorization> {
  const env = input.env || process.env;
  const latestPath = updateOperationLatestPath(env);
  const operationsDir = path.dirname(latestPath);
  const latest = await readRollbackReceipt(latestPath, operationsDir).catch(() => null);
  if (!latest) return { ok: false, blocker: 'rollback_receipt_required', receiptPath: null };
  const receiptPath = path.resolve(latest.receipt_path || '');
  const source = await readRollbackReceipt(receiptPath, operationsDir).catch(() => null);
  if (!source) return { ok: false, blocker: 'rollback_receipt_invalid', receiptPath };
  if (!sameRollbackReceipt(latest, source)) {
    return { ok: false, blocker: 'rollback_receipt_changed', receiptPath };
  }
  if (source.kind !== 'update') return { ok: false, blocker: 'rollback_receipt_not_update', receiptPath };
  const completedInstall = isTerminalUpdateReceipt(source)
    && source.side_effects_started === true
    && hasConfirmedGlobalInstall(source);
  if (!completedInstall) return { ok: false, blocker: 'rollback_receipt_not_install', receiptPath };
  if (source.previous_version !== input.targetVersion) {
    return { ok: false, blocker: 'rollback_target_not_previous_version', receiptPath };
  }
  if (source.target_version !== input.currentVersion) {
    return { ok: false, blocker: 'rollback_receipt_not_current_install', receiptPath };
  }
  const updatedAt = Date.parse(source.updated_at);
  const now = (input.now || new Date()).getTime();
  if (!Number.isFinite(updatedAt) || updatedAt > now + 60_000 || now - updatedAt > ROLLBACK_RECEIPT_MAX_AGE_MS) {
    return { ok: false, blocker: 'rollback_receipt_stale', receiptPath };
  }
  return { ok: true, receipt: source, receiptPath };
}

function isTerminalUpdateReceipt(receipt: UpdateOperationReceipt): boolean {
  return receipt.state === 'succeeded'
    || receipt.state === 'failed'
    || receipt.state === 'terminal_uncertain';
}

function hasConfirmedGlobalInstall(receipt: UpdateOperationReceipt): boolean {
  if (!Array.isArray(receipt.stages)) return false;
  const installStages = receipt.stages.filter((stage) => stage?.id === 'global_install');
  if (installStages.length !== 1) return false;
  const install = installStages[0];
  if (!install || install.ok !== true || !['installed', 'fake_installed'].includes(install.status)) return false;
  if (!install.detail || typeof install.detail !== 'object') return false;
  return install.detail.code === 0 && install.detail.timed_out !== true;
}

function updateGlobalRoot(env: NodeJS.ProcessEnv): string {
  return env.SKS_GLOBAL_ROOT
    ? path.resolve(env.SKS_GLOBAL_ROOT)
    : path.join(env.HOME || os.homedir(), '.sneakoscope-global');
}

async function readRollbackReceipt(file: string, operationsDir: string): Promise<UpdateOperationReceipt> {
  const resolved = path.resolve(file);
  const relative = path.relative(path.resolve(operationsDir), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('rollback_receipt_path_invalid');
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('rollback_receipt_file_invalid');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('rollback_receipt_permissions_invalid');
  const value = JSON.parse(await fs.readFile(resolved, 'utf8')) as UpdateOperationReceipt;
  if (value?.schema !== UPDATE_OPERATION_SCHEMA || typeof value.id !== 'string' || typeof value.receipt_path !== 'string') {
    throw new Error('rollback_receipt_schema_invalid');
  }
  return value;
}

function sameRollbackReceipt(left: UpdateOperationReceipt, right: UpdateOperationReceipt): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'undefined' : encoded;
}

function publicDetail(value: Record<string, unknown>, env: NodeJS.ProcessEnv): Record<string, unknown> {
  return redactValue(value, env, 0) as Record<string, unknown>;
}

function redactValue(value: unknown, env: NodeJS.ProcessEnv, depth: number): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return publicString(value, env);
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactValue(entry, env, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 80)) {
    output[key] = /secret|token|api[_-]?key|authorization/i.test(key)
      ? '[redacted]'
      : redactValue(entry, env, depth + 1);
  }
  return output;
}

function publicString(value: string, env: NodeJS.ProcessEnv): string {
  let text = String(value || '').replace(/[\r\n]+/g, ' ');
  const home = env.HOME || os.homedir();
  if (home) text = text.replaceAll(home, '~');
  return text
    .replace(/sk-(?:proj|or-v1|clb)?-?[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/(api[_-]?key|secret|token|authorization)\s*[:=]\s*[^\s"',}]+/gi, '$1=[redacted]')
    .slice(0, 500);
}
