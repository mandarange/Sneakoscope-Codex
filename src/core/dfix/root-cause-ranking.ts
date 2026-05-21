import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export async function writeDfixRootCauseRankingArtifact(dir: string, input: any = {}) {
  const ranking = rankDfixRootCauses(input);
  await writeJsonAtomic(path.join(dir, 'dfix-root-cause-ranking.json'), ranking);
  return ranking;
}

export function rankDfixRootCauses(input: any = {}) {
  const signature = input.signature || {};
  const file = input.file || signature.file || null;
  const candidates = [
    candidate('signature-primary', rootCauseFor(signature.error_kind, file), 0.78, [file].filter(Boolean), 'direct'),
    candidate('changed-file-context', file ? `Recent or targeted change around ${file}.` : 'No changed-file target available.', file ? 0.62 : 0.35, [file].filter(Boolean), file ? 'local_static' : 'needs_handoff'),
    candidate('verification-contract', 'Verification command or release gate is the acceptance source.', 0.58, [], 'verification_first')
  ];
  const selected = candidates.slice().sort((a, b) => b.ranking_score - a.ranking_score)[0] ?? candidate('fallback', 'Root cause could not be ranked from available evidence.', 0.3, [], 'needs_handoff');
  return {
    schema: 'sks.dfix-root-cause-ranking.v2',
    created_at: nowIso(),
    candidates,
    selected_root_cause: selected,
    confidence_threshold: 0.55,
    patch_apply_allowed: selected.confidence >= 0.55,
    blockers: selected.confidence < 0.55 ? ['root_cause_confidence_below_threshold'] : []
  };
}

function candidate(id: string, summary: string, confidence: number, affectedFiles: any[], patchability: string) {
  const verificationCost = affectedFiles.length ? 0.2 : 0.6;
  const patchScore = patchability === 'direct' ? 0.2 : patchability === 'local_static' ? 0.12 : 0.02;
  return {
    id,
    summary,
    confidence,
    evidence_ids: ['dfix-error-signature.json', 'dfix-diagnosis.json'],
    affected_files: affectedFiles,
    patchability,
    verification_cost: verificationCost,
    ranking_score: Number((confidence + patchScore - verificationCost * 0.2).toFixed(3))
  };
}

function rootCauseFor(kind: string, file: string | null) {
  const target = file ? ` in ${file}` : '';
  if (kind === 'missing-file') return `Missing path or generated artifact${target}.`;
  if (kind === 'module-not-found') return `Import/module resolution mismatch${target}.`;
  if (kind === 'nullish-typeerror') return `Runtime value shape needs a narrow null/undefined guard${target}.`;
  if (kind === 'schema-validation') return `Structured artifact is missing a required field${target}.`;
  if (kind === 'hook-warning') return `Codex hook config/output drift is causing a warning${target}.`;
  if (kind === 'visual-artifact-gate') return `Visual route evidence graph is incomplete${target}.`;
  return `Root cause inferred from the diagnostic signature${target}.`;
}
