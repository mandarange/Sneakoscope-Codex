import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, sha256, writeJsonAtomic } from '../../fsx.js';
import { findLatestMission, missionDir } from '../../mission.js';
import { withMadSksSqlPlaneLock } from './lock.js';
import { MAD_SKS_SQL_PLANE_POLICY, type MadSksSqlPlaneOperationClass } from './policy.js';
import {
  MAD_SKS_SQL_PLANE_CAPABILITY_FILE,
  MAD_SKS_SQL_PLANE_CLOSED_CAPABILITY_FILE,
  MAD_SKS_SQL_PLANE_LEDGER_FILE,
  madSksSqlPlaneDir,
  madSksSqlPlaneRelativePath
} from './paths.js';

export const MAD_SKS_SQL_PLANE_CAPABILITY_SCHEMA = 'sks.mad-sks-sql-plane-capability.v2' as const;
export { MAD_SKS_SQL_PLANE_CAPABILITY_FILE } from './paths.js';
export const MAD_SKS_SQL_PLANE_ACK = 'I AUTHORIZE ONE-CYCLE DB BREAK-GLASS';
export const MAD_SKS_SQL_PLANE_DEFAULT_TTL_MS = MAD_SKS_SQL_PLANE_POLICY.ttl.default_ms;
export const MAD_SKS_SQL_PLANE_MAX_TTL_MS = MAD_SKS_SQL_PLANE_POLICY.ttl.hard_max_ms;

export interface MadSksSqlPlaneCapabilityV2 {
  schema: typeof MAD_SKS_SQL_PLANE_CAPABILITY_SCHEMA;
  revision: number;
  mission_id: string;
  cycle_id: string;
  project_root_hash: string;
  project_ref: string;
  target_environment: 'local' | 'branch' | 'preview' | 'production';
  allowed_schemas: string[];
  codex_thread_id: string | null;
  runtime_session_id: string;
  operator_intent_hash: string;
  operator_ack_hash: string;
  scope: {
    sql_plane: 'all_mutations';
    control_plane: 'deny';
    operations: MadSksSqlPlaneOperationClass[];
  };
  transport: {
    profile_path: string;
    profile_sha256: string;
    server_url_redacted: string;
    features: ['database'];
    write_capable: true;
  };
  issued_at: string;
  expires_at: string;
  closed_at: string | null;
  status: 'issued' | 'transport_ready' | 'active' | 'closing' | 'closed' | 'revoked' | 'expired' | 'quarantined';
  counters: {
    attempts: number;
    reserved: number;
    succeeded: number;
    failed: number;
  };
}

export type MadSksSqlPlaneCapability = MadSksSqlPlaneCapabilityV2;

