import type { GlmNarutoPatchEnvelope, GlmNarutoJudgeResult } from './glm-naruto-types.js';
import { buildGlm52Request } from '../glm-52-request.js';
import { sendOpenRouterChatCompletionStream } from '../../openrouter/openrouter-stream.js';
import { assertGlm52ActualModel } from '../glm-52-response-guard.js';
import type { OpenRouterChatMessage } from '../../openrouter/openrouter-types.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';

export async function runGlmJudge(input: {
  readonly apiKey: string;
  readonly missionId: string;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly timeoutMs?: number;
}): Promise<GlmNarutoJudgeResult> {
  const validEnvelopes = input.envelopes.filter((e) => e.status === 'gate_passed');
  if (validEnvelopes.length === 0) {
    return {
      schema: 'sks.glm-naruto-judge.v1',
      ranked_patch_ids: [],
      reject_patch_ids: [],
      mergeable_sets: [],
      risks: ['no_gate_passed_candidates'],
      requires_repair_wave: false
    };
  }

  const systemPrompt = `You are a GLM Naruto judge. Rank patch candidates by quality. Output strict JSON with schema: {"ranked_patch_ids":["id1","id2"],"reject_patch_ids":["id3"],"mergeable_sets":[["id1","id2"]],"risks":[],"requires_repair_wave":false}. Model: ${GLM_52_OPENROUTER_MODEL}. No GPT fallback.`;

  const candidateDescriptions = validEnvelopes.map((e) => ({
    patch_id: e.worker_id,
    shard_id: e.shard_id,
    target_paths: e.target_paths,
    patch_sha256: e.patch_sha256.slice(0, 12),
    strategy: e.strategy,
    patch_size: e.patch.length
  }));

  const userContent = JSON.stringify({
    mission_id: input.missionId,
    candidates: candidateDescriptions,
    instruction: 'Rank by: gate pass, minimal diff, correct target paths, no protected paths. Return mergeable non-conflicting sets.'
  });

  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const request = buildGlm52Request({
    profile: 'deep',
    messages,
    maxTokens: 8192,
    reasoningEffort: 'high',
    toolChoice: 'none',
    parallelToolCalls: false
  });

  const response = await sendOpenRouterChatCompletionStream({
    apiKey: input.apiKey,
    request: { ...request, session_id: `sks-glm-naruto-judge-${input.missionId}` },
    timeoutMs: input.timeoutMs || 120_000
  });

  if (!response.ok) {
    return fallbackJudgeResult(validEnvelopes, [`judge_request_failed:${response.error.code}`]);
  }

  const modelGuard = assertGlm52ActualModel(response.value.model);
  if (!modelGuard.ok) {
    return fallbackJudgeResult(validEnvelopes, [`judge_model_guard:${modelGuard.code}`]);
  }

  try {
    const jsonMatch = response.value.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackJudgeResult(validEnvelopes, ['judge_no_json_output']);
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      schema: 'sks.glm-naruto-judge.v1',
      ranked_patch_ids: Array.isArray(parsed.ranked_patch_ids) ? parsed.ranked_patch_ids : [],
      reject_patch_ids: Array.isArray(parsed.reject_patch_ids) ? parsed.reject_patch_ids : [],
      mergeable_sets: Array.isArray(parsed.mergeable_sets) ? parsed.mergeable_sets : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      requires_repair_wave: Boolean(parsed.requires_repair_wave)
    };
  } catch {
    return fallbackJudgeResult(validEnvelopes, ['judge_json_parse_failed']);
  }
}

function fallbackJudgeResult(envelopes: readonly GlmNarutoPatchEnvelope[], risks: string[]): GlmNarutoJudgeResult {
  const sorted = [...envelopes].sort((a, b) => a.patch.length - b.patch.length);
  return {
    schema: 'sks.glm-naruto-judge.v1',
    ranked_patch_ids: sorted.map((e) => e.worker_id),
    reject_patch_ids: [],
    mergeable_sets: sorted.length > 0 ? [[sorted[0]!.worker_id]] : [],
    risks,
    requires_repair_wave: false
  };
}
