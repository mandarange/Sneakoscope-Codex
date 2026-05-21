import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export async function writeDfixPathDecisionArtifact(dir: string, input: any = {}) {
  const decision = decideDfixPath(input);
  await writeJsonAtomic(path.join(dir, 'dfix-path-decision.json'), decision);
  return decision;
}

export function decideDfixPath(input: any = {}) {
  const signature = input.signature || {};
  const hasExactPatch = input.findText != null && input.replaceText != null && input.file;
  const highRisk = isHighRisk(input.file || signature.file, String(signature.normalized_message || input.error || ''));
  const ambiguous = Number(input.rootCauseConfidence ?? input.confidence ?? 0.72) < 0.55;
  const pathId = highRisk || ambiguous
    ? 'L3'
    : hasExactPatch || deterministicKind(signature.error_kind)
      ? 'L0'
      : input.file || signature.file
        ? 'L1'
        : 'L2';
  const budgets: Record<string, number> = { L0: 300, L1: 2000, L2: 30000, L3: 0 };
  return {
    schema: 'sks.dfix-path-decision.v1',
    created_at: nowIso(),
    path: pathId,
    path_label: {
      L0: 'deterministic',
      L1: 'local_static',
      L2: 'bounded_codex_patch_handoff',
      L3: 'human_review'
    }[pathId],
    root_cause_confidence: Number(input.rootCauseConfidence ?? input.confidence ?? 0.72),
    estimated_patch_risk: highRisk ? 'high' : pathId === 'L2' ? 'medium' : 'low',
    expected_verification_cost: pathId === 'L0' ? 'minimal' : pathId === 'L1' ? 'targeted' : pathId === 'L2' ? 'bounded' : 'manual',
    max_allowed_duration_ms: budgets[pathId],
    fallback_path: pathId === 'L0' ? 'L1' : pathId === 'L1' ? 'L2' : 'L3',
    blockers: pathId === 'L3' ? ['human_review_required'] : []
  };
}

function deterministicKind(kind: string) {
  return ['missing-file', 'module-not-found', 'schema-validation', 'hook-warning', 'codex-lb-env'].includes(kind);
}

function isHighRisk(file: unknown, message: string) {
  const rel = String(file || '');
  return /(^|\/)(\.env|auth|payment|security|migration|migrations|schema\.sql|prod|production)/i.test(rel)
    || /\b(auth|payment|credential|secret|migration|database write|drop table|delete all)\b/i.test(message);
}
