export const MAD_DB_POLICY_SCHEMA = 'sks.mad-db-policy.v2' as const;

export const MAD_DB_OPERATION_CLASSES = [
  'create',
  'alter',
  'drop',
  'drop_database_sql',
  'insert',
  'update',
  'delete',
  'all_row_update',
  'all_row_delete',
  'truncate',
  'migration_apply',
  'direct_execute_sql',
  'rls_policy_change',
  'function_or_trigger_change',
  'index_change',
  'unknown_sql_mutation'
] as const;

export type MadDbOperationClass = typeof MAD_DB_OPERATION_CLASSES[number];

export const MAD_DB_SQL_PLANE_TOOL_NAMES = Object.freeze([
  'execute_sql',
  'apply_migration',
  'supabase.execute_sql',
  'supabase.apply_migration',
  'mcp__supabase__execute_sql',
  'mcp__supabase__apply_migration',
  'supabase_mad_db.execute_sql',
  'supabase_mad_db.apply_migration',
  'mcp__supabase_mad_db__execute_sql',
  'mcp__supabase_mad_db__apply_migration'
]);

export const MAD_DB_CONTROL_PLANE_DENIED_TOOL_PATTERNS = Object.freeze([
  'delete_project',
  'pause_project',
  'restore_project',
  'create_project',
  'list_organizations',
  'get_organization',
  'billing',
  'organization',
  'credential',
  'access_token',
  'service_role',
  'delete_branch',
  'reset_branch',
  'merge_branch'
]);

export const MAD_DB_POLICY = Object.freeze({
  schema: MAD_DB_POLICY_SCHEMA,
  default_mode: 'deny_mutations',
  active_mode: {
    sql_plane: 'allow_all_mutations',
    control_plane: 'deny',
    requires: [
      'capability_v2',
      'project_binding',
      'session_binding',
      'write_transport_ready',
      'not_expired'
    ]
  },
  sql_plane_allowed: MAD_DB_OPERATION_CLASSES,
  sql_plane_tools: MAD_DB_SQL_PLANE_TOOL_NAMES,
  control_plane_denied: MAD_DB_CONTROL_PLANE_DENIED_TOOL_PATTERNS,
  normal_supabase_mcp: {
    read_only_required: true,
    project_ref_required: true
  },
  runtime_profile: {
    mission_local_only: true,
    read_only_omitted_only_for_active_capability: true,
    features: ['database']
  },
  ttl: {
    default_ms: 15 * 60 * 1000,
    hard_max_ms: 30 * 60 * 1000
  }
});

export function madDbPolicySnapshot() {
  return MAD_DB_POLICY;
}

export function isMadDbSqlPlaneToolName(toolName: unknown): boolean {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return false;
  return MAD_DB_SQL_PLANE_TOOL_NAMES.some((name) => normalized.endsWith(normalizeToolName(name)) || normalized.includes(normalizeToolName(name)));
}

export function isMadDbControlPlaneDeniedTool(toolName: unknown): boolean {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return false;
  return MAD_DB_CONTROL_PLANE_DENIED_TOOL_PATTERNS.some((pattern) => normalized.includes(normalizeToolName(pattern)));
}

export function normalizeToolName(toolName: unknown): string {
  return String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_');
}

