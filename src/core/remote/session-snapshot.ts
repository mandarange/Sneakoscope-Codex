import path from 'node:path';
import { readJson } from '../fsx.js';
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
