import { resolveOllamaWorkerConfig } from '../agents/ollama-worker-config.js'

export async function resolveLocalLlmConfig(input: Parameters<typeof resolveOllamaWorkerConfig>[0] = {}) {
  const config = await resolveOllamaWorkerConfig(input)
  return {
    schema: 'sks.local-llm-config.v1',
    ok: config.ok,
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    base_url: config.base_url,
    worker_only: true,
    blockers: config.blockers
  }
}
