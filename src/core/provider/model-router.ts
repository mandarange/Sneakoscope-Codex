export type TaskCategory = 'quick' | 'standard' | 'agentic' | 'ultrabrain' | 'verify' | 'review';
export type ModelReasoning = 'low' | 'medium' | 'high' | 'xhigh';
export type ModelServiceTier = 'fast' | 'standard';

export interface ModelChoice {
  model: string;
  reasoning: ModelReasoning;
  serviceTier: ModelServiceTier;
}

export interface LbHealth {
  ok: boolean;
  degraded_models?: string[];
  quota_low?: boolean;
}

const CHAINS: Record<TaskCategory, ModelChoice[]> = {
  quick: [
    { model: 'gpt-5.4-mini', reasoning: 'low', serviceTier: 'fast' },
    { model: 'gpt-5.5', reasoning: 'low', serviceTier: 'fast' }
  ],
  standard: [
    { model: 'gpt-5.5', reasoning: 'medium', serviceTier: 'fast' }
  ],
  agentic: [
    { model: 'gpt-5.3-codex', reasoning: 'high', serviceTier: 'fast' },
    { model: 'gpt-5.5', reasoning: 'high', serviceTier: 'fast' }
  ],
  ultrabrain: [
    { model: 'gpt-5.5', reasoning: 'xhigh', serviceTier: 'standard' }
  ],
  verify: [
    { model: 'gpt-5.4-mini', reasoning: 'medium', serviceTier: 'fast' }
  ],
  review: [
    { model: 'gpt-5.5', reasoning: 'high', serviceTier: 'fast' }
  ]
};

export async function routeModel(category: TaskCategory, opts: { lbHealth?: LbHealth | null } = {}): Promise<ModelChoice> {
  const chain = CHAINS[category] || CHAINS.standard;
  const degraded = new Set((opts.lbHealth?.degraded_models || []).map((model) => String(model)));
  for (const choice of chain) {
    if (degraded.has(choice.model)) continue;
    if (opts.lbHealth?.quota_low && choice.reasoning === 'xhigh') return { ...choice, reasoning: 'high' };
    return choice;
  }
  return chain[chain.length - 1] ?? CHAINS.standard[0]!;
}

export function categoryForWorkerRole(role: string): TaskCategory {
  const text = String(role || '').toLowerCase();
  if (/verif|test|qa/.test(text)) return 'verify';
  if (/review|critic|judge/.test(text)) return 'review';
  if (/research|explore|read|scout/.test(text)) return 'quick';
  if (/plan|architect|strategy/.test(text)) return 'ultrabrain';
  return 'agentic';
}

export function modelRouteReason(category: TaskCategory, choice: ModelChoice, opts: { explicit?: boolean; quotaLow?: boolean; degraded?: string[] } = {}): string {
  if (opts.explicit) return `${category}->${choice.model} (explicit env override)`;
  const suffix = opts.quotaLow ? 'quota discipline' : opts.degraded?.length ? 'lb degraded fallback' : 'quota discipline';
  return `${category}->${choice.model} (${suffix})`;
}
