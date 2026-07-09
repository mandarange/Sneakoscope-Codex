import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ensureDir,
  nowIso,
  packageRoot,
  readText,
  sha256,
  writeJsonAtomic,
  writeTextAtomic
} from '../../fsx.js';
import { createMadSksAuditLedger, madSksAuditAction, writeMadSksAuditLedger } from '../audit-ledger.js';
import { type MadSksAuthorizationManifest } from '../authorization-manifest.js';
import { compareProtectedCoreSnapshots, snapshotProtectedCore } from '../immutable-harness-guard.js';
import { type MadSksPermissionModel } from '../permission-model.js';
import { createMadSksProofEvidence, writeMadSksProofEvidence } from '../proof-evidence.js';
import { createMadSksRollbackPlan, writeMadSksRollbackPlan } from '../rollback-plan.js';
import { redactMadSksSecrets, type MadSksActionType } from '../write-guard.js';

export const MAD_SKS_EXECUTOR_INPUT_SCHEMA = 'sks.mad-sks-executor-input.v1';
export const MAD_SKS_EXECUTOR_RESULT_SCHEMA = 'sks.mad-sks-executor-result.v1';

export interface MadSksExecutorContext {
  target_root: string;
  package_root: string;
  artifact_dir: string;
  authorization_manifest: MadSksAuthorizationManifest | null;
  authorization_manifest_path?: string | null;
  permission_model: MadSksPermissionModel;
  local_only_artifact_policy: true;
}

export interface MadSksExecutorInput {
  schema?: typeof MAD_SKS_EXECUTOR_INPUT_SCHEMA;
  executor: string;
  action?: string;
  dry_run?: boolean;
  target_root?: string;
  target_path?: string;
  path?: string;
  content?: string;
  command?: string | string[];
  argv?: string[];
  cwd?: string;
  artifact_dir?: string;
  authorization_manifest?: MadSksAuthorizationManifest | null;
  authorization_manifest_path?: string | null;
  permission_model?: MadSksPermissionModel;
  [key: string]: unknown;
}

export interface MadSksExecutorResult {
  schema: typeof MAD_SKS_EXECUTOR_RESULT_SCHEMA;
  ok: boolean;
  status: 'dry_run' | 'applied' | 'blocked' | 'failed' | 'handoff_ready';
  executor: string;
  action_type: MadSksActionType;
  target_root: string;
  changed_files: string[];
  audit_ledger_path: string | null;
  rollback_plan_path: string | null;
  proof_evidence_path: string | null;
  verification: unknown[];
  blocked_actions: unknown[];
  blockers: string[];
  writes_performed: boolean;
  local_only_artifact_policy: true;
  generated_at: string;
  [key: string]: unknown;
}

export interface MadSksExecutor {
  id: string;
  action_type: MadSksActionType;
  dryRun(input: MadSksExecutorInput, context: MadSksExecutorContext): Promise<MadSksExecutorResult>;
  apply(input: MadSksExecutorInput, context: MadSksExecutorContext): Promise<MadSksExecutorResult>;
}

export function createMadSksExecutorContext(input: MadSksExecutorInput): MadSksExecutorContext {
  const targetRoot = path.resolve(String(input.target_root || input.permission_model?.target_root || process.cwd()));
  return {
    target_root: targetRoot,
    package_root: packageRoot(),
    artifact_dir: path.resolve(String(input.artifact_dir || path.join(targetRoot, '.sneakoscope', 'mad-sks-artifacts'))),
    authorization_manifest: input.authorization_manifest || null,
    authorization_manifest_path: input.authorization_manifest_path || null,
    permission_model: input.permission_model as MadSksPermissionModel,
    local_only_artifact_policy: true
  };
}

