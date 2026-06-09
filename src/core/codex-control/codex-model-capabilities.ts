export interface CodexModelEffortCapability {
  model: string
  advertised_efforts: string[]
  default_effort: string
  order_source: 'model-advertised' | 'sks-fallback'
}

export const SKS_FALLBACK_EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh']

export function codexModelEffortCapability(input: { model?: string | null; advertisedEfforts?: string[] | null; defaultEffort?: string | null } = {}): CodexModelEffortCapability {
  const advertised = normalizeAdvertisedEfforts(input.advertisedEfforts)
  const order = advertised.length ? advertised : SKS_FALLBACK_EFFORT_ORDER
  const defaultEffort = order.includes(String(input.defaultEffort || '')) ? String(input.defaultEffort) : order.includes('medium') ? 'medium' : order[0] || 'medium'
  return {
    model: String(input.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || 'gpt-5.5'),
    advertised_efforts: order,
    default_effort: defaultEffort,
    order_source: advertised.length ? 'model-advertised' : 'sks-fallback'
  }
}

export function normalizeAdvertisedEfforts(value: any): string[] {
  const rows = Array.isArray(value) ? value : String(value || '').split(',')
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const effort = String(row || '').trim().toLowerCase()
    if (!effort || seen.has(effort)) continue
    seen.add(effort)
    out.push(effort)
  }
  return out
}

export function nextAdvertisedEffort(current: string, capability: CodexModelEffortCapability = codexModelEffortCapability()) {
  const order = capability.advertised_efforts.length ? capability.advertised_efforts : SKS_FALLBACK_EFFORT_ORDER
  const index = Math.max(0, order.indexOf(current))
  return order[Math.min(order.length - 1, index + 1)] || current || capability.default_effort
}

export function modelEffortAtLeast(target: string, capability: CodexModelEffortCapability = codexModelEffortCapability()) {
  const order = capability.advertised_efforts.length ? capability.advertised_efforts : SKS_FALLBACK_EFFORT_ORDER
  if (order.includes(target)) return target
  if (target === 'recovery') return order.includes('high') ? 'high' : order[order.length - 1]
  if (target === 'forensic_vision') return order.includes('xhigh') ? 'xhigh' : order[order.length - 1]
  return capability.default_effort
}
