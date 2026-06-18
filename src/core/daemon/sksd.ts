import fs from 'node:fs';
import path from 'node:path';
import { summarizeTriWikiProofBank } from '../triwiki/triwiki-proof-bank.js';
import { runBuildOnce } from '../build/build-once-runner.js';
import { writeSksdIpcResponse, type SksdRequest } from './sksd-ipc.js';

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
  protocol_ok?: boolean;
  last_response_path?: string | null;
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
  const proofBank = summarizeTriWikiProofBank(root);
  const buildProof = maybeWarmBuildOnce(root);
  const probeDir = path.join(root, '.sneakoscope', 'cache', 'probes');
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, 'sksd-warm.json'), `${JSON.stringify({ schema: 'sks.sksd-probe-warm.v1', warmed_at: new Date().toISOString() }, null, 2)}\n`);
  const state: SksdState = {
    schema: SKSD_STATE_SCHEMA,
    status: 'warm',
    pid: process.pid,
    warmed_at: new Date().toISOString(),
    ipc_path: ipcPath(root),
    proof_bank_ready: proofBank.ok,
    build_proof_ready: buildProof || fs.existsSync(path.join(root, 'dist', '.sks-build-proof.json')),
    triwiki_index_ready: fs.existsSync(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json')),
    probe_memoization_ready: fs.existsSync(path.join(root, '.sneakoscope', 'cache', 'probes')),
    protocol_ok: true,
    last_response_path: null
  };
  writeState(root, state);
  fs.writeFileSync(ipcPath(root), `${JSON.stringify({ schema: 'sks.sksd-ipc.v1', pid: process.pid, command: 'warm', at: new Date().toISOString() }, null, 2)}\n`);
  return state;
}

export function sksdStart(root: string): SksdState {
  const state: SksdState = {
    ...sksdWarm(root),
    status: 'running',
    pid: process.pid,
    protocol_ok: true
  };
  writeState(root, state);
  return state;
}

export function handleSksdRequest(root: string, request: SksdRequest): unknown {
  let response: unknown;
  if (request.type === 'status') response = sksdStatus(root);
  else if (request.type === 'warm') response = sksdWarm(request.root);
  else if (request.type === 'proof-bank-status') response = summarizeTriWikiProofBank(request.root);
  else if (request.type === 'triwiki-index') response = { schema: 'sks.sksd-triwiki-index.v1', ok: fs.existsSync(path.join(request.root, '.sneakoscope', 'wiki', 'context-pack.json')), path: path.join(request.root, '.sneakoscope', 'wiki', 'context-pack.json') };
  else if (request.type === 'build-once') response = runBuildOnce({ root: request.root, mode: request.mode });
  else if (request.type === 'probe') response = writeProbeResponse(request.root, request.probe_id);
  else response = sksdStop(root);
  const responsePath = writeSksdIpcResponse(root, request, response);
  const state = sksdStatus(root);
  writeState(root, { ...state, protocol_ok: true, last_response_path: responsePath });
  return response;
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

function maybeWarmBuildOnce(root: string): boolean {
  if (!fs.existsSync(path.join(root, 'tsconfig.json')) || !fs.existsSync(path.join(root, 'src'))) return false;
  if (process.env.SKS_SKSD_SKIP_BUILD_ONCE === '1') return fs.existsSync(path.join(root, 'dist', '.sks-build-proof.json'));
  try {
    return runBuildOnce({ root, mode: 'incremental' }).ok;
  } catch {
    return false;
  }
}

function writeProbeResponse(root: string, probeId: string): { schema: 'sks.sksd-probe-response.v1'; ok: boolean; path: string } {
  const file = path.join(root, '.sneakoscope', 'cache', 'probes', `${probeId.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.sksd-probe-response.v1', probe_id: probeId, ok: true, at: new Date().toISOString() }, null, 2)}\n`);
  return { schema: 'sks.sksd-probe-response.v1', ok: true, path: file };
}
