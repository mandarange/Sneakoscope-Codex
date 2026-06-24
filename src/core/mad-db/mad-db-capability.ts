import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import { findLatestMission, missionDir } from '../mission.js';
import { withMadDbLock } from './mad-db-lock.js';
import { MAD_DB_POLICY, type MadDbOperationClass } from './mad-db-policy.js';

export const MAD_DB_CAPABILITY_SCHEMA_V1 = 'sks.mad-db-capability.v1' as const;
export const MAD_DB_CAPABILITY_SCHEMA = 'sks.mad-db-capability.v2' as const;
export const MAD_DB_CAPABILITY_FILE = 'mad-db-capability.json';
export const MAD_DB_ACK = 'I AUTHORIZE ONE-CYCLE DB BREAK-GLASS';
export const MAD_DB_DEFAULT_TTL_MS = MAD_DB_POLICY.ttl.default_ms;
export const MAD_DB_MAX_TTL_MS = MAD_DB_POLICY.ttl.hard_max_ms;

export interface MadDbCapabilityV2 {
  schema: typeof MAD_DB_CAPABILITY_SCHEMA;
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
    operations: MadDbOperationClass[];
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
  legacy_compat?: {
    one_cycle_only: true;
    priority: 'highest';
    scope: 'all_database_mutations';
  };
}

export type MadDbCapability = MadDbCapabilityV2;

