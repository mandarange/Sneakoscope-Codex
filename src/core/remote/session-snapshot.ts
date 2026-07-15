import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, runProcess } from '../fsx.js';
import { listSessionStates, missionDir, stateFile } from '../mission.js';
import { readRouteProof } from '../proof/proof-reader.js';
import { trustReportPath } from '../trust-kernel/trust-report.js';

export type RemoteSessionJson = Record<string, unknown>;

export interface RemoteSessionRecord {
  readonly session_id: string;
  readonly state: RemoteSessionJson;
}

export async function remoteSessionRecords(root: string): Promise<readonly RemoteSessionRecord[]> {
  const rows = await listSessionStates(root);
  if (rows.length) return rows.map((row) => ({ session_id: row.session_key, state: row.state as RemoteSessionJson }));
  const legacy = await readJson<RemoteSessionJson>(stateFile(root), {} as RemoteSessionJson).catch((): RemoteSessionJson => ({}));
  if (!legacy.mission_id) return [];
  return [{ session_id: String(legacy._session_key ?? 'default'), state: legacy }];
}

export async function remoteSessionRecord(root: string, sessionId: string): Promise<RemoteSessionRecord> {
  const session = (await remoteSessionRecords(root)).find((candidate) => candidate.session_id === sessionId);
  if (!session) throw new Error(`remote_session_unknown:${sessionId}`);
  return session;
}

export async function listRemoteSessionRows(root: string): Promise<readonly RemoteSessionJson[]> {
  return (await remoteSessionRecords(root)).map(({ session_id, state }) => ({
    session_id,
    mission_id: stringOrNull(state.mission_id),
    route: stringOrNull(state.route_command ?? state.route ?? state.mode),
    phase: stringOrNull(state.phase),
    generation: remoteSessionGeneration(state),
    updated_at: stringOrNull(state.updated_at),
    session_state: remoteSessionState(state)
  }));
}

export async function readRemoteSessionSnapshot(input: {
  readonly root: string;
  readonly machineId: string;
  readonly projectId: string;
  readonly sessionId: string;
}): Promise<RemoteSessionJson> {
  const session = await remoteSessionRecord(input.root, input.sessionId);
  const missionId = stringOrNull(session.state.mission_id);
  const proof = missionId ? await readRouteProof(input.root, missionId).catch(() => null) : null;
  const trust = missionId ? await readJson<RemoteSessionJson | null>(trustReportPath(input.root, missionId), null).catch(() => null) : null;
  const executionTerminal = isTerminalPhase(String(session.state.phase ?? ''));
  const proofRecord = proof as unknown as {
    readonly status?: string;
    readonly gate_status?: string;
    readonly evidence?: { readonly gates?: { readonly status?: string; readonly ok?: boolean } };
  } | null;
  const proofValid = proofRecord?.status === 'verified' || proofRecord?.status === 'verified_partial';
  const gateStatus = String(proofRecord?.evidence?.gates?.status ?? proofRecord?.gate_status ?? 'not_recorded');
  const gatesPass = gateStatus === 'passed' || gateStatus === 'verified' || proofRecord?.evidence?.gates?.ok === true;
  const trustAcceptable = trust?.ok === true || trust?.status === 'verified' || trust?.status === 'verified_partial';
  const branchResult = await runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: input.root,
    timeoutMs: 5_000,
    maxOutputBytes: 8 * 1024
  }).catch(() => null);
  return {
    schema: 'sks.remote-session-snapshot.v1',
    machine_id: input.machineId,
    project_id: input.projectId,
    session_id: input.sessionId,
    mission_id: missionId,
    route: stringOrNull(session.state.route_command ?? session.state.route ?? session.state.mode),
    phase: stringOrNull(session.state.phase),
    generation: remoteSessionGeneration(session.state),
    updated_at: stringOrNull(session.state.updated_at),
    project: {
      name: path.basename(path.resolve(input.root)),
      branch: branchResult?.code === 0 ? stringOrNull(branchResult.stdout) : null
    },
    session_state: remoteSessionState(session.state),
    execution_terminal: executionTerminal,
    completion_proof_status: proofRecord?.status ?? 'not_verified',
    machine_gates_status: gateStatus,
    machine_gates_pass: gatesPass,
    trust_status: trust?.status ?? 'not_verified',
    completion_verified: executionTerminal && proofValid && gatesPass && trustAcceptable,
    proof_paths: missionId ? {
      completion_proof: path.relative(input.root, path.join(missionDir(input.root, missionId), 'completion-proof.json')),
      trust_report: path.relative(input.root, trustReportPath(input.root, missionId))
    } : null
  };
}

