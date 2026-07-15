import { isMadSksSqlPlaneCapabilityActive, readMadSksSqlPlaneCapability, type MadSksSqlPlaneCapabilityV2 } from './capability.js';
import { activeMadSksSqlPlaneAllowsMutation, isMadSksSqlPlaneControlPlaneDeniedTool, madSksSqlPlaneOperationClassesFromClassification } from './policy.js';
import { readJson, sha256 } from '../../fsx.js';
import { missionsDir, stateFile } from '../../mission.js';

export const MAD_SKS_SQL_PLANE_POLICY_DECISION_SCHEMA = 'sks.mad-sks-sql-plane-policy-decision.v2';

export async function resolveMadSksSqlPlaneMutationPolicy(root: string, state: any = {}, classification: any = {}, explicitCapability?: MadSksSqlPlaneCapabilityV2 | null) {
  const primary = await resolveMadSksSqlPlaneMutationPolicyForState(root, state, classification, explicitCapability);
  if (primary.allowed === true || explicitCapability) return primary;
  /* intentional: optional fallback lookup — primary policy already resolved, this only widens the search */
  const persistedState = await readJson<any>(stateFile(root), null).catch(() => null);
  if (persistedState && persistedState !== state) {
    const fallback = await resolveMadSksSqlPlaneMutationPolicyForState(root, persistedState, classification, null);
    if (fallback.allowed === true) {
      return {
        ...fallback,
        state_source: 'persisted_sks_state',
        reasons: [...fallback.reasons, 'mad_sks_sql_plane_persisted_state_binding_used']
      };
    }
  }
  const latestCapability = await findLatestActiveMadSksSqlPlaneCapability(root);
  if (latestCapability) {
    const fallback = await resolveMadSksSqlPlaneMutationPolicyForState(root, {
      mad_sks_sql_plane_active: true,
      mad_sks_sql_plane_capability_mission_id: latestCapability.mission_id
    }, classification, latestCapability);
    if (fallback.allowed === true) {
      return {
        ...fallback,
        state_source: 'latest_active_mad_sks_sql_plane_capability',
        reasons: [...fallback.reasons, 'mad_sks_sql_plane_latest_active_capability_used']
      };
    }
  }
  return primary;
}

async function findLatestActiveMadSksSqlPlaneCapability(root: string): Promise<MadSksSqlPlaneCapabilityV2 | null> {
  const fs = await import('node:fs/promises');
  const entries = await fs.readdir(missionsDir(root), { withFileTypes: true }).catch(() => []);
  const candidates: Array<{ capability: MadSksSqlPlaneCapabilityV2; issuedMs: number; expiresMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('M-')) continue;
    /* intentional: scanning candidate mission dirs for an active capability — a missing/corrupt one is just not a candidate */
    const capability = await readMadSksSqlPlaneCapability(root, entry.name).catch(() => null);
    if (!capability || !isMadSksSqlPlaneCapabilityActive(capability)) continue;
    const issuedMs = Date.parse(capability.issued_at || '');
    const expiresMs = Date.parse(capability.expires_at || '');
    candidates.push({
      capability,
      issuedMs: Number.isFinite(issuedMs) ? issuedMs : 0,
      expiresMs: Number.isFinite(expiresMs) ? expiresMs : 0
    });
  }
  candidates.sort((a, b) => (
    (a.issuedMs - b.issuedMs)
    || (a.expiresMs - b.expiresMs)
    || a.capability.mission_id.localeCompare(b.capability.mission_id)
  ));
  return candidates.at(-1)?.capability || null;
}

