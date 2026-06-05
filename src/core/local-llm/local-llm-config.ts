import { resolveOllamaWorkerConfig } from '../agents/ollama-worker-config.js'

export async function resolveLocalLlmConfig(input: Parameters<typeof resolveOllamaWorkerConfig>[0] = {}) {
  const config = await resolveOllamaWorkerConfig(input)
  return {
    schema: 'sks.local-llm-config.v2',
    ok: config.ok,
    enabled: config.enabled,
    status: config.status,
    provider: config.provider,
    model: config.model,
    endpoint: config.endpoint,
    base_url: config.base_url,
    worker_only: true,
    requires_gpt_final: config.policy.requires_gpt_final,
    capability: config.capability,
    last_smoke: config.last_smoke,
    blockers: config.blockers
  }
}