export function executorBlocker({
  executor,
  actionType,
  context,
  blockers,
  blockedActions = []
}: {
  executor: string;
  actionType: MadSksActionType;
  context: MadSksExecutorContext;
  blockers: string[];
  blockedActions?: unknown[];
}): MadSksExecutorResult {
  return {
    schema: MAD_SKS_EXECUTOR_RESULT_SCHEMA,
    ok: false,
    status: 'blocked',
    executor,
    action_type: actionType,
    target_root: context.target_root,
    changed_files: [],
    audit_ledger_path: null,
    rollback_plan_path: null,
    proof_evidence_path: null,
    verification: [],
    blocked_actions: blockedActions,
    blockers,
    writes_performed: false,
    local_only_artifact_policy: true,
    generated_at: nowIso()
  };
}

// Capture the protected-core snapshot BEFORE an executor performs any
// mutation. writeExecutorEvidence() runs after the mutation is already done
// (it needs the resulting changedFiles/hashes), so it cannot itself take an
// honest "before" snapshot — doing so there always compared post-mutation
// state against post-mutation state, structurally guaranteeing
// protected_core_unchanged: true regardless of what actually happened
// (20차 P0-7). Call this first, then pass the result to writeExecutorEvidence.
export async function snapshotProtectedCoreBefore(context: MadSksExecutorContext, executor: string) {
  return snapshotProtectedCore(context.package_root, `${executor}-before`);
}

export async function writeExecutorEvidence({
  context,
  executor,
  actionType,
  beforeSnapshot,
  changedFiles = [],
  blockedActions = [],
  fileRollbacks = [],
  packageRollbacks = [],
  serviceRollbacks = [],
  dbRollbacks = [],
  rollbackUnavailable = [],
  auditActions = [],
  verification = [],
  forceProtectedCoreChanged = false
}: {
  context: MadSksExecutorContext;
  executor: string;
  actionType: MadSksActionType;
  beforeSnapshot?: Awaited<ReturnType<typeof snapshotProtectedCore>>;
  changedFiles?: string[];
  blockedActions?: unknown[];
  fileRollbacks?: unknown[];
  packageRollbacks?: unknown[];
  serviceRollbacks?: unknown[];
  dbRollbacks?: unknown[];
  rollbackUnavailable?: unknown[];
  auditActions?: ReturnType<typeof madSksAuditAction>[];
  verification?: unknown[];
  forceProtectedCoreChanged?: boolean;
}) {
  await ensureDir(context.artifact_dir);
  // Falls back to a call-time snapshot only when the caller didn't capture
  // one before mutating (e.g. blocked/dry-run paths where nothing changed) —
  // callers that perform a real mutation must pass beforeSnapshot.
  const before = beforeSnapshot || await snapshotProtectedCore(context.package_root, `${executor}-before`);
  const after = await snapshotProtectedCore(context.package_root, `${executor}-after`);
  const comparison = forceProtectedCoreChanged && (process.env.NODE_ENV === 'test' || process.env.SKS_TEST_FORCE_PROTECTED_CORE_CHANGED === '1')
    ? {
        ...compareProtectedCoreSnapshots(before, after),
        ok: false,
        changed: [{ id: '__test_protected_core_changed', before_digest: before.digest, after_digest: after.digest }]
      }
    : compareProtectedCoreSnapshots(before, after);
  const beforePath = path.join(context.artifact_dir, `${executor}-protected-core-before.json`);
  const afterPath = path.join(context.artifact_dir, `${executor}-protected-core-after.json`);
  const comparisonPath = path.join(context.artifact_dir, `${executor}-protected-core-comparison.json`);
  const auditPath = path.join(context.artifact_dir, `${executor}-audit-ledger.json`);
  const rollbackPath = path.join(context.artifact_dir, `${executor}-rollback-plan.json`);
  const proofPath = path.join(context.artifact_dir, `${executor}-proof-evidence.json`);
  await writeJsonAtomic(beforePath, before);
  await writeJsonAtomic(afterPath, after);
  await writeJsonAtomic(comparisonPath, comparison);
  const audit = createMadSksAuditLedger({
    authorizationManifestPath: context.authorization_manifest_path || null,
    targetRoot: context.target_root,
    actions: auditActions,
    blockedActions
  });
  const rollback = createMadSksRollbackPlan({
    targetRoot: context.target_root,
    authorizationManifestPath: context.authorization_manifest_path || null,
    fileRollbacks,
    packageRollbacks,
    serviceRollbacks,
    dbRollbacks,
    unavailable: rollbackUnavailable
  });
  await writeMadSksAuditLedger(auditPath, audit);
  await writeMadSksRollbackPlan(rollbackPath, rollback);
  const proof = createMadSksProofEvidence({
    authorizationManifestPath: context.authorization_manifest_path || null,
    auditLedgerPath: auditPath,
    rollbackPlanPath: rollbackPath,
    protectedCoreBefore: beforePath,
    protectedCoreAfter: afterPath,
    protectedCoreComparison: comparison,
    changedTargetFiles: changedFiles,
    blockedActions,
    verification
  });
  await writeMadSksProofEvidence(proofPath, proof);
  return { auditPath, rollbackPath, proofPath, beforePath, afterPath, comparisonPath, audit, rollback, proof, comparison };
}

