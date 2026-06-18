import fs from 'node:fs';
import path from 'node:path';

export const SKSD_STATE_SCHEMA = 'sks.sksd-state.v1';

export interface SksdState {
  schema: typeof SKSD_STATE_SCHEMA;
  status: 'stopped' | 'running' | 'warm';
  pid: number | null;
  warmed_at: string | null;
  proof_bank_ready: boolean;
  build_proof_ready: boolean;
  ipc_path: string;
  triwiki_index_ready: boolean;
  probe_memoization_ready: boolean;
  stale_cleaned?: boolean;
}

export function sksdStatus(root: string): SksdState {
  const state = readState(root);
  if (!state) return emptyState(root);
  if (state.pid && !pidAlive(state.pid)) {
    const stopped = { ...emptyState(root), stale_cleaned: true };
    writeState(root, stopped);
    return stopped;
  }
  return state;
}

export function sksdWarm(root: string): SksdState {
  const state: SksdState = {
    schema: SKSD_STATE_SCHEMA,
    status: 'warm',
    pid: process.pid,
    warmed_at: new Date().toISOString(),
    ipc_path: ipcPath(root),
    proof_bank_ready: true,
    build_proof_ready: fs.existsSync(path.join(root, 'dist', '.sks-build-proof.json')),
    triwiki_index_ready: fs.existsSync(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json')),
    probe_memoization_ready: fs.existsSync(path.join(root, '.sneakoscope', 'cache', 'probes'))
  };
  writeState(root, state);
  fs.writeFileSync(ipcPath(root), `${JSON.stringify({ schema: 'sks.sksd-ipc.v1', pid: process.pid, command: 'warm', at: new Date().toISOString() }, null, 2)}\n`);
  return state;
}

export function sksdStop(root: string): SksdState {
  const state: SksdState = { ...emptyState(root), status: 'stopped' };
  writeState(root, state);
  try { fs.rmSync(ipcPath(root), { force: true }); } catch {}
  return state;
}

function readState(root: string): SksdState | null {
  const file = statePath(root);
  try {
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as SksdState;
    return json.schema === SKSD_STATE_SCHEMA ? json : null;
  } catch {
    return null;
  }
}

function writeState(root: string, state: SksdState): void {
  const file = statePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function statePath(root: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'sksd-state.json');
}

function emptyState(root = process.cwd()): SksdState {
  return {
    schema: SKSD_STATE_SCHEMA,
    status: 'stopped',
    pid: null,
    warmed_at: null,
    ipc_path: ipcPath(root),
    proof_bank_ready: false,
    build_proof_ready: false,
    triwiki_index_ready: false,
    probe_memoization_ready: false
  };
}

function ipcPath(root: string): string {
  const dir = path.join(root, '.sneakoscope', 'cache', 'sksd');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'sksd.ipc.json');
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
