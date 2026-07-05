import type {
  GlmNarutoPatchEnvelope,
  GlmNarutoRequirementCoverageSummary,
  GlmNarutoRequirementLedger
} from './glm-naruto-types.js';

export interface GlmNarutoCandidateRequirementCoverage {
  readonly schema: 'sks.glm-naruto-candidate-requirement-coverage.v1';
  readonly mission_id: string;
  readonly worker_id: string;
  readonly patch_id: string;
  readonly requirements_satisfied: readonly string[];
  readonly requirements_risk: readonly string[];
  readonly requirements_missing: readonly string[];
  readonly assumptions: readonly string[];
}

export function enrichGlmNarutoCandidateRequirementCoverage(input: {
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly ledger: GlmNarutoRequirementLedger;
}): GlmNarutoPatchEnvelope {
  const coverage = inferCandidateRequirementCoverage(input);
  return {
    ...input.envelope,
    requirements_satisfied: coverage.requirements_satisfied,
    requirements_risk: coverage.requirements_risk,
    assumptions: coverage.assumptions
  };
}

export function inferCandidateRequirementCoverage(input: {
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly ledger: GlmNarutoRequirementLedger;
}): GlmNarutoCandidateRequirementCoverage {
  const satisfied: string[] = [];
  const risk: string[] = [];
  const missing: string[] = [];
  const assumptions: string[] = [];
  const touched = new Set(input.envelope.target_paths);
  const patch = input.envelope.patch.toLowerCase();

  for (const requirement of input.ledger.requirements) {
    const relatedPaths = extractPaths(requirement.text);
    const pathCovered = relatedPaths.some((file) => touched.has(file) || patch.includes(file.toLowerCase()));
    const lower = requirement.text.toLowerCase();
    const preservationClause = /\b(preserve|do not|don't|without|never|no fallback|no fake|보존|금지|없이)\b/.test(lower);
    const onlyClause = /\bonly\b|만\b/.test(lower);

    if (relatedPaths.length > 0 && pathCovered && (!onlyClause || input.envelope.target_paths.every((file) => relatedPaths.includes(file)))) {
      satisfied.push(requirement.id);
      continue;
    }

    if (onlyClause && relatedPaths.length > 0 && input.envelope.target_paths.some((file) => !relatedPaths.includes(file))) {
      risk.push(requirement.id);
      missing.push(requirement.id);
      continue;
    }

    if (preservationClause) {
      risk.push(requirement.id);
      missing.push(requirement.id);
      assumptions.push(`manual_preservation_evidence_required:${requirement.id}`);
      continue;
    }

    if (input.envelope.patch.trim() && hasKeywordOverlap(requirement.text, input.envelope.patch, input.envelope.target_paths)) {
      satisfied.push(requirement.id);
    } else {
      missing.push(requirement.id);
    }
  }

  return {
    schema: 'sks.glm-naruto-candidate-requirement-coverage.v1',
    mission_id: input.envelope.mission_id,
    worker_id: input.envelope.worker_id,
    patch_id: input.envelope.patch_sha256,
    requirements_satisfied: [...new Set(satisfied)],
    requirements_risk: [...new Set(risk)],
    requirements_missing: [...new Set(missing)],
    assumptions: [...new Set(assumptions)]
  };
}

export function buildGlmNarutoRequirementCoverageSummary(input: {
  readonly missionId: string;
  readonly ledger: GlmNarutoRequirementLedger;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly selectedPatchIds: readonly string[];
}): GlmNarutoRequirementCoverageSummary {
  const selected = input.selectedPatchIds.length
    ? input.envelopes.filter((env) => input.selectedPatchIds.includes(env.worker_id))
    : input.envelopes;
  const rows = input.ledger.requirements.map((requirement) => {
    const satisfiedBy = selected
      .filter((env) => env.requirements_satisfied?.includes(requirement.id))
      .map((env) => env.worker_id);
    const riskBy = selected
      .filter((env) => env.requirements_risk?.includes(requirement.id))
      .map((env) => env.worker_id);
    const covered = satisfiedBy.length > 0 && riskBy.length === 0;
    return {
      requirement_id: requirement.id,
      required: requirement.required,
      covered,
      satisfied_by: satisfiedBy,
      risk_by: riskBy
    };
  });
  const uncovered = rows
    .filter((row) => row.required && !row.covered)
    .map((row) => row.requirement_id);
  return {
    schema: 'sks.glm-naruto-requirement-coverage-summary.v1',
    mission_id: input.missionId,
    required_total: input.ledger.requirements.filter((req) => req.required).length,
    required_covered: rows.filter((row) => row.required && row.covered).length,
    uncovered_required_requirements: uncovered,
    passed: uncovered.length === 0,
    requirements: rows
  };
}

function extractPaths(text: string): readonly string[] {
  return [...new Set(text.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [])];
}

const REQUIREMENT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'be',
  'this', 'that', 'it', 'as', 'by', 'at', 'from', 'should', 'must', 'will', 'not', 'no',
  '이', '가', '을', '를', '은', '는', '에', '의', '으로', '로', '만', '및', '그리고'
]);

function extractKeywords(text: string): readonly string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9_]{3,}|[가-힣]{2,}/g) ?? [];
  return [...new Set(tokens.filter((token) => !REQUIREMENT_STOPWORDS.has(token)))];
}

function hasKeywordOverlap(requirementText: string, patch: string, targetPaths: readonly string[]): boolean {
  const keywords = extractKeywords(requirementText);
  if (keywords.length === 0) return false;
  const patchLower = patch.toLowerCase();
  const pathsLower = targetPaths.map((file) => file.toLowerCase());
  return keywords.some(
    (keyword) => patchLower.includes(keyword) || pathsLower.some((file) => file.includes(keyword))
  );
}
