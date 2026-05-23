import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export const MAD_SKS_ROLLBACK_PLAN_SCHEMA = 'sks.mad-sks-rollback-plan.v1';

export function createMadSksRollbackPlan({
  targetRoot,
  fileRollbacks = [],
  dbRollbacks = [],
  serviceRollbacks = [],
  packageRollbacks = [],
  unavailable = [],
  authorizationManifestPath = null
}: {
  targetRoot: string;
  fileRollbacks?: unknown[];
  dbRollbacks?: unknown[];
  serviceRollbacks?: unknown[];
  packageRollbacks?: unknown[];
  unavailable?: unknown[];
  authorizationManifestPath?: string | null;
}) {
  const highRisk = unavailable.length > 0;
  return {
    schema: MAD_SKS_ROLLBACK_PLAN_SCHEMA,
    ok: !highRisk,
    generated_at: nowIso(),
    target_root: path.resolve(targetRoot),
    authorization_manifest_path: authorizationManifestPath,
    file_rollbacks: fileRollbacks,
    db_rollbacks: dbRollbacks,
    service_rollbacks: serviceRollbacks,
    package_rollbacks: packageRollbacks,
    unavailable,
    rollback_unavailable_count: unavailable.length,
    high_risk_confirmation_required: highRisk,
    included_in_completion_proof: true,
    included_in_trust_report: true
  };
}

export async function writeMadSksRollbackPlan(file: string, plan: ReturnType<typeof createMadSksRollbackPlan>) {
  await writeJsonAtomic(file, plan);
  return plan;
}
