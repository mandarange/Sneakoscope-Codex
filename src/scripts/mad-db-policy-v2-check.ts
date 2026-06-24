#!/usr/bin/env node
import { MAD_DB_POLICY, isMadDbControlPlaneDeniedTool, isMadDbSqlPlaneToolName, madDbOperationClassesFromClassification } from '../core/mad-db/mad-db-policy.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

for (const operation of ['drop', 'all_row_delete', 'truncate', 'migration_apply', 'direct_execute_sql']) {
  assertGate((MAD_DB_POLICY.sql_plane_allowed as readonly string[]).includes(operation), `policy missing ${operation}`, MAD_DB_POLICY)
}
assertGate(isMadDbSqlPlaneToolName('mcp__supabase_mad_db__execute_sql') === true, 'execute_sql variants must be SQL-plane tools')
assertGate(isMadDbSqlPlaneToolName('supabase.apply_migration') === true, 'apply_migration variants must be SQL-plane tools')
assertGate(isMadDbControlPlaneDeniedTool('supabase.delete_project') === true, 'project control-plane delete must remain denied')
assertGate(isMadDbControlPlaneDeniedTool('supabase.billing_update') === true, 'billing control-plane updates must remain denied')
const classes = madDbOperationClassesFromClassification({
  toolName: 'supabase.execute_sql',
  level: 'destructive',
  sql: { reasons: ['truncate', 'delete_without_where', 'alter_table_drop'], statements: ['truncate public.fixture;', 'delete from public.fixture;', 'alter table public.fixture drop column old_col;'] }
})
for (const operation of ['direct_execute_sql', 'truncate', 'all_row_delete', 'drop']) {
  assertGate(classes.includes(operation as any), `classification must map ${operation}`, { classes })
}
emitGate('mad-db:policy-v2', { classes })
