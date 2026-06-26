import { isMadDbCapabilityActive, readMadDbCapability, type MadDbCapabilityV2 } from './mad-db-capability.js';
import { activeMadDbAllowsSqlPlane, isMadDbControlPlaneDeniedTool, madDbOperationClassesFromClassification } from './mad-db-policy.js';
import { readJson, sha256 } from '../fsx.js';
import { stateFile } from '../mission.js';

export const MAD_DB_POLICY_DECISION_SCHEMA = 'sks.mad-db-policy-decision.v2';

export async function resolveMadDbMutationPolicy(root: string, state: any = {}, classification: any = {}, explicitCapability?: MadDbCapabilityV2 | null) {
  const primary = await resolveMadDbMutationPolicyForState(root, state, classification, explicitCapability);
  if (primary.allowed === true || explicitCapability) return primary;
  const persistedState = await readJson<any>(stateFile(root), null).catch(() => null);
  if (persistedState && persistedState !== state) {
    const fallback = await resolveMadDbMutationPolicyForState(root, persistedState, classification, null);
    if (fallback.allowed === true) {
      return {
        ...fallback,
        state_source: 'persisted_sks_state',
        reasons: [...fallback.reasons, 'mad_db_persisted_state_binding_used']
      };
    }
  }
  return primary;
}

async function resolveMadDbMutationPolicyForState(root: string, state: any = {}, classification: any = {}, explicitCapability?: MadDbCapabilityV2 | null) {
  const missionId = explicitCapability?.mission_id || state?.mad_db_capability_mission_id || state?.mission_id;
  if (!missionId) return inactive('mission_id_missing');
  const capability = explicitCapability || await readMadDbCapability(root, String(missionId));
  const validation = validateCapabilityBinding(capability, state, classification);
  if (!validation.ok) return inactive(validation.reason);
  if (isMadDbControlPlaneDeniedTool(classification.toolName || classification.tool_name)) return inactive('mad_db_control_plane_tool_denied');
  if (!activeMadDbAllowsSqlPlane(classification)) return inactive('not_a_database_sql_plane_mutation');
  return {
    schema: MAD_DB_POLICY_DECISION_SCHEMA,
    allowed: true,
    action: 'allow',
    mode: 'mad-db-sql-plane-active',
    priority: 0,
    priority_order: ['mad-db', 'mad-sks', 'sealed-contract', 'default-db-safety'],
    reasons: ['mad_db_capability_v2_bound_sql_plane_authorized'],
    audit_required: true,
    mission_id: capability!.mission_id,
    cycle_id: capability!.cycle_id,
    runtime_session_id: capability!.runtime_session_id,
    project_ref_hash: hashRef(capability!.project_ref),
    operation_classes: madDbOperationClassesFromClassification(classification),
    counters: capability!.counters,
    capability
  };
}

export function validateCapabilityBinding(capability: MadDbCapabilityV2 | null, state: any = {}, classification: any = {}) {
  if (!capability) return { ok: false, reason: 'mad_db_capability_missing' };
  if (!isMadDbCapabilityActive(capability)) return { ok: false, reason: `mad_db_capability_${capability.status || 'inactive'}` };
  if (!capability.project_ref) return { ok: false, reason: 'mad_db_project_ref_missing' };
  const boundMadDbMissionId = state?.mad_db_capability_mission_id ? String(state.mad_db_capability_mission_id) : null;
  if (boundMadDbMissionId === capability.mission_id && state?.mad_db_active === false) return { ok: false, reason: 'mad_db_state_inactive' };
  if (state?.mission_id && String(state.mission_id) !== capability.mission_id && boundMadDbMissionId !== capability.mission_id) return { ok: false, reason: 'mad_db_mission_binding_mismatch' };
  if (state?.mad_db_cycle_id && String(state.mad_db_cycle_id) !== capability.cycle_id) return { ok: false, reason: 'mad_db_cycle_binding_mismatch' };
  if (state?.mad_db_runtime_session_id && String(state.mad_db_runtime_session_id) !== capability.runtime_session_id) return { ok: false, reason: 'mad_db_runtime_session_binding_mismatch' };
  if (state?.mad_db_profile_sha256 && String(state.mad_db_profile_sha256) !== capability.transport.profile_sha256) return { ok: false, reason: 'mad_db_profile_hash_mismatch' };
  if (classification.toolReasons?.includes?.('dangerous_supabase_management_tool')) return { ok: false, reason: 'mad_db_control_plane_tool_denied' };
  return { ok: true, reason: 'ok' };
}

function inactive(reason: string) {
  return {
    schema: MAD_DB_POLICY_DECISION_SCHEMA,
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
