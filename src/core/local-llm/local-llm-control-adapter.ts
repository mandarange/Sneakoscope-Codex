import { nowIso, sha256 } from '../fsx.js'
import type { CodexTaskInput } from '../codex-control/codex-control-plane.js'
import type { LocalModelConfig } from '../agents/ollama-worker-config.js'
import { evaluateLocalWorkerEligibility } from './local-worker-eligibility.js'
import { callLocalLlmGenerate, localLlmTokensPerSecond } from './local-llm-client.js'
import { enforceLocalLlmJsonSchema } from './local-llm-schema-enforcer.js'

export async function runLocalLlmTask(input: CodexTaskInput, opts: {
  config: LocalModelConfig
  outputSchema: Record<string, unknown>
}) {
  const started = Date.now()
  const requestId = `local-llm:${sha256(`${nowIso()}:${input.missionId}:${input.workItemId || ''}:${input.slotId || ''}`).slice(0, 16)}`
  const eligibility = evaluateLocalWorkerEligibility(input, opts.config)
  if (!eligibility.ok) {
    return {
      ok: false,
      backend: 'local-llm' as const,
      backendFamily: 'local-llm' as const,
      requestId,
      events: [],
      finalResponse: '',
      structuredOutput: null,
      structuredOutputValid: false,
      proof: buildProof(input, opts.config, requestId, started, eligibility, null, ['local_llm_eligibility_blocked', ...eligibility.blockers]),
      blockers: ['local_llm_eligibility_blocked', ...eligibility.blockers]
    }
  }
  const prompt = buildLocalLlmTaskPrompt(input, opts.outputSchema)
  const response = await callLocalLlmGenerate(opts.config, {
    model: opts.config.model,
    prompt,
    stream: false,
    format: 'json',
    think: opts.config.think,
    keep_alive: opts.config.keep_alive,
    options: { temperature: opts.config.temperature }
  })
  const latencyMs = Math.max(0, Date.now() - started)
  const enforced = response.ok ? enforceLocalLlmJsonSchema(response.text, opts.outputSchema) : { ok: false, value: null, schema_valid: false, issues: [response.error] }
  const blockers = [
    ...(response.ok ? [] : ['local_llm_generate_failed', response.error]),
    ...(enforced.ok ? [] : ['local_llm_structured_output_invalid', ...(enforced.issues || []).map((issue: unknown) => `schema:${String(issue)}`)])
  ]
  const event = {
    schema: 'sks.local-llm-event.v1',
    generated_at: nowIso(),
    type: response.ok ? 'local_llm_generate_completed' : 'local_llm_generate_failed',
    request_id: requestId,
    latency_ms: latencyMs,
    schema_valid: enforced.schema_valid === true
  }
  return {
    ok: blockers.length === 0,
    backend: 'local-llm' as const,
    backendFamily: 'local-llm' as const,
    requestId,
    events: [event],
    finalResponse: JSON.stringify(enforced.value || {}),
    structuredOutput: enforced.value,
    structuredOutputValid: enforced.schema_valid === true,
    proof: buildProof(input, opts.config, requestId, started, eligibility, response.ok ? response.data : null, blockers, latencyMs, response.ok ? localLlmTokensPerSecond(response.data, response.text, latencyMs) : 0),
    blockers
  }
}

function buildLocalLlmTaskPrompt(input: CodexTaskInput, outputSchema: Record<string, unknown>) {
  return [
    'You are an SKS local LLM worker backend. You are worker-only.',
    'You must not make strategy, planning, safety, verification, integration, or final acceptance decisions.',
    'Return JSON only. Natural language outside JSON is invalid.',
    'Your output is a draft and requires GPT Final Arbiter before final acceptance or patch application.',
    JSON.stringify({
      route: input.route,
      mission_id: input.missionId,
      work_item_id: input.workItemId || null,
      slot_id: input.slotId || null,
      sandbox_policy: input.sandboxPolicy,
      prompt: input.prompt,
      output_schema: outputSchema
    }, null, 2)
  ].join('\n')
}

function buildProof(input: CodexTaskInput, config: LocalModelConfig, requestId: string, started: number, eligibility: unknown, rawResponse: unknown, blockers: string[], latencyMs = Math.max(0, Date.now() - started), tokensPerSecond = 0) {
  return {
    schema: 'sks.local-llm-proof.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    request_id: requestId,
    provider: config.provider,
    model: config.model,
    endpoint: config.base_url,
    backend: 'local-llm',
    backend_family: 'local-llm',
    route: input.route,
    mission_id: input.missionId,
    work_item_id: input.workItemId || null,
    slot_id: input.slotId || null,
    safety_scope: 'worker_only_requires_gpt_final',
    latency_ms: latencyMs,
    tokens_per_second: tokensPerSecond,
    schema_valid: blockers.length === 0,
    eligibility,
    raw_response: rawResponse,
    blockers
  }
}
