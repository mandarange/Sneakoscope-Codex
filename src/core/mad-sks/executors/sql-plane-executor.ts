import path from 'node:path';
import { classifySql } from '../../db-safety.js';
import { readText } from '../../fsx.js';
import { runMadDbCycle } from '../../mad-db/mad-db-coordinator.js';
import { isMadDbControlPlaneDeniedTool, madDbOperationClassesFromClassification } from '../../mad-db/mad-db-policy.js';
import { withMadDbLock } from '../../mad-db/mad-db-lock.js';
import { madSksCatastrophicSqlExplicitlyRequested } from '../../permission-gates.js';
import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { madSksAuditAction } from '../audit-ledger.js';
import {
  resultFromEvidence,
  snapshotProtectedCoreBefore,
  type MadSksExecutor,
  type MadSksExecutorContext,
  type MadSksExecutorInput,
  writeExecutorEvidence
} from './executor-base.js';

export const sqlPlaneExecutor: MadSksExecutor = {
  id: 'sql-plane',
  action_type: 'db_write',
  async dryRun(input, context) {
    return runSqlPlane(input, context, true);
  },
  async apply(input, context) {
    return runSqlPlane(input, context, false);
  }
};

async function runSqlPlane(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const action = String(input.action || (input.migration_file || input.migration_path ? 'apply-migration' : 'exec')) as 'exec' | 'apply-migration' | 'run';
  const migrationFile = input.migration_file || input.migration_path ? String(input.migration_file || input.migration_path) : '';
  const sql = await resolveSqlPlaneSql(input, context, migrationFile);
  const verifySql = String(input.verify_sql || input.verifySql || '').trim();
  const verifyExpectedRowCount = input.verify_expected_row_count === undefined || input.verify_expected_row_count === null
    ? null
    : Number(input.verify_expected_row_count);
  const verifyExpectedResultDigest = input.verify_expected_result_digest ? String(input.verify_expected_result_digest) : null;
  const rollbackSql = String(input.rollback_sql || '').trim();
  const toolName = String(input.tool_name || (action === 'apply-migration' ? 'apply_migration' : 'execute_sql'));
  const userIntent = String(input.user_intent || context.permission_model?.user_intent || 'MAD-SKS SQL-plane execution');
  const classification = classifySql(sql || userIntent);
  const operationClasses = madDbOperationClassesFromClassification({ ...classification, toolName });
  const catastrophic = madSksCatastrophicSqlExplicitlyRequested({ classification, userIntent, sql });
  const rollbackKind = rollbackSql
    ? 'compensating_sql'
    : ['write', 'destructive'].includes(String(classification.level || ''))
      ? 'not_rollbackable'
      : 'not_required';
  const blockers = [];
  if (!sql.trim() && action !== 'apply-migration') blockers.push('sql_required_for_sql_plane_executor');
  if (isMadDbControlPlaneDeniedTool(toolName)) blockers.push('mad_db_control_plane_tool_denied');
  if (catastrophic.required && !catastrophic.ok) blockers.push('catastrophic_sql_literal_request_missing');
  if (!dryRun && ['write', 'destructive'].includes(String(classification.level || '')) && !verifySql) blockers.push('mad_sks_sql_plane_read_back_sql_required');
  if (!dryRun && rollbackKind === 'not_rollbackable' && input.accept_not_rollbackable !== true) blockers.push('not_rollbackable_sql_requires_explicit_acceptance');
  const guard = await runMadSksGuardMiddleware({
    input: {
      action_type: 'db_write',
      required_scope: 'db_write',
      dry_run: dryRun,
      high_risk: true,
      allow_rollback_unavailable: rollbackKind === 'not_rollbackable' && input.accept_not_rollbackable === true
    },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) blockers.push(...guard.issues);
  if (blockers.length) {
    const evidence = await writeExecutorEvidence({
      context,
      executor: sqlPlaneExecutor.id,
      actionType: 'db_write',
      blockedActions: [{ guard, classification, catastrophic, rollback_kind: rollbackKind, operation_classes: operationClasses }],
      rollbackUnavailable: rollbackKind === 'not_rollbackable' ? ['not_rollbackable_sql_plane_operation'] : [],
      auditActions: [madSksAuditAction({ type: 'db_write', command: '[BLOCKED_SQL_PLANE]', rollback_available: rollbackKind === 'compensating_sql', risk_level: 'critical' })],
      verification: [{ kind: 'sql_plane_preflight', ok: false, blockers }],
      forceProtectedCoreChanged: input.__test_protected_core_changed === true
    });
    return resultFromEvidence({
      executor: sqlPlaneExecutor.id,
      actionType: 'db_write',
      context,
      status: 'blocked',
      evidence,
      blockedActions: [{ guard, classification, catastrophic, rollback_kind: rollbackKind, operation_classes: operationClasses }],
      blockers,
      extra: { guard, sql_classification: classification, catastrophic, rollback_kind: rollbackKind, operation_classes: operationClasses, sql_plane: sqlPlaneSummary(false, false, null, operationClasses) }
    });
  }

  if (dryRun) {
    const verification = [{
      kind: 'sql_plane_dry_run',
      ok: true,
      action,
      operation_classes: operationClasses,
      read_back_required: ['write', 'destructive'].includes(String(classification.level || '')),
      rollback_kind: rollbackKind,
      control_plane_denied: true
    }];
    const evidence = await writeExecutorEvidence({
      context,
      executor: sqlPlaneExecutor.id,
      actionType: 'db_write',
      dbRollbacks: rollbackSql ? [{ rollback_kind: 'compensating_sql', sql: rollbackSql }] : [],
      rollbackUnavailable: rollbackKind === 'not_rollbackable' ? ['not_rollbackable_sql_plane_operation'] : [],
      auditActions: [madSksAuditAction({ type: 'db_write', command: '[DRY_RUN_SQL_PLANE]', rollback_available: rollbackKind === 'compensating_sql', risk_level: 'high' })],
      verification,
      forceProtectedCoreChanged: input.__test_protected_core_changed === true
    });
    return resultFromEvidence({
      executor: sqlPlaneExecutor.id,
      actionType: 'db_write',
      context,
      status: 'dry_run',
      evidence,
      verification,
      extra: { guard, sql_classification: classification, catastrophic, rollback_kind: rollbackKind, operation_classes: operationClasses, sql_plane: sqlPlaneSummary(true, false, null, operationClasses) }
    });
  }

  const protectedCoreBefore = await snapshotProtectedCoreBefore(context, sqlPlaneExecutor.id);
  const result = await runSqlPlaneCycle(input, context, {
    root: context.target_root,
    missionId: String(input.mission_id || input.missionId || ''),
    route: 'MadSKS',
    routeCommand: '$MAD-SKS',
    action,
    task: userIntent,
    sql: sql || null,
    migrationName: String(input.migration_name || input.name || `mad_sks_${Date.now()}`),
    migrationFile: migrationFile || null,
    verifySql: verifySql || null,
    verifyExpectedRowCount,
    verifyExpectedResultDigest,
    ttlMs: Number(input.ttl_ms || 10 * 60 * 1000),
    args: Array.isArray(input.args) ? input.args.map(String) : []
  });
  const readBackPassed = result.read_back ? result.read_back.ok === true : result.execution?.ok === true;
  const profileClosed = result.capability_closed === true && result.read_only_restoration?.ok === true;
  const verification = [{
    kind: 'mad_db_cycle',
    ok: result.ok === true,
    execution_ok: result.execution?.ok === true,
    read_back_passed: readBackPassed,
    profile_closed: profileClosed,
    read_only_restoration_ok: result.read_only_restoration?.ok === true,
    operation_classes: result.operation?.operation_classes || operationClasses
  }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: sqlPlaneExecutor.id,
    actionType: 'db_write',
    beforeSnapshot: protectedCoreBefore,
    dbRollbacks: rollbackSql ? [{ rollback_kind: 'compensating_sql', sql: rollbackSql }] : [],
    rollbackUnavailable: rollbackKind === 'not_rollbackable' ? ['not_rollbackable_sql_plane_operation'] : [],
    auditActions: [madSksAuditAction({ type: 'db_write', command: '[SQL_PLANE_EXECUTED]', rollback_available: rollbackKind === 'compensating_sql', risk_level: 'critical', notes: [`cycle:${result.cycle_id}`] })],
    verification,
    forceProtectedCoreChanged: input.__test_protected_core_changed === true
  });
  return resultFromEvidence({
    executor: sqlPlaneExecutor.id,
    actionType: 'db_write',
    context,
    status: result.ok ? 'applied' : 'failed',
    evidence,
    verification,
    blockers: result.blockers || [],
    writesPerformed: result.execution?.ok === true,
    extra: {
      guard,
      sql_classification: classification,
      catastrophic,
      rollback_kind: rollbackKind,
      operation_classes: result.operation?.operation_classes || operationClasses,
      mad_db_cycle_result: result,
      sql_plane: sqlPlaneSummary(readBackPassed, profileClosed, result, result.operation?.operation_classes || operationClasses)
    }
  });
}

