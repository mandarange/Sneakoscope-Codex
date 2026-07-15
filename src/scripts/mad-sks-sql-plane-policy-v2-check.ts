#!/usr/bin/env node
import { MAD_SKS_SQL_PLANE_POLICY, isMadSksSqlPlaneControlPlaneDeniedTool, isMadSksSqlPlaneToolName, madSksSqlPlaneOperationClassesFromClassification } from '../core/mad-sks/sql-plane/policy.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

for (const operation of ['drop', 'all_row_delete', 'truncate', 'migration_apply', 'direct_execute_sql']) {
  assertGate((MAD_SKS_SQL_PLANE_POLICY.sql_plane_allowed as readonly string[]).includes(operation), `policy missing ${operation}`, MAD_SKS_SQL_PLANE_POLICY)
}
assertGate(isMadSksSqlPlaneToolName('mcp__supabase_mad_sks_sql_plane__execute_sql') === true, 'execute_sql variants must be SQL-plane tools')
assertGate(isMadSksSqlPlaneToolName('supabase.apply_migration') === true, 'apply_migration variants must be SQL-plane tools')
assertGate(isMadSksSqlPlaneControlPlaneDeniedTool('supabase.delete_project') === true, 'project control-plane delete must remain denied')
assertGate(isMadSksSqlPlaneControlPlaneDeniedTool('supabase.billing_update') === true, 'billing control-plane updates must remain denied')
const classes = madSksSqlPlaneOperationClassesFromClassification({
  toolName: 'supabase.execute_sql',
  level: 'destructive',
  sql: { reasons: ['truncate', 'delete_without_where', 'alter_table_drop'], statements: ['truncate public.fixture;', 'delete from public.fixture;', 'alter table public.fixture drop column old_col;'] }
})
for (const operation of ['direct_execute_sql', 'truncate', 'all_row_delete', 'drop']) {
  assertGate(classes.includes(operation as any), `classification must map ${operation}`, { classes })
}
emitGate('mad-sks-sql-plane:policy-v2', { classes })
