import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import {
  REMOTE_CODEX_SESSION_BINDINGS_SCHEMA,
  type RemoteCodexSessionBindingV1,
  type RemoteCodexSessionBindingsV1
} from './types.js';

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const THREAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function remoteCodexSessionBindingsPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), '.sneakoscope', 'remote', 'codex-session-bindings.json');
}

export class RemoteCodexSessionBindingStore {
  private readonly file: string;
  private readonly lockPath: string;

  constructor(file: string) {
    this.file = path.resolve(file);
    this.lockPath = `${this.file}.lock`;
  }

  async list(): Promise<RemoteCodexSessionBindingV1[]> {
    const value = await readJson<RemoteCodexSessionBindingsV1>(this.file, {
      schema: REMOTE_CODEX_SESSION_BINDINGS_SCHEMA,
      bindings: []
    });
    if (value.schema !== REMOTE_CODEX_SESSION_BINDINGS_SCHEMA || !Array.isArray(value.bindings)) {
      throw new Error('remote_codex_session_bindings_invalid');
    }
    return value.bindings.map(validateBinding);
  }

  async find(sessionId: string): Promise<RemoteCodexSessionBindingV1 | null> {
    return (await this.list()).find((binding) => binding.session_id === sessionId) ?? null;
  }

  async upsert(input: Omit<RemoteCodexSessionBindingV1, 'created_at' | 'updated_at'> & {
    readonly created_at?: string;
    readonly updated_at?: string;
  }): Promise<RemoteCodexSessionBindingV1> {
    return withFileLock({ lockPath: this.lockPath, timeoutMs: 5_000, staleMs: 30_000 }, async () => {
      const bindings = await this.list();
      const index = bindings.findIndex((binding) => binding.session_id === input.session_id);
      const current = index >= 0 ? bindings[index] : null;
      const at = nowIso();
      const next = validateBinding({
        ...input,
        created_at: input.created_at ?? current?.created_at ?? at,
        updated_at: at
      });
      if (current && (
        current.machine_id !== next.machine_id
        || current.project_id !== next.project_id
        || path.resolve(current.project_root) !== path.resolve(next.project_root)
      )) {
        throw new Error('remote_codex_session_binding_scope_conflict');
      }
      if (index >= 0) bindings[index] = next;
      else bindings.push(next);
      await writeJsonAtomic(this.file, {
        schema: REMOTE_CODEX_SESSION_BINDINGS_SCHEMA,
        bindings
      } satisfies RemoteCodexSessionBindingsV1);
      await fsp.chmod(this.file, 0o600).catch(() => undefined);
      return next;
    });
  }

  async updateTurn(
    sessionId: string,
    turnId: string,
    status: NonNullable<RemoteCodexSessionBindingV1['last_turn_status']>
  ): Promise<RemoteCodexSessionBindingV1> {
    const current = await this.find(sessionId);
    if (!current) throw new Error(`remote_codex_session_binding_unknown:${sessionId}`);
    if (!current.codex_thread_id) throw new Error(`remote_codex_session_binding_thread_pending:${sessionId}`);
    return this.recordTurn(sessionId, current.codex_thread_id, turnId, status);
  }

  async recordTurn(
    sessionId: string,
    codexThreadId: string,
    turnId: string,
    status: NonNullable<RemoteCodexSessionBindingV1['last_turn_status']>
  ): Promise<RemoteCodexSessionBindingV1> {
    const current = await this.find(sessionId);
    if (!current) throw new Error(`remote_codex_session_binding_unknown:${sessionId}`);
    return this.upsert({
      ...current,
      codex_thread_id: codexThreadId,
      last_turn_id: turnId,
      last_turn_status: status
    });
  }
}

export function remoteCodexBindingSessionRow(binding: RemoteCodexSessionBindingV1): Record<string, unknown> {
  const threadReady = Boolean(binding.codex_thread_id);
  return {
    session_id: binding.session_id,
    mission_id: null,
    route: 'telegram-codex',
    phase: binding.last_turn_status === 'failed' ? 'BLOCKED' : 'READY',
    generation: 1,
    updated_at: binding.updated_at,
    session_state: threadReady ? 'idle' : 'pending_first_turn',
    codex_thread_id: binding.codex_thread_id,
    codex_thread_state: threadReady ? 'ready' : 'pending_first_turn',
    dedicated_telegram_thread: true
  };
}

export async function readRemoteCodexBindingSnapshot(
  binding: RemoteCodexSessionBindingV1
): Promise<Record<string, unknown>> {
  const threadReady = Boolean(binding.codex_thread_id);
  const branch = await import('../fsx.js').then(({ runProcess }) => runProcess(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: binding.project_root, timeoutMs: 5_000, maxOutputBytes: 8 * 1024 }
  )).catch(() => null);
  return {
    schema: 'sks.remote-session-snapshot.v1',
    machine_id: binding.machine_id,
    project_id: binding.project_id,
    session_id: binding.session_id,
    mission_id: null,
    route: 'telegram-codex',
    phase: binding.last_turn_status === 'failed' ? 'BLOCKED' : 'READY',
    generation: 1,
    updated_at: binding.updated_at,
    project: {
      name: path.basename(binding.project_root),
      branch: branch?.code === 0 ? String(branch.stdout || '').trim() || null : null
    },
    session_state: threadReady ? 'idle' : 'pending_first_turn',
    execution_terminal: false,
    completion_proof_status: 'not_applicable',
    machine_gates_status: 'not_applicable',
    machine_gates_pass: false,
    trust_status: 'not_applicable',
    completion_verified: false,
    proof_paths: null,
    codex_thread_id: binding.codex_thread_id,
    codex_thread_state: threadReady ? 'ready' : 'pending_first_turn',
    last_turn_id: binding.last_turn_id ?? null,
    last_turn_status: binding.last_turn_status ?? null,
    dedicated_telegram_thread: true
  };
}

function validateBinding(value: RemoteCodexSessionBindingV1): RemoteCodexSessionBindingV1 {
  if (!value || typeof value !== 'object') throw new Error('remote_codex_session_binding_object_required');
  if (!IDENTIFIER_RE.test(String(value.session_id || ''))) throw new Error('remote_codex_session_binding_session_id_invalid');
  if (!IDENTIFIER_RE.test(String(value.machine_id || ''))) throw new Error('remote_codex_session_binding_machine_id_invalid');
  if (!IDENTIFIER_RE.test(String(value.project_id || ''))) throw new Error('remote_codex_session_binding_project_id_invalid');
  if (!path.isAbsolute(String(value.project_root || ''))) throw new Error('remote_codex_session_binding_project_root_invalid');
  if (value.codex_thread_id !== null && !THREAD_ID_RE.test(String(value.codex_thread_id || ''))) {
    throw new Error('remote_codex_session_binding_thread_id_invalid');
  }
  if (!Number.isFinite(Date.parse(String(value.created_at || '')))) throw new Error('remote_codex_session_binding_created_at_invalid');
  if (!Number.isFinite(Date.parse(String(value.updated_at || '')))) throw new Error('remote_codex_session_binding_updated_at_invalid');
  if (value.last_turn_id && !THREAD_ID_RE.test(value.last_turn_id)) throw new Error('remote_codex_session_binding_last_turn_id_invalid');
  if (value.last_turn_status && !['completed', 'failed', 'interrupted'].includes(value.last_turn_status)) {
    throw new Error('remote_codex_session_binding_last_turn_status_invalid');
  }
  return {
    ...value,
    project_root: path.resolve(value.project_root)
  };
}