export async function readRemoteSessionView(input: {
  readonly root: string;
  readonly machineId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly view: string;
}): Promise<RemoteSessionJson> {
  const snapshot = await readRemoteSessionSnapshot(input);
  const view = normalizeView(input.view);
  if (view === 'status' || view === 'refresh' || view === 'open' || view === 'verify') {
    return { ...snapshot, requested_view: view };
  }
  if (view === 'diff') {
    const [status, stat] = await Promise.all([
      runProcess('git', ['status', '--short'], { cwd: input.root, timeoutMs: 5_000, maxOutputBytes: 32 * 1024 }),
      runProcess('git', ['diff', '--stat', '--'], { cwd: input.root, timeoutMs: 5_000, maxOutputBytes: 32 * 1024 })
    ]);
    return {
      ...snapshot,
      requested_view: view,
      diff: {
        status: publicLines(status.stdout, 80),
        stat: publicLines(stat.stdout, 80),
        truncated: status.truncated || stat.truncated
      }
    };
  }
  const session = await remoteSessionRecord(input.root, input.sessionId);
  const missionId = stringOrNull(session.state.mission_id);
  if (!missionId) return { ...snapshot, requested_view: view, view_status: 'mission_not_available' };
  const dir = missionDir(input.root, missionId);
  if (view === 'tail') {
    return { ...snapshot, requested_view: view, events: await publicEventTail(path.join(dir, 'events.jsonl')) };
  }
  if (view === 'artifacts') {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    return {
      ...snapshot,
      requested_view: view,
      artifacts: entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name).sort().slice(0, 128)
    };
  }
  if (view === 'gates') {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    const gates: Array<Record<string, unknown>> = [];
    for (const entry of entries.filter((candidate) => candidate.isFile() && /gate\.json$/i.test(candidate.name)).slice(0, 64)) {
      const value = await readJson<Record<string, unknown> | null>(path.join(dir, entry.name), null).catch(() => null);
      gates.push({ file: entry.name, ...publicVerdict(value) });
    }
    return { ...snapshot, requested_view: view, gates };
  }
  if (view === 'trust') {
    const value = await readJson<Record<string, unknown> | null>(trustReportPath(input.root, missionId), null).catch(() => null);
    return { ...snapshot, requested_view: view, trust: publicVerdict(value) };
  }
  const value = await readJson<Record<string, unknown> | null>(path.join(dir, 'completion-proof.json'), null).catch(() => null);
  return { ...snapshot, requested_view: 'proof', proof: publicVerdict(value) };
}

export function remoteSessionGeneration(state: RemoteSessionJson): number {
  for (const candidate of [state.active_generation, state.generation_index, state.generation]) {
    const value = Number(candidate);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  return 1;
}

function remoteSessionState(state: RemoteSessionJson): 'idle' | 'active' | 'terminal' | 'blocked' {
  const phase = String(state.phase ?? '');
  if (/BLOCKED|REVOKED/i.test(phase)) return 'blocked';
  if (isTerminalPhase(phase) || state.route_closed === true) return 'terminal';
  if (state.mission_id) return 'active';
  return 'idle';
}

function isTerminalPhase(phase: string): boolean {
  return /(?:DONE|COMPLETE|COMPLETED|CLOSED|TERMINAL)$/i.test(phase);
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeView(value: string): 'status' | 'tail' | 'diff' | 'gates' | 'trust' | 'proof' | 'artifacts' | 'refresh' | 'open' | 'verify' {
  const view = String(value || '').toLowerCase();
  return ['status', 'tail', 'diff', 'gates', 'trust', 'proof', 'artifacts', 'refresh', 'open', 'verify'].includes(view)
    ? view as ReturnType<typeof normalizeView>
    : 'status';
}

async function publicEventTail(file: string): Promise<Array<Record<string, unknown>>> {
  const text = await fsp.readFile(file, 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).slice(-50).flatMap((line) => {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      return [{
        at: stringOrNull(value.at ?? value.ts ?? value.occurred_at),
        type: stringOrNull(value.type ?? value.event ?? value.event_name),
        phase: stringOrNull(value.phase),
        status: stringOrNull(value.status ?? value.outcome)
      }];
    } catch {
      return [];
    }
  });
}

function publicVerdict(value: Record<string, unknown> | null): Record<string, unknown> {
  if (!value) return { status: 'not_recorded', ok: false };
  const missing = Array.isArray(value.missing) ? value.missing.map(String).slice(0, 64) : [];
  const blockers = Array.isArray(value.blockers) ? value.blockers.map(String).slice(0, 64) : [];
  return {
    schema: stringOrNull(value.schema),
    status: stringOrNull(value.status ?? value.gate_status),
    ok: value.ok === true,
    missing: publicLines(missing.join('\n'), 64),
    blockers: publicLines(blockers.join('\n'), 64)
  };
}

function publicLines(value: string, max: number): string[] {
  const home = process.env.HOME ? path.resolve(process.env.HOME) : '';
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(0, max).map((line) => line
    .replace(home, '~')
    .replace(/\b(?:Bearer\s+)?(?:sk|xai)-[A-Za-z0-9_-]{16,}\b/gi, '[redacted]')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
    .slice(0, 500));
}