export async function fileContentSnapshot(file: string) {
  const exists = await pathExists(file);
  const content = exists ? await readText(file, '') : null;
  return {
    path: file,
    existed_before: exists,
    content,
    content_hash: content === null ? null : sha256(content)
  };
}

export async function writeRollbackSnapshot(context: MadSksExecutorContext, snapshot: Awaited<ReturnType<typeof fileContentSnapshot>>) {
  const snapshotHash = sha256(`${snapshot.path}:${snapshot.content_hash || 'missing'}:${nowIso()}`);
  const snapshotPath = path.join(context.artifact_dir, 'rollback-snapshots', `${snapshotHash}.txt`);
  await ensureDir(path.dirname(snapshotPath));
  if (snapshot.content !== null) await writeTextAtomic(snapshotPath, snapshot.content);
  return snapshotPath;
}

export async function hashFileIfExists(file: string) {
  if (!(await pathExists(file))) return null;
  return sha256(await fsp.readFile(file));
}

export async function pathExists(file: string) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

export function resolveTargetPath(context: MadSksExecutorContext, candidate: unknown) {
  const raw = String(candidate || '');
  if (!raw) return path.join(context.target_root, '.sneakoscope', 'mad-sks-target-file.txt');
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(context.target_root, raw);
}

export function resultFromEvidence({
  executor,
  actionType,
  context,
  status,
  changedFiles = [],
  evidence,
  verification = [],
  blockedActions = [],
  blockers = [],
  writesPerformed = false,
  extra = {}
}: {
  executor: string;
  actionType: MadSksActionType;
  context: MadSksExecutorContext;
  status: MadSksExecutorResult['status'];
  changedFiles?: string[];
  evidence?: Awaited<ReturnType<typeof writeExecutorEvidence>>;
  verification?: unknown[];
  blockedActions?: unknown[];
  blockers?: string[];
  writesPerformed?: boolean;
  extra?: Record<string, unknown>;
}): MadSksExecutorResult {
  return {
    schema: MAD_SKS_EXECUTOR_RESULT_SCHEMA,
    ok: blockers.length === 0 && evidence?.proof?.ok !== false,
    status,
    executor,
    action_type: actionType,
    target_root: context.target_root,
    changed_files: changedFiles,
    audit_ledger_path: evidence?.auditPath || null,
    rollback_plan_path: evidence?.rollbackPath || null,
    proof_evidence_path: evidence?.proofPath || null,
    verification,
    blocked_actions: blockedActions,
    blockers,
    writes_performed: writesPerformed,
    local_only_artifact_policy: true,
    generated_at: nowIso(),
    ...extra
  };
}

export function redactedCommand(command: string | string[] | undefined) {
  if (Array.isArray(command)) return command.map((part) => redactMadSksSecrets(part)).join(' ');
  return redactMadSksSecrets(command || '');
}