async function resolveMadSksSqlPlaneMutationPolicyForState(root: string, state: any = {}, classification: any = {}, explicitCapability?: MadSksSqlPlaneCapabilityV2 | null) {
  const missionId = explicitCapability?.mission_id || state?.mad_sks_sql_plane_capability_mission_id || state?.mission_id;
  if (!missionId) return inactive('mission_id_missing');
  const capability = explicitCapability || await readMadSksSqlPlaneCapability(root, String(missionId));
  const validation = validateCapabilityBinding(capability, state, classification);
  if (!validation.ok) return inactive(validation.reason);
  if (isMadSksSqlPlaneControlPlaneDeniedTool(classification.toolName || classification.tool_name)) return inactive('mad_sks_sql_plane_control_plane_tool_denied');
  if (!activeMadSksSqlPlaneAllowsMutation(classification)) return inactive('not_a_database_sql_plane_mutation');
  return {
    schema: MAD_SKS_SQL_PLANE_POLICY_DECISION_SCHEMA,
    allowed: true,
    action: 'allow',
    mode: 'mad-sks-sql-plane-active',
    priority: 0,
    priority_order: ['mad-sks-sql-plane', 'sealed-contract', 'default-db-safety'],
    reasons: ['mad_sks_sql_plane_capability_v2_bound_sql_plane_authorized'],
    audit_required: true,
    mission_id: capability!.mission_id,
    cycle_id: capability!.cycle_id,
    runtime_session_id: capability!.runtime_session_id,
    project_ref_hash: hashRef(capability!.project_ref),
    operation_classes: madSksSqlPlaneOperationClassesFromClassification(classification),
    counters: capability!.counters,
    capability
  };
}

export function validateCapabilityBinding(capability: MadSksSqlPlaneCapabilityV2 | null, state: any = {}, classification: any = {}) {
  if (!capability) return { ok: false, reason: 'mad_sks_sql_plane_capability_missing' };
  if (!isMadSksSqlPlaneCapabilityActive(capability)) return { ok: false, reason: `mad_sks_sql_plane_capability_${capability.status || 'inactive'}` };
  if (!capability.project_ref) return { ok: false, reason: 'mad_sks_sql_plane_project_ref_missing' };
  const boundMadSksSqlPlaneMissionId = state?.mad_sks_sql_plane_capability_mission_id ? String(state.mad_sks_sql_plane_capability_mission_id) : null;
  if (boundMadSksSqlPlaneMissionId === capability.mission_id && state?.mad_sks_sql_plane_active === false) return { ok: false, reason: 'mad_sks_sql_plane_state_inactive' };
  if (state?.mission_id && String(state.mission_id) !== capability.mission_id && boundMadSksSqlPlaneMissionId !== capability.mission_id) return { ok: false, reason: 'mad_sks_sql_plane_mission_binding_mismatch' };
  if (state?.mad_sks_sql_plane_cycle_id && String(state.mad_sks_sql_plane_cycle_id) !== capability.cycle_id) return { ok: false, reason: 'mad_sks_sql_plane_cycle_binding_mismatch' };
  if (state?.mad_sks_sql_plane_runtime_session_id && String(state.mad_sks_sql_plane_runtime_session_id) !== capability.runtime_session_id) return { ok: false, reason: 'mad_sks_sql_plane_runtime_session_binding_mismatch' };
  if (state?.mad_sks_sql_plane_profile_sha256 && String(state.mad_sks_sql_plane_profile_sha256) !== capability.transport.profile_sha256) return { ok: false, reason: 'mad_sks_sql_plane_profile_hash_mismatch' };
  if (classification.toolReasons?.includes?.('dangerous_supabase_management_tool')) return { ok: false, reason: 'mad_sks_sql_plane_control_plane_tool_denied' };
  return { ok: true, reason: 'ok' };
}

function inactive(reason: string) {
  return {
    schema: MAD_SKS_SQL_PLANE_POLICY_DECISION_SCHEMA,
    allowed: false,
    action: 'defer',
    mode: 'default-db-safety',
    priority: 99,
    reasons: [reason],
    audit_required: false
  };
}

function hashRef(projectRef: string): string {
  return sha256(projectRef).slice(0, 16);
}
