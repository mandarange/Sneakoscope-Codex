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
import { parseGlmNarutoVerifierOutput } from './glm-naruto-verifier-output.js';
import { writeGlmNarutoWorkerArtifacts } from './glm-naruto-worker-artifacts.js';
import { extractGlmNarutoUsageMetrics } from './glm-naruto-usage-extractor.js';
import { normalizeGlmNarutoSessionId } from './glm-naruto-session-id.js';

export interface WorkerRunInput {
  readonly apiKey: string;
  readonly missionId: string;
  readonly workerId: string;
  readonly root?: string;
  readonly shard: GlmNarutoShard;
  readonly contextSummary: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
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
  const artifactRoot = input.root ?? process.cwd();
  const sessionId = normalizeGlmNarutoSessionId(`sks-glm-naruto-${input.missionId}-${input.workerId}`);
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
  const stablePrefixDigest = crypto.createHash('sha256').update(STABLE_SYSTEM_PREFIX).digest('hex');
  const shardSuffixDigest = crypto.createHash('sha256').update(shardSuffix).digest('hex');
  const cacheKeyParts = {
    model: requestWithSession.model,
    profile: 'glm-naruto-worker-speed',
    stable_prefix_digest: stablePrefixDigest,
    shard_suffix_digest: shardSuffixDigest,
    tools_digest: requestWithSession.tools ? crypto.createHash('sha256').update(JSON.stringify(requestWithSession.tools)).digest('hex') : null,
    response_format_digest: requestWithSession.response_format ? crypto.createHash('sha256').update(JSON.stringify(requestWithSession.response_format)).digest('hex') : null,
    provider_digest: crypto.createHash('sha256').update(JSON.stringify(requestWithSession.provider ?? null)).digest('hex'),
    session_id: sessionId
  };
  const encoded = encodeGlmRequestWithCache({ request: requestWithSession, cacheKeyParts });
  await writeGlmNarutoWorkerArtifacts({
    root: artifactRoot,
    missionId: input.missionId,
    workerId: input.workerId,
    shardId: input.shard.id,
    requestSummary: {
      model: requestWithSession.model,
      provider: 'openrouter',
      session_id: sessionId,
      request_body_sha256: encoded.entry.bodySha256,
      request_body_size: encoded.entry.byteLength,
      request_body_stored: encoded.entry.bodyStored,
      cache_hit: encoded.cacheHit,
      stable_prefix_digest: stablePrefixDigest,
      shard_suffix_digest: shardSuffixDigest
    }
  }).catch(() => undefined);

