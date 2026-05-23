import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ensureDir,
  nowIso,
  packageRoot,
  readJson,
  readText,
  sha256,
  writeJsonAtomic,
  writeTextAtomic
} from '../fsx.js';
import { createMadSksAuditLedger, madSksAuditAction, writeMadSksAuditLedger } from './audit-ledger.js';
import { compareProtectedCoreSnapshots, evaluateMadSksWrite, snapshotProtectedCore } from './immutable-harness-guard.js';
import { createMadSksProofEvidence, writeMadSksProofEvidence } from './proof-evidence.js';
import { MAD_SKS_ROLLBACK_PLAN_SCHEMA } from './rollback-plan.js';

export const MAD_SKS_ROLLBACK_APPLY_SCHEMA = 'sks.mad-sks-rollback-apply.v1';

export async function applyMadSksRollbackPlan({
  rollbackPlanPath,
  targetRoot = process.cwd(),
  artifactDir = null,
  dryRun = false,
  yes = false,
  root = packageRoot()
}: {
  rollbackPlanPath?: string | null;
  targetRoot?: string;
  artifactDir?: string | null;
  dryRun?: boolean;
  yes?: boolean;
  root?: string;
} = {}) {
  const resolvedTargetRoot = path.resolve(targetRoot || process.cwd());
  if (!rollbackPlanPath) {
    return blocked('rollback_plan_path_required', { targetRoot: resolvedTargetRoot });
  }
  const planPath = path.resolve(rollbackPlanPath);
  const plan = await readJson(planPath, null);
  if (!plan || plan.schema !== MAD_SKS_ROLLBACK_PLAN_SCHEMA) {
    return blocked('rollback_plan_schema_invalid', { rollbackPlanPath: planPath, targetRoot: resolvedTargetRoot });
  }
  if (!dryRun && !yes) {
    return blocked('rollback_apply_requires_yes', { rollbackPlanPath: planPath, targetRoot: resolvedTargetRoot });
  }

  const outputDir = path.resolve(artifactDir || path.dirname(planPath));
  await ensureDir(outputDir);
  const before = await snapshotProtectedCore(root, 'rollback-apply-before');
  const actions = [];
  const blockedActions = [];
  const changedFiles: string[] = [];
  const verification = [];

  for (const rollback of plan.file_rollbacks || []) {
    const file = path.resolve(String(rollback.path || ''));
    const decision = await evaluateMadSksWrite({ packageRoot: root, targetRoot: resolvedTargetRoot, operation: 'rollback_apply', path: file });
    if (!decision.ok) {
      blockedActions.push(decision);
      continue;
    }
    const beforeContent = await readText(file, null);
    const beforeHash = beforeContent === null ? null : sha256(beforeContent);
    const restoreHash = rollback.previous_content_hash || null;

    if (!dryRun) {
      if (rollback.existed_before === false) {
        await fsp.rm(file, { recursive: true, force: true });
      } else if (rollback.snapshot_path) {
        const snapshot = await readText(path.resolve(String(rollback.snapshot_path)), '');
        await ensureDir(path.dirname(file));
        await writeTextAtomic(file, snapshot);
      } else {
        blockedActions.push({ ...decision, ok: false, decision: 'blocked', reason: 'rollback_snapshot_missing' });
        continue;
      }
      changedFiles.push(file);
    }

    const afterContent = await readText(file, null);
    const afterHash = afterContent === null ? null : sha256(afterContent);
    actions.push(madSksAuditAction({
      type: 'file_write',
      target: file,
      before_hash: beforeHash,
      after_hash: dryRun ? restoreHash : afterHash,
      rollback_available: true,
      protected_core_impact: 'none',
      notes: dryRun ? ['dry_run_no_rollback_write_performed'] : ['rollback_apply_restore']
    }));
    verification.push({
      kind: 'rollback_file_restore',
      path: file,
      dry_run: dryRun,
      ok: dryRun ? true : rollback.existed_before === false ? afterHash === null : !restoreHash || afterHash === restoreHash,
      expected_hash: restoreHash,
      actual_hash: dryRun ? null : afterHash
    });
  }

  const packageRollbacks = plan.package_rollbacks || [];
  for (const rollback of packageRollbacks) {
    const file = path.resolve(String(rollback.path || ''));
    const decision = await evaluateMadSksWrite({ packageRoot: root, targetRoot: resolvedTargetRoot, operation: 'rollback_apply', path: file });
    if (!decision.ok) {
      blockedActions.push(decision);
      continue;
    }
    if (!rollback.snapshot_path) {
      blockedActions.push({ ...decision, ok: false, decision: 'blocked', reason: 'package_manifest_snapshot_missing', path: file });
      verification.push({ kind: 'package_manifest_restore', ok: false, path: file, reason: 'snapshot_missing' });
      continue;
    }
    if (!dryRun) {
      const snapshot = await readText(path.resolve(String(rollback.snapshot_path)), '');
      await ensureDir(path.dirname(file));
      await writeTextAtomic(file, snapshot);
      changedFiles.push(file);
    }
    const afterContent = await readText(file, null);
    const afterHash = afterContent === null ? null : sha256(afterContent);
    actions.push(madSksAuditAction({
      type: 'package_install',
      target: file,
      after_hash: dryRun ? rollback.previous_hash || null : afterHash,
      rollback_available: true,
      protected_core_impact: 'none',
      notes: dryRun ? ['dry_run_no_package_rollback_write_performed'] : ['package_manifest_restore']
    }));
    verification.push({
      kind: 'package_manifest_restore',
      path: file,
      dry_run: dryRun,
      ok: dryRun ? true : !rollback.previous_hash || afterHash === rollback.previous_hash,
      expected_hash: rollback.previous_hash || null,
      actual_hash: dryRun ? null : afterHash
    });
  }

  const serviceRollbacks = plan.service_rollbacks || [];
  const dbRollbacks = plan.db_rollbacks || [];
  for (const entry of [...serviceRollbacks, ...dbRollbacks]) {
    blockedActions.push({ ok: false, decision: 'blocked', reason: 'rollback_requires_external_adapter', entry });
    verification.push({ kind: 'manual_rollback_instruction_recorded', ok: true, entry, blocker: 'rollback_requires_external_adapter' });
  }

  const after = await snapshotProtectedCore(root, 'rollback-apply-after');
  const comparison = compareProtectedCoreSnapshots(before, after);
  const auditPath = path.join(outputDir, 'mad-sks-rollback-apply-audit-ledger.json');
  const proofPath = path.join(outputDir, 'mad-sks-rollback-apply-proof-evidence.json');
  const beforePath = path.join(outputDir, 'mad-sks-rollback-apply-protected-core-before.json');
  const afterPath = path.join(outputDir, 'mad-sks-rollback-apply-protected-core-after.json');
  const comparisonPath = path.join(outputDir, 'mad-sks-rollback-apply-protected-core-comparison.json');
  await writeJsonAtomic(beforePath, before);
  await writeJsonAtomic(afterPath, after);
  await writeJsonAtomic(comparisonPath, comparison);
  const audit = createMadSksAuditLedger({ targetRoot: resolvedTargetRoot, actions, blockedActions });
  await writeMadSksAuditLedger(auditPath, audit);
  const proof = createMadSksProofEvidence({
    authorizationManifestPath: plan.authorization_manifest_path || planPath,
    auditLedgerPath: auditPath,
    rollbackPlanPath: planPath,
    protectedCoreBefore: beforePath,
    protectedCoreAfter: afterPath,
    protectedCoreComparison: comparison,
    changedTargetFiles: changedFiles,
    blockedActions,
    verification
  });
  await writeMadSksProofEvidence(proofPath, proof);

  const ok = proof.ok === true && comparison.ok === true && blockedActions.length === 0;
  return {
    schema: MAD_SKS_ROLLBACK_APPLY_SCHEMA,
    ok,
    status: ok ? (dryRun ? 'dry_run' : 'applied') : 'blocked',
    dry_run: dryRun,
    rollback_plan: planPath,
    target_root: resolvedTargetRoot,
    changed_files: changedFiles,
    writes_performed: !dryRun && changedFiles.length > 0,
    audit_ledger: auditPath,
    proof_evidence: proofPath,
    protected_core_before: beforePath,
    protected_core_after: afterPath,
    protected_core_unchanged: comparison.ok === true,
    blocked_actions: blockedActions,
    verification,
    generated_at: nowIso()
  };
}

function blocked(reason: string, extra: Record<string, unknown> = {}) {
  return {
    schema: MAD_SKS_ROLLBACK_APPLY_SCHEMA,
    ok: false,
    status: 'blocked',
    reason,
    generated_at: nowIso(),
    ...extra
  };
}
