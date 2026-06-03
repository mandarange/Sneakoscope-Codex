import type { CodexTaskInput } from './codex-control-plane.js'

export function buildCodexSdkConfig(input: CodexTaskInput) {
  return {
    service_tier: 'fast',
    model_reasoning_effort: 'medium',
    sks: {
      route: input.route,
      mission_id: input.missionId,
      slot_id: input.slotId || '',
      generation_index: Number(input.generationIndex || 0)
    }
  }
}

export function redactCodexSdkConfig(config: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(config, (_key, value) => {
    if (typeof value === 'string' && /(?:key|token|secret|password|credential|auth|cookie)/i.test(value)) return '<redacted>'
    return value
  }))
}