  const traceBase: GlmNarutoWorkerTrace = {
    worker_id: input.workerId,
    shard_id: input.shard.id,
    strategy: input.shard.strategy,
    model: GLM_52_OPENROUTER_MODEL,
    provider: 'openrouter',
    provider_slug: 'openrouter',
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
      timeoutMs: input.timeoutMs,
      idleTimeoutMs: 60_000,
      cacheKeyParts,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });

    if (!response.ok) {
      const trace = { ...traceBase, total_ms: Date.now() - started, status: 'failed', chunk_count: 0, real_stream: false };
      await writeGlmNarutoWorkerArtifacts({
        root: artifactRoot,
        missionId: input.missionId,
        workerId: input.workerId,
        shardId: input.shard.id,
        streamTrace: trace,
        termination: { status: 'failed', ok: false, error: response.error.code }
      }).catch(() => undefined);
      return {
        envelope: null,
        trace,
        ok: false,
        error: response.error.code
      };
    }

    const modelGuard = assertGlm52ActualModel(response.value.model);
    if (!modelGuard.ok) {
      const usage = extractGlmNarutoUsageMetrics(response.value.usage);
      const trace = { ...traceBase, ...usage, ttft_ms: response.value.ttft_ms, total_ms: Date.now() - started, status: 'blocked', chunk_count: response.value.chunk_count, real_stream: response.value.real_stream, request_cache_hit: response.value.request_cache_hit ?? traceBase.request_cache_hit };
      await writeGlmNarutoWorkerArtifacts({
        root: artifactRoot,
        missionId: input.missionId,
        workerId: input.workerId,
        shardId: input.shard.id,
        streamTrace: trace,
        termination: { status: 'blocked', ok: false, error: `model_guard:${modelGuard.code}` }
      }).catch(() => undefined);
      return {
        envelope: null,
        trace,
        ok: false,
        error: `model_guard:${modelGuard.code}`
      };
    }

    const parsed = parsePatchCandidateOutput(response.value.content);

    if (parsed.kind !== 'patch') {
      const trace = {
        ...traceBase,
        ...extractGlmNarutoUsageMetrics(response.value.usage),
        ttft_ms: response.value.ttft_ms,
        total_ms: Date.now() - started,
        chunk_count: response.value.chunk_count,
        real_stream: response.value.real_stream,
        request_cache_hit: response.value.request_cache_hit ?? traceBase.request_cache_hit,
        status: parsed.kind === 'blocked' ? 'blocked' : 'no_patch'
      };
      await writeGlmNarutoWorkerArtifacts({
        root: artifactRoot,
        missionId: input.missionId,
        workerId: input.workerId,
        shardId: input.shard.id,
        streamTrace: trace,
        termination: { status: trace.status, ok: false, error: parsed.kind }
      }).catch(() => undefined);
      return {
        envelope: null,
        trace,
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
      ...extractGlmNarutoUsageMetrics(response.value.usage),
      ttft_ms: response.value.ttft_ms,
      total_ms: Date.now() - started,
      chunk_count: response.value.chunk_count,
      real_stream: response.value.real_stream,
      request_cache_hit: response.value.request_cache_hit ?? traceBase.request_cache_hit,
      patch_digest: digestPatch(envelope.patch),
      status: 'completed'
    };

    await writeGlmNarutoWorkerArtifacts({
      root: artifactRoot,
      missionId: input.missionId,
      workerId: input.workerId,
      shardId: input.shard.id,
      streamTrace: trace,
      patchEnvelope: envelope,
      gateResult: {
        schema: 'sks.glm-naruto-worker-gate-result.v1',
        worker_id: input.workerId,
        shard_id: input.shard.id,
        status: 'pending_orchestrator_gate',
        ok: false,
        reason: 'deterministic_gate_runs_in_orchestrator_with_repo_cwd'
      },
      termination: { status: 'completed', ok: true }
    }).catch(() => undefined);

    return { envelope, trace, ok: true };
  } catch (err) {
    const trace = { ...traceBase, total_ms: Date.now() - started, status: 'failed', chunk_count: 0, real_stream: false };
    await writeGlmNarutoWorkerArtifacts({
      root: artifactRoot,
      missionId: input.missionId,
      workerId: input.workerId,
      shardId: input.shard.id,
      streamTrace: trace,
      termination: { status: 'failed', ok: false, error: err instanceof Error ? err.message : String(err) }
    }).catch(() => undefined);
    return {
      envelope: null,
      trace,
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
  readonly fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; trace: GlmNarutoWorkerTrace; issues: readonly string[] }> {
  const started = Date.now();
  const sessionId = normalizeGlmNarutoSessionId(`sks-glm-naruto-verify-${input.missionId}-${input.workerId}`);
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: `You are a SKS GLM Naruto verifier. Model: ${GLM_52_OPENROUTER_MODEL}. No GPT fallback. Return only JSON with schema "sks.glm-naruto-verifier-output.v1", ok boolean, issues string array, risk_score number 0..1, confidence number 0..1. Do not include markdown.` },
    { role: 'user', content: JSON.stringify({ patch_sha256: input.envelope.patch_sha256, target_paths: input.envelope.target_paths, patch: input.envelope.patch.slice(0, 4000) }) }
  ];

  const request = buildGlm52Request({
    profile: 'speed',
    messages,
    maxTokens: 2048,
    toolChoice: 'none',
    parallelToolCalls: false,
    providerSort: 'throughput'
  });
  const requestWithSession = { ...request, session_id: sessionId };
  const cacheKeyParts = {
    model: requestWithSession.model,
    profile: 'glm-naruto-verifier-speed',
    stable_prefix_digest: crypto.createHash('sha256').update(messages[0]!.content).digest('hex'),
    shard_suffix_digest: crypto.createHash('sha256').update(messages[1]!.content).digest('hex'),
    tools_digest: null,
    response_format_digest: requestWithSession.response_format ? crypto.createHash('sha256').update(JSON.stringify(requestWithSession.response_format)).digest('hex') : null,
    provider_digest: crypto.createHash('sha256').update(JSON.stringify(requestWithSession.provider ?? null)).digest('hex'),
    session_id: sessionId
  };

  try {
    const response = await sendOpenRouterChatCompletionStream({
      apiKey: input.apiKey,
      request: requestWithSession,
      timeoutMs: input.timeoutMs,
      idleTimeoutMs: 60_000,
      cacheKeyParts,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
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
          provider_slug: 'openrouter',
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

    const modelGuard = assertGlm52ActualModel(response.value.model);
    const usageMetrics = extractGlmNarutoUsageMetrics(response.value.usage);
    if (!modelGuard.ok) {
      return {
        ok: false,
        trace: {
          worker_id: input.workerId,
          shard_id: input.envelope.shard_id,
          strategy: 'minimal_patch',
          model: GLM_52_OPENROUTER_MODEL,
          provider: 'openrouter',
          provider_slug: 'openrouter',
          session_id: sessionId,
          ...usageMetrics,
          ttft_ms: response.value.ttft_ms,
          total_ms: Date.now() - started,
          chunk_count: response.value.chunk_count,
          real_stream: response.value.real_stream,
          request_cache_hit: response.value.request_cache_hit ?? false,
          output_digest: crypto.createHash('sha256').update(response.value.content).digest('hex'),
          patch_digest: input.envelope.patch_sha256,
          status: 'verification_failed'
        },
        issues: [`model_guard:${modelGuard.code}`]
      };
    }

    const parsed = parseGlmNarutoVerifierOutput(response.value.content);
    if (!parsed.ok || !parsed.output) {
      return {
        ok: false,
        trace: {
          worker_id: input.workerId,
          shard_id: input.envelope.shard_id,
          strategy: 'minimal_patch',
          model: GLM_52_OPENROUTER_MODEL,
          provider: 'openrouter',
          provider_slug: 'openrouter',
          session_id: sessionId,
          ...usageMetrics,
          ttft_ms: response.value.ttft_ms,
          total_ms: Date.now() - started,
          chunk_count: response.value.chunk_count,
          real_stream: response.value.real_stream,
          request_cache_hit: response.value.request_cache_hit ?? false,
          output_digest: crypto.createHash('sha256').update(response.value.content).digest('hex'),
          patch_digest: input.envelope.patch_sha256,
          status: 'verification_failed'
        },
        issues: parsed.issues
      };
    }

    if (!parsed.output.ok) {
      return {
        ok: false,
        trace: {
          worker_id: input.workerId,
          shard_id: input.envelope.shard_id,
          strategy: 'minimal_patch',
          model: GLM_52_OPENROUTER_MODEL,
          provider: 'openrouter',
          provider_slug: 'openrouter',
          session_id: sessionId,
          ...usageMetrics,
          ttft_ms: response.value.ttft_ms,
          total_ms: Date.now() - started,
          chunk_count: response.value.chunk_count,
          real_stream: response.value.real_stream,
          request_cache_hit: response.value.request_cache_hit ?? false,
          output_digest: crypto.createHash('sha256').update(response.value.content).digest('hex'),
          patch_digest: input.envelope.patch_sha256,
          status: 'verification_failed',
          verifier_risk_score: parsed.output.risk_score,
          verifier_confidence: parsed.output.confidence
        },
        issues: parsed.output.issues
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
        provider_slug: 'openrouter',
        session_id: sessionId,
        ...usageMetrics,
        ttft_ms: response.value.ttft_ms,
        total_ms: Date.now() - started,
        chunk_count: response.value.chunk_count,
        real_stream: response.value.real_stream,
        request_cache_hit: response.value.request_cache_hit ?? false,
        output_digest: crypto.createHash('sha256').update(response.value.content).digest('hex'),
        patch_digest: input.envelope.patch_sha256,
        status: 'verification_passed',
        verifier_risk_score: parsed.output.risk_score,
        verifier_confidence: parsed.output.confidence
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
        provider_slug: 'openrouter',
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
