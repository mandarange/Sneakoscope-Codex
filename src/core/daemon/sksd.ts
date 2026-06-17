import fs from 'node:fs';
import path from 'node:path';

export const SKSD_STATE_SCHEMA = 'sks.sksd-state.v1';

export interface SksdState {
  schema: typeof SKSD_STATE_SCHEMA;
  status: 'stopped' | 'warm';
  pid: number | null;
  warmed_at: string | null;
  proof_bank_ready: boolean;
  build_proof_ready: boolean;
}

export function sksdStatus(root: string): SksdState {
  const state = readState(root);
  return state || emptyState();
}

export function sksdWarm(root: string): SksdState {
  const state: SksdState = {
    schema: SKSD_STATE_SCHEMA,
    status: 'warm',
    pid: process.pid,
    warmed_at: new Date().toISOString(),
    proof_bank_ready: true,
    build_proof_ready: fs.existsSync(path.join(root, 'dist', '.sks-build-proof.json'))
  };
  writeState(root, state);
  return state;
}

export function sksdStop(root: string): SksdState {
  const state: SksdState = { ...emptyState(), status: 'stopped' };
  writeState(root, state);
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

function emptyState(): SksdState {
  return {
    schema: SKSD_STATE_SCHEMA,
    status: 'stopped',
    pid: null,
    warmed_at: null,
    proof_bank_ready: false,
    build_proof_ready: false
  };
}
