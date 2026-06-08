import { readMadDbCapability, isMadDbCapabilityActive } from './mad-db-capability.js'

export const MAD_DB_POLICY_DECISION_SCHEMA = 'sks.mad-db-policy-decision.v1'

export async function resolveMadDbMutationPolicy(root: string, state: any = {}, classification: any = {}) {
  const missionId = state?.mission_id ? String(state.mission_id) : null
  if (!missionId) return inactive('mission_id_missing')
  const capability = await readMadDbCapability(root, missionId)
  if (!isMadDbCapabilityActive(capability)) return inactive(capability?.consumed ? 'mad_db_capability_consumed' : 'mad_db_capability_inactive')
  if (!isDbMutationOrDbTool(classification)) return inactive('not_a_database_mutation')
  return {
    schema: MAD_DB_POLICY_DECISION_SCHEMA,
    allowed: true,
    action: 'allow',
    mode: 'mad-db-break-glass',
    priority: 0,
    priority_order: ['mad-db', 'mad-sks', 'sealed-contract', 'default-db-safety'],
    reasons: ['mad_db_one_cycle_break_glass_capability_active'],
    audit_required: true,
    mission_id: missionId,
    cycle_id: capability!.cycle_id,
    operation_count: capability!.operation_count || 0,
    max_operations: capability!.max_operations || 20,
    capability
  }
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
  }
}

function isDbMutationOrDbTool(classification: any = {}) {
  if (classification.level === 'write' || classification.level === 'destructive') return true
  if (classification.toolReasons?.includes?.('database_tool')) return true
  if (classification.toolReasons?.includes?.('migration_apply_tool')) return true
  return false
}
