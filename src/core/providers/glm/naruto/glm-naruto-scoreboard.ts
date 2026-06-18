import type {
  GlmNarutoCandidateScore,
  GlmNarutoCandidateScoreboard,
  GlmNarutoConflictGraph,
  GlmNarutoPatchEnvelope,
  GlmNarutoWorkerTrace
} from './glm-naruto-types.js';

const SECRET_PATTERN = /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+|sk-(?:or-)?[A-Za-z0-9_-]{12,}|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)\b/;

export function buildGlmNarutoCandidateScoreboard(input: {
  readonly missionId: string;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly traces: readonly GlmNarutoWorkerTrace[];
  readonly graph: GlmNarutoConflictGraph;
  readonly requestedPaths: readonly string[];
}): GlmNarutoCandidateScoreboard {
  const strategyCounts = new Map<string, Set<string>>();
  for (const envelope of input.envelopes) {
    const set = strategyCounts.get(envelope.shard_id) ?? new Set<string>();
    set.add(envelope.strategy);
    strategyCounts.set(envelope.shard_id, set);
  }

  return {
    schema: 'sks.glm-naruto-candidate-scoreboard.v1',
    mission_id: input.missionId,
    scores: input.envelopes.map((envelope) => {
      const trace = input.traces.find((item) => item.worker_id === envelope.worker_id || item.patch_digest === envelope.patch_sha256);
      return scoreEnvelope({
        envelope,
        ...(trace ? { trace } : {}),
        graph: input.graph,
        requestedPaths: input.requestedPaths,
        strategyDiversity: strategyCounts.get(envelope.shard_id)?.size ?? 1
      });
    })
  };
}

function scoreEnvelope(input: {
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly trace?: GlmNarutoWorkerTrace;
  readonly graph: GlmNarutoConflictGraph;
  readonly requestedPaths: readonly string[];
  readonly strategyDiversity: number;
}): GlmNarutoCandidateScore {
  const disqualification_reasons: string[] = [];
  const secretLeak = SECRET_PATTERN.test(input.envelope.patch) || input.envelope.blockers.includes('secret_like_content');
  const verifierFailed = input.envelope.status === 'verification_failed' || input.envelope.verification_passed === false;
  const gatePassed = input.envelope.status === 'gate_passed' || input.envelope.status === 'selected' || input.envelope.verification_passed === true;
  if (!gatePassed) disqualification_reasons.push('deterministic_gate_failed');
  if (verifierFailed) disqualification_reasons.push('verifier_failed');
  if (secretLeak) disqualification_reasons.push('secret_leak');
  if (input.envelope.blockers.some((blocker) => blocker.includes('protected'))) disqualification_reasons.push('protected_path');

  const conflictCount = input.graph.edges.filter((edge) => edge.left_patch_id === input.envelope.worker_id || edge.right_patch_id === input.envelope.worker_id).length;
  const requested = new Set(input.requestedPaths);
  const targetAligned = requested.size === 0 || input.envelope.target_paths.some((target) => requested.has(target));
  const risk = clamp(input.trace?.verifier_risk_score ?? (verifierFailed ? 1 : 0));
  const confidence = clamp(input.trace?.verifier_confidence ?? (input.envelope.verification_passed ? 1 : 0));
  const latency = input.trace?.ttft_ms ?? input.trace?.total_ms ?? 0;
  const cacheTokens = input.trace?.cached_tokens ?? 0;
  const patchSizePenalty = Math.min(50, Math.ceil(input.envelope.patch.length / 400));

  const components = {
    deterministic_gate: gatePassed ? 100 : 0,
    verifier: input.envelope.verification_passed === false ? -100 : input.envelope.verification_passed === true ? 50 : 0,
    verifier_confidence: Math.round(confidence * 20),
    verifier_risk_penalty: -Math.round(risk * 50),
    patch_size_penalty: -patchSizePenalty,
    touched_path_penalty: -Math.min(30, input.envelope.target_paths.length * 5),
    target_alignment: targetAligned ? 20 : -30,
    hunk_conflict_penalty: -Math.min(60, conflictCount * 20),
    latency_penalty: -Math.min(25, Math.floor(latency / 2_000)),
    cache_bonus: Math.min(20, Math.floor(cacheTokens / 1_000)),
    strategy_diversity_bonus: input.strategyDiversity > 1 ? 10 : 0,
    secret_safety: secretLeak ? -1_000 : 25
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    schema: 'sks.glm-naruto-candidate-score.v1',
    patch_id: input.envelope.worker_id,
    shard_id: input.envelope.shard_id,
    total_score: disqualification_reasons.length ? -1_000 : total,
    components,
    disqualified: disqualification_reasons.length > 0,
    disqualification_reasons
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