export async function createMadSksSqlPlaneCapability(root: string, input: {
  missionId: string;
  ack: string;
  cwd?: string;
  cycleId?: string;
  ttlMs?: number | undefined;
  projectRef?: string;
  targetEnvironment?: MadSksSqlPlaneCapabilityV2['target_environment'];
  allowedSchemas?: string[];
  codexThreadId?: string | null;
  runtimeSessionId?: string;
  operatorIntent?: string;
  profilePath?: string;
  profileSha256?: string;
  serverUrlRedacted?: string;
  operations?: MadSksSqlPlaneOperationClass[];
  status?: MadSksSqlPlaneCapabilityV2['status'];
}): Promise<MadSksSqlPlaneCapabilityV2> {
  if (input.ack !== MAD_SKS_SQL_PLANE_ACK) throw new Error('mad_sks_sql_plane_ack_phrase_mismatch');
  const createdAt = nowIso();
  const ttlMs = Math.min(MAD_SKS_SQL_PLANE_MAX_TTL_MS, Math.max(1, Math.floor(Number(input.ttlMs || MAD_SKS_SQL_PLANE_DEFAULT_TTL_MS))));
  const projectRef = String(input.projectRef || process.env.SKS_MAD_SKS_SQL_PLANE_PROJECT_REF || process.env.SKS_MAD_SKS_SQL_PLANE_E2E_PROJECT_REF || 'fixture-project-ref').trim();
  const profilePath = input.profilePath || `.sneakoscope/missions/<mission>/${madSksSqlPlaneRelativePath('runtime', 'codex-mad-sks-sql-plane.config.toml')}`;
  const profileSha256 = input.profileSha256 || sha256(`${input.missionId}:${projectRef}:placeholder-profile`);
  const capability: MadSksSqlPlaneCapabilityV2 = {
    schema: MAD_SKS_SQL_PLANE_CAPABILITY_SCHEMA,
    revision: 1,
    mission_id: input.missionId,
    cycle_id: input.cycleId || `mad-sks-sql-plane-${Date.now().toString(36)}`,
    project_root_hash: sha256(path.resolve(input.cwd || root)).slice(0, 24),
    project_ref: projectRef,
    target_environment: input.targetEnvironment || 'production',
    allowed_schemas: input.allowedSchemas?.length ? input.allowedSchemas : ['public'],
    codex_thread_id: input.codexThreadId ?? null,
    runtime_session_id: input.runtimeSessionId || `mad-sks-sql-plane-session-${Date.now().toString(36)}`,
    operator_intent_hash: sha256(input.operatorIntent || input.ack || 'mad-sks-sql-plane').slice(0, 32),
    operator_ack_hash: sha256(input.ack).slice(0, 32),
    scope: {
      sql_plane: 'all_mutations',
      control_plane: 'deny',
      operations: input.operations?.length ? input.operations : [...MAD_SKS_SQL_PLANE_POLICY.sql_plane_allowed]
    },
    transport: {
      profile_path: profilePath,
      profile_sha256: profileSha256,
      server_url_redacted: input.serverUrlRedacted || 'https://mcp.supabase.com/mcp?project_ref=<redacted>&features=database',
      features: ['database'],
      write_capable: true
    },
    issued_at: createdAt,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    closed_at: null,
    status: input.status || 'issued',
    counters: {
      attempts: 0,
      reserved: 0,
      succeeded: 0,
      failed: 0
    }
  };
  const dir = madSksSqlPlaneDir(root, input.missionId);
  await writeJsonAtomic(path.join(dir, MAD_SKS_SQL_PLANE_CAPABILITY_FILE), capability);
  await appendJsonlBounded(path.join(dir, MAD_SKS_SQL_PLANE_LEDGER_FILE), {
    ts: nowIso(),
    type: 'capability.created',
    schema: capability.schema,
    mission_id: capability.mission_id,
    cycle_id: capability.cycle_id,
    project_ref_hash: sha256(capability.project_ref).slice(0, 16),
    runtime_session_id: capability.runtime_session_id,
    expires_at: capability.expires_at,
    status: capability.status
  });
  return capability;
}

export async function readMadSksSqlPlaneCapability(root: string, missionId: string): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  const value = await readJson<any>(path.join(madSksSqlPlaneDir(root, missionId), MAD_SKS_SQL_PLANE_CAPABILITY_FILE), null);
  if (value?.schema === MAD_SKS_SQL_PLANE_CAPABILITY_SCHEMA) return value as MadSksSqlPlaneCapabilityV2;
  return null;
}

export async function resolveMadSksSqlPlaneMissionId(root: string, state: any = {}, explicitMissionId: string | null = null) {
  if (explicitMissionId && explicitMissionId !== 'latest') return explicitMissionId;
  if (state?.mad_sks_sql_plane_capability_mission_id) return String(state.mad_sks_sql_plane_capability_mission_id);
  if (state?.mission_id) return String(state.mission_id);
  return findLatestMission(root, { mode: 'mad-sks' });
}

export function isMadSksSqlPlaneCapabilityActive(capability: MadSksSqlPlaneCapabilityV2 | null, nowMs = Date.now()) {
  if (!capability) return false;
  const expires = Date.parse(capability.expires_at || '');
  return capability.schema === MAD_SKS_SQL_PLANE_CAPABILITY_SCHEMA
    && ['transport_ready', 'active'].includes(capability.status)
    && Boolean(capability.project_ref)
    && capability.transport?.write_capable === true
    && capability.transport?.features?.[0] === 'database'
    && Number.isFinite(expires)
    && expires > nowMs;
}

export async function activateMadSksSqlPlaneCapability(root: string, missionId: string): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  return updateMadSksSqlPlaneCapability(root, missionId, (capability) => ({
    ...capability,
    status: capability.status === 'issued' ? 'active' : capability.status
  }));
}

export async function markMadSksSqlPlaneTransportReady(root: string, missionId: string): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  return updateMadSksSqlPlaneCapability(root, missionId, (capability) => ({
    ...capability,
    status: capability.status === 'issued' ? 'transport_ready' : capability.status
  }));
}

