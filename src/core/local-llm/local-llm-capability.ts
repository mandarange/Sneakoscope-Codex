import type { LocalModelCapability, LocalModelConfig, LocalModelProvider } from '../agents/ollama-worker-config.js'
import { listLocalLlmModels, probeLocalLlmEndpoint } from './local-llm-client.js'

export async function detectLocalLlmCapability(config: LocalModelConfig): Promise<{
  ok: boolean
  provider: LocalModelProvider
  model: string
  endpoint: string
  capability: LocalModelCapability
  blockers: string[]
}> {
  const version = await probeLocalLlmEndpoint(config)
  const tags = version.ok ? await listLocalLlmModels(config) : { ok: false, models: [] as string[] }
  const modelInstalled = tags.models.includes(config.model)
  const capability: LocalModelCapability = {
    api_reachable: version.ok,
    model_installed: modelInstalled,
    supports_streaming: true,
    supports_json_schema: config.provider === 'ollama',
    supports_tools: false,
    supports_images: false,
    context_window: config.capability.context_window || 32768,
    max_parallel_requests: config.capability.max_parallel_requests || 4
  }
  const blockers = [
    ...(version.ok ? [] : ['local_model_endpoint_unreachable']),
    ...(modelInstalled ? [] : ['local_model_missing'])
  ]
  return {
    ok: blockers.length === 0,
    provider: config.provider,
    model: config.model,
    endpoint: config.base_url,
    capability,
    blockers
  }
}
