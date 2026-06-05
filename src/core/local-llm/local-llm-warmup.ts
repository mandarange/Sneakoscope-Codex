import { nowIso } from '../fsx.js'
import type { LocalModelConfig } from '../agents/ollama-worker-config.js'

export function buildLocalLlmWarmupState(config: LocalModelConfig, input: { ok: boolean; ttlMs?: number; reason?: string }) {
  const ttlMs = Math.max(1, Number(input.ttlMs || 10 * 60 * 1000))
  const warmedAt = nowIso()
  return {
    schema: 'sks.local-llm-warmup-state.v1',
    ok: input.ok,
    provider: config.provider,
    model: config.model,
    endpoint: config.base_url,
    warmed_at: warmedAt,
    expires_at: new Date(Date.parse(warmedAt) + ttlMs).toISOString(),
    explicit_only: true,
    postinstall_allowed: false,
    release_check_real_warmup_allowed: false,
    release_real_check_requires_env: 'SKS_REQUIRE_LOCAL_LLM=1',
    reason: input.reason || null
  }
}
