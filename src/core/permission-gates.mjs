export const PERMISSION_GATE_SCHEMA_VERSION = 1;

export const MAD_SKS_PERMISSION_PROFILE = Object.freeze({
  schema_version: PERMISSION_GATE_SCHEMA_VERSION,
  id: 'mad_sks_live_full_access',
  command: '$MAD-SKS',
  intent: 'explicit_live_server_intervention',
  scope: 'active_invocation_only',
  authority_surface: 'skill_or_mcp_gate_function',
  allowed: Object.freeze([
    'live_server_changes',
    'supabase_mcp_database_writes',
    'direct_execute_sql_writes',
    'schema_cleanup',
    'column_cleanup',
    'migration_apply_when_required',
    'normal_dml_with_targeted_scope'
  ]),
  blocked: Object.freeze([
    'drop_database',
    'drop_schema',
    'drop_table',
    'truncate_table',
    'delete_without_where',
    'update_without_where',
    'database_reset',
    'dangerous_project_or_branch_management',
    'credential_exfiltration',
    'persistent_security_weakening',
    'unrequested_fallback_implementation'
  ]),
  deactivation: 'mission_gate_passed_or_permissions_deactivated'
});

export function permissionGateSummary(profile = MAD_SKS_PERMISSION_PROFILE) {
  return {
    schema_version: PERMISSION_GATE_SCHEMA_VERSION,
    id: profile.id,
    scope: profile.scope,
    authority_surface: profile.authority_surface,
    allowed: [...profile.allowed],
    blocked: [...profile.blocked],
    deactivation: profile.deactivation
  };
}

export function isMadSksRouteState(state = {}) {
  return state.mad_sks_active === true
    || String(state.mode || '').toUpperCase() === 'MADSKS'
    || String(state.route_command || '').toUpperCase() === '$MAD-SKS'
    || String(state.route || '').toUpperCase() === 'MADSKS'
    || state.permission_profile?.id === MAD_SKS_PERMISSION_PROFILE.id;
}

export function madSksCatastrophicDbReasons(cls = {}) {
  const reasons = new Set([
    ...(cls.reasons || []),
    ...(cls.sql?.reasons || []),
    ...(cls.command?.reasons || [])
  ]);
  const blocked = [
    'drop_database',
    'drop_schema',
    'drop_table',
    'truncate',
    'delete_without_where',
    'update_without_where',
    'supabase_db_reset',
    'prisma_migrate_reset',
    'postgres_database_admin_command'
  ].filter((reason) => reasons.has(reason));
  if (cls.toolReasons?.includes?.('dangerous_supabase_management_tool')) blocked.push('dangerous_project_or_branch_management');
  return [...new Set(blocked)];
}

export function evaluateMadSksPermissionGate({ classification, active = false } = {}) {
  const cls = classification || { level: 'none', reasons: [] };
  if (!active || !['write', 'destructive'].includes(cls.level)) return { matched: false, active: Boolean(active), profile: permissionGateSummary() };
  const catastrophic = madSksCatastrophicDbReasons(cls);
  if (catastrophic.length) {
    return {
      matched: true,
      active: true,
      allowed: false,
      action: 'block',
      reasons: ['mad_sks_catastrophic_db_operation_blocked'],
      blocked_categories: catastrophic,
      profile: permissionGateSummary()
    };
  }
  return {
    matched: true,
    active: true,
    allowed: true,
    action: 'allow',
    reasons: ['mad_sks_scoped_live_full_access_active'],
    profile: permissionGateSummary()
  };
}
