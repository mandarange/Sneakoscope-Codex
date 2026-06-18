import crypto from 'node:crypto';
import { nowIso } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { buildGlm52Request } from '../glm-52-request.js';
import { sendOpenRouterChatCompletionStream } from '../../openrouter/openrouter-stream.js';
import { assertGlm52ActualModel } from '../glm-52-response-guard.js';
import { encodeGlmRequestWithCache } from '../glm-request-cache.js';
import { parsePatchCandidateOutput, createPatchEnvelope, digestPatch } from './glm-naruto-patch-envelope.js';
import type { GlmNarutoShard, GlmNarutoPatchEnvelope, GlmNarutoWorkerTrace, GlmNarutoReasoningEffort } from './glm-naruto-types.js';
import type { OpenRouterChatMessage } from '../../openrouter/openrouter-types.js';

export interface WorkerRunInput {
  readonly apiKey: string;
  readonly missionId: string;
  readonly workerId: string;
  readonly shard: GlmNarutoShard;
  readonly contextSummary: string;
  readonly timeoutMs: number;
}

export interface WorkerRunResult {
  readonly envelope: GlmNarutoPatchEnvelope | null;
  readonly trace: GlmNarutoWorkerTrace;
  readonly ok: boolean;
  readonly error?: string;
}

const STABLE_SYSTEM_PREFIX = `You are a SKS GLM Naruto patch worker. Model lock: ${GLM_52_OPENROUTER_MODEL}. No GPT/OpenAI fallback allowed. Output only <sks_patch_candidate>, <sks_need_context>, or <sks_blocked> envelopes. Use unified diff format for patches. Never write to main workspace directly. Follow proof-first mutation rules.`;