async function resolveSqlPlaneSql(input: MadSksExecutorInput, context: MadSksExecutorContext, migrationFile: string) {
  const inline = String(input.sql || input.migration_sql || '').trim();
  if (inline) return inline;
  if (!migrationFile) return '';
  const resolved = path.isAbsolute(migrationFile) ? migrationFile : path.resolve(context.target_root, migrationFile);
  return String(await readText(resolved, '') || '');
}

async function runSqlPlaneCycle(input: MadSksExecutorInput, context: MadSksExecutorContext, cycleInput: Parameters<typeof runMadDbCycle>[0]) {
  const fixture = input.__test_mad_db_cycle_result;
  if (fixture && (process.env.NODE_ENV === 'test' || process.env.SKS_TEST_MOCK_MAD_DB_CYCLE === '1')) return fixture as Awaited<ReturnType<typeof runMadDbCycle>>;
  return withMadDbLock(context.target_root, String(input.mission_id || input.missionId || ''), 'mad-sks-sql-plane', () => runMadDbCycle(cycleInput));
}

function sqlPlaneSummary(readBackPassed: boolean, profileClosed: boolean, result: any, operationClasses: unknown[]) {
  return {
    requested: true,
    capability_id: result ? `${result.mission_id}:${result.cycle_id}` : null,
    operation_classes: operationClasses,
    read_back_passed: readBackPassed,
    profile_closed: profileClosed
  };
}