export async function updateMadSksSqlPlaneCapabilityCounters(root: string, missionId: string, delta: {
  attemptsDelta?: number;
  reservedDelta?: number;
  succeededDelta?: number;
  failedDelta?: number;
}): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  return updateMadSksSqlPlaneCapability(root, missionId, (capability) => ({
    ...capability,
    counters: {
      attempts: capability.counters.attempts + Number(delta.attemptsDelta || 0),
      reserved: capability.counters.reserved + Number(delta.reservedDelta || 0),
      succeeded: capability.counters.succeeded + Number(delta.succeededDelta || 0),
      failed: capability.counters.failed + Number(delta.failedDelta || 0)
    }
  }));
}

export async function updateMadSksSqlPlaneCapability(root: string, missionId: string, mutator: (capability: MadSksSqlPlaneCapabilityV2) => MadSksSqlPlaneCapabilityV2): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  return withMadSksSqlPlaneLock(root, missionId, 'capability', async () => {
    const current = await readMadSksSqlPlaneCapability(root, missionId);
    if (!current) return null;
    const next = mutator(current);
    const updated: MadSksSqlPlaneCapabilityV2 = {
      ...next,
      revision: Number(current.revision || 0) + 1
    };
    const dir = madSksSqlPlaneDir(root, missionId);
    await writeJsonAtomic(path.join(dir, MAD_SKS_SQL_PLANE_CAPABILITY_FILE), updated);
    await appendJsonlBounded(path.join(dir, MAD_SKS_SQL_PLANE_LEDGER_FILE), {
      ts: nowIso(),
      type: 'capability.updated',
      mission_id: missionId,
      cycle_id: updated.cycle_id,
      revision: updated.revision,
      status: updated.status,
      counters: updated.counters
    });
    return updated;
  });
}

export async function recordMadSksSqlPlaneOperation(root: string, missionId: string, input: { operationId?: string; toolName?: string; sqlHash?: string } = {}) {
  const capability = await readMadSksSqlPlaneCapability(root, missionId);
  if (!capability) return null;
  await appendJsonlBounded(path.join(madSksSqlPlaneDir(root, missionId), MAD_SKS_SQL_PLANE_LEDGER_FILE), {
    ts: nowIso(),
    type: 'db_operation.recorded',
    mission_id: missionId,
    cycle_id: capability.cycle_id,
    operation_id: input.operationId || null,
    tool_name: input.toolName || null,
    sql_hash: input.sqlHash || null
  });
  return capability;
}

export async function consumeMadSksSqlPlaneCapability(root: string, missionId: string, input: { consumedBy?: string; reason?: string } = {}) {
  return closeMadSksSqlPlaneCycle(root, missionId, '', input.consumedBy || input.reason || 'mad_sks_sql_plane_cycle_closed');
}

export async function closeMadSksSqlPlaneCycle(root: string, missionId: string, cycleId = '', reason = 'mad_sks_sql_plane_cycle_closed'): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  const closed = await updateMadSksSqlPlaneCapability(root, missionId, (capability) => {
    if (cycleId && capability.cycle_id !== cycleId) return capability;
    return {
      ...capability,
      status: capability.status === 'revoked' ? 'revoked' : 'closed',
      closed_at: nowIso()
    };
  });
  if (closed) {
    await writeJsonAtomic(path.join(madSksSqlPlaneDir(root, missionId), MAD_SKS_SQL_PLANE_CLOSED_CAPABILITY_FILE), {
      schema: closed.schema,
      mission_id: closed.mission_id,
      cycle_id: closed.cycle_id,
      closed_at: closed.closed_at,
      close_reason: reason,
      counters: closed.counters,
      project_ref_hash: sha256(closed.project_ref).slice(0, 16)
    });
  }
  return closed;
}

export async function revokeMadSksSqlPlaneCapability(root: string, missionId: string, reason = 'operator_revoked') {
  const revoked = await updateMadSksSqlPlaneCapability(root, missionId, (capability) => ({
    ...capability,
    status: 'revoked',
    closed_at: nowIso()
  }));
  if (revoked) {
    await appendJsonlBounded(path.join(madSksSqlPlaneDir(root, missionId), MAD_SKS_SQL_PLANE_LEDGER_FILE), {
      ts: nowIso(),
      type: 'capability.revoked',
      mission_id: missionId,
      cycle_id: revoked.cycle_id,
      reason
    });
  }
  return revoked;
}
