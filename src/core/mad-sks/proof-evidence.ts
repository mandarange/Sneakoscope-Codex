import { nowIso, writeJsonAtomic } from '../fsx.js';

export const MAD_SKS_PROOF_EVIDENCE_SCHEMA = 'sks.mad-sks-proof-evidence.v1';

export function createMadSksProofEvidence({
  authorizationManifestPath = null,
  auditLedgerPath = null,
  rollbackPlanPath = null,
  immutableHarnessGuard = null,
  protectedCoreBefore = null,
  protectedCoreAfter = null,
  protectedCoreComparison = null,
  changedTargetFiles = [],
  blockedActions = [],
  verification = []
}: any = {}) {
  const protectedCoreChanged = protectedCoreComparison?.ok === false;
  const verificationMissing = !Array.isArray(verification) || verification.length === 0;
  const rollbackMissing = !rollbackPlanPath;
  const blockers = [
    ...(authorizationManifestPath ? [] : ['authorization_manifest_missing']),
    ...(auditLedgerPath ? [] : ['audit_ledger_missing']),
    ...(rollbackMissing ? ['rollback_plan_missing'] : []),
    ...(protectedCoreChanged ? ['protected_core_changed'] : []),
    ...(verificationMissing ? ['verification_missing'] : [])
  ];
  return {
    schema: MAD_SKS_PROOF_EVIDENCE_SCHEMA,
    ok: blockers.length === 0,
    status: protectedCoreChanged ? 'blocked' : verificationMissing ? 'verified_partial' : blockers.length ? 'blocked' : 'verified',
    generated_at: nowIso(),
    authorization_manifest_path: authorizationManifestPath,
    audit_ledger_path: auditLedgerPath,
    rollback_plan_path: rollbackPlanPath,
    immutable_harness_guard_result: immutableHarnessGuard,
    protected_core_before: protectedCoreBefore,
    protected_core_after: protectedCoreAfter,
    protected_core_comparison: protectedCoreComparison,
    protected_core_unchanged: protectedCoreComparison ? protectedCoreComparison.ok === true : null,
    changed_target_files: changedTargetFiles,
    blocked_actions: blockedActions,
    verification,
    local_only_artifact_policy: true,
    blockers
  };
}

export async function writeMadSksProofEvidence(file: string, evidence: ReturnType<typeof createMadSksProofEvidence>) {
  await writeJsonAtomic(file, evidence);
  return evidence;
}
