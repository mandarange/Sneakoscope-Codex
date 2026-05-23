import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { classifySql } from '../shell-argv-classifier.js';
import { madSksAuditAction } from '../audit-ledger.js';
import { hashFileIfExists, resolveTargetPath, resultFromEvidence, type MadSksExecutor, type MadSksExecutorContext, type MadSksExecutorInput, writeExecutorEvidence } from './executor-base.js';

export const dbWriteExecutor: MadSksExecutor = {
  id: 'db-write',
  action_type: 'db_write',
  async dryRun(input, context) {
    return runDbWrite(input, context, true);
  },
  async apply(input, context) {
    return runDbWrite(input, context, false);
  }
};

export async function runDbWrite(input: MadSksExecutorInput, context: MadSksExecutorContext, dryRun = Boolean(input.dry_run)) {
  const sql = String(input.sql || input.migration_sql || '');
  const sqlClassification = classifySql(sql);
  const blockers = [];
  if (!sql.trim()) blockers.push('sql_or_migration_required');
  if (sqlClassification.destructive) blockers.push(...sqlClassification.reasons);
  const migrationFile = input.migration_file || input.migration_path ? resolveTargetPath(context, input.migration_file || input.migration_path) : null;
  const migrationHash = migrationFile ? await hashFileIfExists(migrationFile) : null;
  const guard = await runMadSksGuardMiddleware({
    input: { action_type: 'db_write', required_scope: 'db_write', dry_run: dryRun, high_risk: true, allow_rollback_unavailable: false },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) blockers.push(...guard.issues);
  if (blockers.length) {
    return resultFromEvidence({ executor: dbWriteExecutor.id, actionType: 'db_write', context, status: 'blocked', blockedActions: [guard, sqlClassification], blockers });
  }
  const verification = [{ kind: 'db_write_plan', ok: true, dry_run: dryRun, transaction_required: true, transaction_wrapper: 'required_when_supported_by_adapter', row_counts_redacted: true, migration_file: migrationFile, migration_hash: migrationHash }];
  const rollbackUnavailable = input.rollback_sql || input.down_migration ? [] : ['db_snapshot_or_rollback_sql_required_for_apply'];
  const status = !dryRun && rollbackUnavailable.length ? 'blocked' : dryRun ? 'dry_run' : 'applied';
  const evidence = await writeExecutorEvidence({
    context,
    executor: dbWriteExecutor.id,
    actionType: 'db_write',
    dbRollbacks: input.rollback_sql || input.down_migration ? [{ type: input.rollback_sql ? 'rollback_sql' : 'down_migration', sql: input.rollback_sql || input.down_migration }] : [],
    rollbackUnavailable,
    auditActions: [madSksAuditAction({ type: 'db_write', command: '[REDACTED_DB_WRITE]', rollback_available: rollbackUnavailable.length === 0, risk_level: 'high' })],
    verification
  });
  return resultFromEvidence({
    executor: dbWriteExecutor.id,
    actionType: 'db_write',
    context,
    status,
    evidence,
    verification,
    blockers: status === 'blocked' ? rollbackUnavailable : [],
    writesPerformed: status === 'applied',
    extra: { guard, sql_classification: sqlClassification, migration_file: migrationFile, migration_hash: migrationHash, affected_tables: input.affected_tables || [] }
  });
}
