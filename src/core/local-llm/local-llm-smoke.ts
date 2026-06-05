import os from 'node:os'
import path from 'node:path'
import { ensureDir, nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import type { LocalModelConfig, LocalModelSmokeResult } from '../agents/ollama-worker-config.js'
import { detectLocalLlmCapability } from './local-llm-capability.js'
import { callLocalLlmGenerate, localLlmTokensPerSecond } from './local-llm-client.js'
import { enforceLocalLlmJsonSchema } from './local-llm-schema-enforcer.js'

export const LOCAL_LLM_SMOKE_SCHEMA = 'sks.local-llm-smoke.v1'

export const localLlmSmokeSchema = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { type: 'string' },
    summary: { type: 'string' }
  },
  additionalProperties: false
}

export async function runLocalLlmGenerationSmoke(config: LocalModelConfig, opts: {
  prompt?: string
  schema?: Record<string, unknown>
  timeoutMs?: number
  reportPath?: string
} = {}): Promise<LocalModelSmokeResult> {
  const started = Date.now()
  const prompt = opts.prompt || 'Return strict JSON: {"status":"ok","summary":"local smoke passed"}'
  const schema = opts.schema || localLlmSmokeSchema
  const capability = await detectLocalLlmCapability(config)
  const reportPath = expandHome(opts.reportPath || path.join(os.homedir(), '.sneakoscope', 'reports', 'local-llm-smoke.json'))
  if (!capability.ok) {
    const smoke = {
      ok: false,
      ran_at: nowIso(),
      prompt_hash: sha256(prompt),
      latency_ms: Math.max(0, Date.now() - started),
      tokens_per_second: 0,
      schema_valid: false,
      result_path: reportPath,
      status: 'blocked' as const,
      blockers: capability.blockers
    }
    await writeSmokeReport(reportPath, config, smoke, capability)
    return smoke
  }
  const request = {
    model: config.model,
    prompt,
    stream: false,
    format: 'json',
    think: config.think,
    keep_alive: config.keep_alive,
    options: { temperature: 0 }
  }
  const response = await callLocalLlmGenerate({ ...config, timeout_ms: opts.timeoutMs || 20_000 }, request)
  const latencyMs = Math.max(0, Date.now() - started)
  const enforced = response.ok ? enforceLocalLlmJsonSchema(response.text, schema) : { ok: false, schema_valid: false, issues: [response.error] }
  const smoke = {
    ok: response.ok && enforced.ok,
    ran_at: nowIso(),
    prompt_hash: sha256(prompt),
    latency_ms: latencyMs,
    tokens_per_second: response.ok ? localLlmTokensPerSecond(response.data, response.text, latencyMs) : 0,
    schema_valid: enforced.schema_valid === true,
    result_path: reportPath,
    status: response.ok && enforced.ok ? 'verified' as const : 'blocked' as const,
    blockers: [
      ...(response.ok ? [] : ['local_llm_generate_failed', response.error]),
      ...(enforced.ok ? [] : ['local_llm_smoke_schema_invalid', ...(enforced.issues || []).map(String)])
    ]
  }
  await writeSmokeReport(reportPath, config, smoke, capability, response.ok ? response.data : null)
  return smoke
}

async function writeSmokeReport(reportPath: string, config: LocalModelConfig, smoke: LocalModelSmokeResult, capability: unknown, rawResponse: unknown = null) {
  await ensureDir(path.dirname(reportPath))
  await writeJsonAtomic(reportPath, {
    schema: LOCAL_LLM_SMOKE_SCHEMA,
    generated_at: nowIso(),
    provider: config.provider,
    model: config.model,
    endpoint: config.base_url,
    smoke,
    capability,
    raw_response: rawResponse
  })
}

function expandHome(value: string) {
  return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value
}