export async function runPatchWorker(input: WorkerRunInput): Promise<WorkerRunResult> {
  const started = Date.now();
  const sessionId = `sks-glm-naruto-${input.missionId}-${input.workerId}`;
  const reasoningEffort: GlmNarutoReasoningEffort = input.shard.reasoning;

  const shardSuffix = JSON.stringify({
    shard_id: input.shard.id,
    task: input.shard.task,
    target_paths: input.shard.target_paths,
    forbidden_paths: input.shard.forbidden_paths,
    base_digest: input.shard.base_digest,
    strategy: input.shard.strategy,
    context: input.contextSummary,
    output_requirement: 'Produce a unified diff patch inside <sks_patch_candidate> tags with summary, target_paths, base_digest, strategy, and patch fields.'
  });

  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: STABLE_SYSTEM_PREFIX },
    { role: 'user', content: shardSuffix }
  ];

  const request = buildGlm52Request({
    profile: 'speed',
    messages,
    maxTokens: input.shard.max_tokens,
    toolChoice: 'none',
    parallelToolCalls: false,
    providerSort: 'throughput'
  });

  const requestWithSession = { ...request, session_id: sessionId };
  const encoded = encodeGlmRequestWithCache(requestWithSession);

  const traceBase: GlmNarutoWorkerTrace = {
    worker_id: input.workerId,
    shard_id: input.shard.id,
    strategy: input.shard.strategy,
    model: GLM_52_OPENROUTER_MODEL,
    provider: 'openrouter',
    session_id: sessionId,
    ttft_ms: null,
    total_ms: 0,
    request_cache_hit: encoded.cacheHit,
    output_digest: crypto.createHash('sha256').update(shardSuffix).digest('hex'),
    patch_digest: null,
    status: 'running'
  };

  try {
    const response = await sendOpenRouterChatCompletionStream({
      apiKey: input.apiKey,
      request: requestWithSession,
      timeoutMs: input.timeoutMs
    });

    if (!response.ok) {
      return {
        envelope: null,
        trace: { ...traceBase, total_ms: Date.now() - started, status: 'failed' },
        ok: false,
        error: response.error.code
      };
    }

    const modelGuard = assertGlm52ActualModel(response.value.model || GLM_52_OPENROUTER_MODEL);
    if (!modelGuard.ok) {
      return {
        envelope: null,
        trace: { ...traceBase, total_ms: Date.now() - started, status: 'blocked' },
        ok: false,
        error: `model_guard:${modelGuard.code}`
      };
    }

    const parsed = parsePatchCandidateOutput(response.value.content);

    if (parsed.kind !== 'patch') {
      return {
        envelope: null,
        trace: {
          ...traceBase,
          ttft_ms: response.value.ttft_ms,
          total_ms: Date.now() - started,
          status: parsed.kind === 'blocked' ? 'blocked' : 'no_patch'
        },
        ok: false,
        error: parsed.kind
      };
    }

    const envelope = createPatchEnvelope({
      missionId: input.missionId,
      workerId: input.workerId,
      shardId: input.shard.id,
      baseDigest: input.shard.base_digest,
      patch: parsed.content,
      strategy: input.shard.strategy,
      reasoningEffort
    });

    const trace: GlmNarutoWorkerTrace = {
      ...traceBase,
      ttft_ms: response.value.ttft_ms,
      total_ms: Date.now() - started,
      patch_digest: digestPatch(envelope.patch),
      status: 'completed'
    };

    return { envelope, trace, ok: true };
  } catch (err) {
    return {
      envelope: null,
      trace: { ...traceBase, total_ms: Date.now() - started, status: 'failed' },
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export async function runVerifierWorker(input: {
  readonly apiKey: string;
  readonly missionId: string;
  readonly workerId: string;
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly timeoutMs: number;
}): Promise<{ ok: boolean; trace: GlmNarutoWorkerTrace; issues: readonly string[] }> {
  const started = Date.now();
  const sessionId = `sks-glm-naruto-verify-${input.missionId}-${input.workerId}`;
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: `You are a SKS GLM Naruto verifier. Model: ${GLM_52_OPENROUTER_MODEL}. No GPT fallback. Check if the patch is correct and safe. Output JSON: {"ok":true/false,"issues":["..."]}` },
    { role: 'user', content: JSON.stringify({ patch_sha256: input.envelope.patch_sha256, target_paths: input.envelope.target_paths, patch: input.envelope.patch.slice(0, 4000) }) }
  ];

  const request = buildGlm52Request({
    profile: 'speed',
    messages,
    maxTokens: 2048,
    toolChoice: 'none',
    parallelToolCalls: false
  });

  try {
    const response = await sendOpenRouterChatCompletionStream({
      apiKey: input.apiKey,
      request: { ...request, session_id: sessionId },
      timeoutMs: input.timeoutMs
    });

    if (!response.ok) {
      return {
        ok: false,
        trace: {
          worker_id: input.workerId,
          shard_id: input.envelope.shard_id,
          strategy: 'minimal_patch',
          model: GLM_52_OPENROUTER_MODEL,
          provider: 'openrouter',
          session_id: sessionId,
          ttft_ms: null,
          total_ms: Date.now() - started,
          request_cache_hit: false,
          output_digest: '',
          patch_digest: input.envelope.patch_sha256,
          status: 'failed'
        },
        issues: [response.error.code]
      };
    }

    return {
      ok: true,
      trace: {
        worker_id: input.workerId,
        shard_id: input.envelope.shard_id,
        strategy: 'minimal_patch',
        model: GLM_52_OPENROUTER_MODEL,
        provider: 'openrouter',
        session_id: sessionId,
        ttft_ms: response.value.ttft_ms,
        total_ms: Date.now() - started,
        request_cache_hit: false,
        output_digest: crypto.createHash('sha256').update(response.value.content).digest('hex'),
        patch_digest: input.envelope.patch_sha256,
        status: 'completed'
      },
      issues: []
    };
  } catch (err) {
    return {
      ok: false,
      trace: {
        worker_id: input.workerId,
        shard_id: input.envelope.shard_id,
        strategy: 'minimal_patch',
        model: GLM_52_OPENROUTER_MODEL,
        provider: 'openrouter',
        session_id: sessionId,
        ttft_ms: null,
        total_ms: Date.now() - started,
        request_cache_hit: false,
        output_digest: '',
        patch_digest: input.envelope.patch_sha256,
        status: 'failed'
      },
      issues: [err instanceof Error ? err.message : String(err)]
    };
  }
}