export async function createMadDbCapability(root: string, input: {
  missionId: string;
  ack: string;
  cwd?: string;
  cycleId?: string;
  ttlMs?: number;
  projectRef?: string;
  targetEnvironment?: MadDbCapabilityV2['target_environment'];
  allowedSchemas?: string[];
  codexThreadId?: string | null;
  runtimeSessionId?: string;
  operatorIntent?: string;
  profilePath?: string;
  profileSha256?: string;
  serverUrlRedacted?: string;
  operations?: MadDbOperationClass[];
  status?: MadDbCapabilityV2['status'];
}): Promise<MadDbCapabilityV2> {
  if (input.ack !== MAD_DB_ACK) throw new Error('mad_db_ack_phrase_mismatch');
  const createdAt = nowIso();
  const ttlMs = Math.min(MAD_DB_MAX_TTL_MS, Math.max(1, Math.floor(Number(input.ttlMs || MAD_DB_DEFAULT_TTL_MS))));
  const projectRef = String(input.projectRef || process.env.SKS_MAD_DB_PROJECT_REF || process.env.SKS_MAD_DB_E2E_PROJECT_REF || 'fixture-project-ref').trim();
  const profilePath = input.profilePath || '.sneakoscope/missions/<mission>/mad-db/runtime/codex-mad-db.config.toml';
  const profileSha256 = input.profileSha256 || sha256(`${input.missionId}:${projectRef}:placeholder-profile`);
  const capability: MadDbCapabilityV2 = {
    schema: MAD_DB_CAPABILITY_SCHEMA,
    revision: 1,
    mission_id: input.missionId,
    cycle_id: input.cycleId || `mad-db-${Date.now().toString(36)}`,
    project_root_hash: sha256(path.resolve(input.cwd || root)).slice(0, 24),
    project_ref: projectRef,
    target_environment: input.targetEnvironment || 'production',
    allowed_schemas: input.allowedSchemas?.length ? input.allowedSchemas : ['public'],
    codex_thread_id: input.codexThreadId ?? null,
    runtime_session_id: input.runtimeSessionId || `mad-db-session-${Date.now().toString(36)}`,
    operator_intent_hash: sha256(input.operatorIntent || input.ack || 'mad-db').slice(0, 32),
    operator_ack_hash: sha256(input.ack).slice(0, 32),
    scope: {
      sql_plane: 'all_mutations',
      control_plane: 'deny',
      operations: input.operations?.length ? input.operations : [...MAD_DB_POLICY.sql_plane_allowed]
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
    },
    legacy_compat: {
      one_cycle_only: true,
      priority: 'highest',
      scope: 'all_database_mutations'
    }
  };
  const dir = missionDir(root, input.missionId);
  await writeJsonAtomic(path.join(dir, MAD_DB_CAPABILITY_FILE), capability);
  await appendJsonlBounded(path.join(dir, 'mad-db-ledger.jsonl'), {
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

export async function readMadDbCapability(root: string, missionId: string): Promise<MadDbCapabilityV2 | null> {
  const value = await readJson<any>(path.join(missionDir(root, missionId), MAD_DB_CAPABILITY_FILE), null);
  if (value?.schema === MAD_DB_CAPABILITY_SCHEMA) return value as MadDbCapabilityV2;
  if (value?.schema === MAD_DB_CAPABILITY_SCHEMA_V1) return migrateV1Capability(value, missionId);
  return null;
}

export async function resolveMadDbMissionId(root: string, state: any = {}, explicitMissionId: string | null = null) {
  if (explicitMissionId && explicitMissionId !== 'latest') return explicitMissionId;
  if (state?.mad_db_capability_mission_id) return String(state.mad_db_capability_mission_id);
  if (state?.mission_id) return String(state.mission_id);
  return findLatestMission(root);
}

export function isMadDbCapabilityActive(capability: MadDbCapabilityV2 | null, nowMs = Date.now()) {
  if (!capability) return false;
  const expires = Date.parse(capability.expires_at || '');
  return capability.schema === MAD_DB_CAPABILITY_SCHEMA
    && ['transport_ready', 'active'].includes(capability.status)
    && Boolean(capability.project_ref)
    && capability.transport?.write_capable === true
    && capability.transport?.features?.[0] === 'database'
    && Number.isFinite(expires)
    && expires > nowMs;
}

export async function activateMadDbCapability(root: string, missionId: string): Promise<MadDbCapabilityV2 | null> {
  return updateMadDbCapability(root, missionId, (capability) => ({
    ...capability,
    status: capability.status === 'issued' ? 'active' : capability.status
  }));
}

export async function markMadDbTransportReady(root: string, missionId: string): Promise<MadDbCapabilityV2 | null> {
  return updateMadDbCapability(root, missionId, (capability) => ({
    ...capability,
    status: capability.status === 'issued' ? 'transport_ready' : capability.status
  }));
}

export async function updateMadDbCapabilityCounters(root: string, missionId: string, delta: {
  attemptsDelta?: number;
  reservedDelta?: number;
  succeededDelta?: number;
  failedDelta?: number;
}): Promise<MadDbCapabilityV2 | null> {
  return updateMadDbCapability(root, missionId, (capability) => ({
    ...capability,
    counters: {
      attempts: capability.counters.attempts + Number(delta.attemptsDelta || 0),
      reserved: capability.counters.reserved + Number(delta.reservedDelta || 0),
      succeeded: capability.counters.succeeded + Number(delta.succeededDelta || 0),
      failed: capability.counters.failed + Number(delta.failedDelta || 0)
    }
  }));
}

export async function updateMadDbCapability(root: string, missionId: string, mutator: (capability: MadDbCapabilityV2) => MadDbCapabilityV2): Promise<MadDbCapabilityV2 | null> {
  return withMadDbLock(root, missionId, 'capability', async () => {
    const current = await readMadDbCapability(root, missionId);
    if (!current) return null;
    const next = mutator(current);
    const updated: MadDbCapabilityV2 = {
      ...next,
      revision: Number(current.revision || 0) + 1
    };
    await writeJsonAtomic(path.join(missionDir(root, missionId), MAD_DB_CAPABILITY_FILE), updated);
    await appendJsonlBounded(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), {
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

export async function recordMadDbOperation(root: string, missionId: string, input: { operationId?: string; toolName?: string; sqlHash?: string } = {}) {
  const capability = await readMadDbCapability(root, missionId);
  if (!capability) return null;
  await appendJsonlBounded(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), {
    ts: nowIso(),
    type: 'db_operation.legacy_recorded',
    mission_id: missionId,
    cycle_id: capability.cycle_id,
    operation_id: input.operationId || null,
    tool_name: input.toolName || null,
    sql_hash: input.sqlHash || null
  });
  return capability;
}

export async function consumeMadDbCapability(root: string, missionId: string, input: { consumedBy?: string; reason?: string } = {}) {
  return closeMadDbCycle(root, missionId, '', input.consumedBy || input.reason || 'mad_db_cycle_closed');
}

export async function closeMadDbCycle(root: string, missionId: string, cycleId = '', reason = 'mad_db_cycle_closed'): Promise<MadDbCapabilityV2 | null> {
  const closed = await updateMadDbCapability(root, missionId, (capability) => {
    if (cycleId && capability.cycle_id !== cycleId) return capability;
    return {
      ...capability,
      status: capability.status === 'revoked' ? 'revoked' : 'closed',
      closed_at: nowIso()
    };
  });
  if (closed) {
    await writeJsonAtomic(path.join(missionDir(root, missionId), 'mad-db-capability.closed.json'), {
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

export async function revokeMadDbCapability(root: string, missionId: string, reason = 'operator_revoked') {
  const revoked = await updateMadDbCapability(root, missionId, (capability) => ({
    ...capability,
    status: 'revoked',
    closed_at: nowIso()
  }));
  if (revoked) {
    await appendJsonlBounded(path.join(missionDir(root, missionId), 'mad-db-ledger.jsonl'), {
      ts: nowIso(),
      type: 'capability.revoked',
      mission_id: missionId,
      cycle_id: revoked.cycle_id,
      reason
    });
  }
  return revoked;
}

function migrateV1Capability(value: any, missionId: string): MadDbCapabilityV2 {
  const projectRef = process.env.SKS_MAD_DB_PROJECT_REF || process.env.SKS_MAD_DB_E2E_PROJECT_REF || 'legacy-v1-missing-project-ref';
  return {
    schema: MAD_DB_CAPABILITY_SCHEMA,
    revision: 0,
    mission_id: String(value.mission_id || missionId),
    cycle_id: String(value.cycle_id || `mad-db-${Date.now().toString(36)}`),
    project_root_hash: sha256(String(value.operator_ack?.cwd || process.cwd())).slice(0, 24),
    project_ref: projectRef,
    target_environment: 'production',
    allowed_schemas: ['public'],
    codex_thread_id: null,
    runtime_session_id: `legacy-v1-${Date.now().toString(36)}`,
    operator_intent_hash: sha256('legacy-v1-migrated').slice(0, 32),
    operator_ack_hash: sha256(MAD_DB_ACK).slice(0, 32),
    scope: {
      sql_plane: 'all_mutations',
      control_plane: 'deny',
      operations: [...MAD_DB_POLICY.sql_plane_allowed]
    },
    transport: {
      profile_path: '.sneakoscope/missions/<mission>/mad-db/runtime/codex-mad-db.config.toml',
      profile_sha256: sha256('legacy-v1-missing-profile'),
      server_url_redacted: 'https://mcp.supabase.com/mcp?project_ref=<legacy-redacted>&features=database',
      features: ['database'],
      write_capable: true
    },
    issued_at: String(value.created_at || nowIso()),
    expires_at: String(value.expires_at || new Date(Date.now() - 1000).toISOString()),
    closed_at: value.consumed ? String(value.consumed_at || nowIso()) : null,
    status: value.enabled === false ? 'revoked' : value.consumed ? 'closed' : 'quarantined',
    counters: {
      attempts: Number(value.operation_count || 0),
      reserved: Number(value.operation_count || 0),
      succeeded: 0,
      failed: 0
    },
    legacy_compat: {
      one_cycle_only: true,
      priority: 'highest',
      scope: 'all_database_mutations'
    }
  };
}