export function madDbOperationClassesFromClassification(classification: any = {}): MadDbOperationClass[] {
  const reasons = new Set<string>([
    ...stringArray(classification.reasons),
    ...stringArray(classification.sql?.reasons),
    ...stringArray(classification.command?.reasons),
    ...stringArray(classification.toolReasons)
  ]);
  const out = new Set<MadDbOperationClass>();
  const toolName = classification.toolName || classification.tool_name || '';
  if (isMadDbSqlPlaneToolName(toolName)) out.add('direct_execute_sql');
  if (reasons.has('migration_apply_tool') || reasons.has('supabase_migration_apply')) out.add('migration_apply');
  if (hasAny(reasons, ['drop_database'])) out.add('drop_database_sql');
  if (hasAny(reasons, ['drop_schema', 'drop_table', 'drop_view', 'drop_materialized_view', 'drop_extension', 'drop_policy', 'drop_statement', 'alter_table_drop'])) out.add('drop');
  if (hasAny(reasons, ['truncate'])) out.add('truncate');
  if (hasAny(reasons, ['insert_or_upsert'])) out.add('insert');
  if (hasAny(reasons, ['update_with_where'])) out.add('update');
  if (hasAny(reasons, ['update_without_where'])) out.add('all_row_update');
  if (hasAny(reasons, ['delete_with_where'])) out.add('delete');
  if (hasAny(reasons, ['delete_without_where'])) out.add('all_row_delete');
  if (hasAny(reasons, ['schema_change', 'alter_table_rename'])) out.add('alter');
  if (hasAny(reasons, ['create_or_replace'])) out.add('function_or_trigger_change');
  const statements = stringArray(classification.sql?.statements);
  for (const statement of statements) {
    const normalized = statement.trim().toLowerCase();
    if (/^create\s+(table|schema|view|materialized\s+view)/.test(normalized)) out.add('create');
    if (/^create\s+(index|unique\s+index)/.test(normalized)) out.add('index_change');
    if (/^drop\s+index/.test(normalized)) out.add('index_change');
    if (/policy|row\s+level\s+security|rls/.test(normalized)) out.add('rls_policy_change');
    if (/function|trigger|procedure/.test(normalized)) out.add('function_or_trigger_change');
  }
  if (!out.size && ['write', 'destructive', 'possible_db'].includes(String(classification.level || ''))) out.add('unknown_sql_mutation');
  return [...out];
}

export function activeMadDbAllowsSqlPlane(classification: any = {}): boolean {
  const toolName = classification.toolName || classification.tool_name || '';
  if (isMadDbControlPlaneDeniedTool(toolName)) return false;
  if (classification.toolReasons?.includes?.('dangerous_supabase_management_tool')) return false;
  if (isMadDbSqlPlaneToolName(toolName)) return true;
  return ['write', 'destructive', 'possible_db'].includes(String(classification.level || ''));
}

export function madDbSkillText(commandPrefix = 'sks'): string {
  return `---
name: mad-db
description: First-class MadDB SQL-plane execution route for explicit $MAD-DB and ${commandPrefix} mad-db run|exec|apply-migration.
---

Use only when the operator explicitly invokes $MAD-DB/$mad-db or ${commandPrefix} mad-db run|exec|apply-migration. This is the single approval boundary for the active MadDB cycle: execute SQL-plane mutations that the operator requested, including CREATE, ALTER, table/schema DROP, column add/drop/rename, INSERT, UPDATE, DELETE including all-row mutations, TRUNCATE, execute_sql, and apply_migration. Do not ask again for each DROP/TRUNCATE/all-row DELETE inside the same bound cycle.

Keep normal Supabase MCP configuration read-only. MadDB must create a mission-local ephemeral write-capable Supabase MCP profile bound to capability v2, project_ref, root, mission, thread/session, intent, runtime profile hash, TTL, and SQL-plane operation classes. Verify execute_sql and apply_migration availability before claiming readiness. Require actual tool results plus independent read-back verification before claiming success. Close/revoke the capability and runtime profile in finally and prove read-only restoration.

Still deny Supabase account/project/billing/credential control-plane actions, credential exfiltration, unrelated non-database admin changes, and unrequested fallback implementation. Do not add prompt-only SQL deny lists inside active MadDB; capability binding, SQL-plane scope, operation ledgering, and read-back verification are the approval boundary. Pair with db-safety-guard, Context7 evidence for MCP/API docs, route-local reflection, and Honest Mode.`;
}

export function dbSafetyGuardSkillText(): string {
  return `---
name: db-safety-guard
description: Enforce Sneakoscope Codex database safety before using SQL, Supabase MCP, Postgres, Prisma, Drizzle, Knex, or migration commands.
---

Rules:
- Default non-MadDB mode is read-only and routes writes/destructive SQL to the DB safety gate.
- Supabase MCP must be read-only and project-scoped by default.
- Live execute_sql writes are blocked unless a bound active MadDB capability v2 is present.
- Active MadDB is the explicit exception: SQL-plane mutations requested by $MAD-DB or sks mad-db run|exec|apply-migration are allowed, including DROP, DELETE, TRUNCATE, RLS/policy changes, and execute_sql/apply_migration, and must be executed with read-back verification.
- Default read-only restrictions do not apply to SQL-plane work while the active MadDB capability v2 is bound.
- Supabase project/account/billing/credential control-plane actions remain denied even in MadDB.
- If no active bound MadDB cycle exists, fall back to read-only only.`;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '')).filter(Boolean);
}

function hasAny(values: Set<string>, keys: string[]): boolean {
  return keys.some((key) => values.has(key));
}
