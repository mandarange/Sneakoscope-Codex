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

const CATEGORY_POLICY: Record<TaskCategory, Omit<ModelChoice, 'model'>> = {
  quick: { reasoning: 'low', serviceTier: 'fast' },
  standard: { reasoning: 'medium', serviceTier: 'fast' },
  agentic: { reasoning: 'high', serviceTier: 'fast' },
  ultrabrain: { reasoning: 'xhigh', serviceTier: 'standard' },
  verify: { reasoning: 'medium', serviceTier: 'fast' },
  review: { reasoning: 'high', serviceTier: 'fast' }
};

export async function routeModel(category: TaskCategory, opts: { lbHealth?: LbHealth | null; model?: string | null } = {}): Promise<ModelChoice> {
  const policy = CATEGORY_POLICY[category] || CATEGORY_POLICY.standard;
  const model = String(opts.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || '').trim();
  const reasoning = opts.lbHealth?.quota_low && policy.reasoning === 'xhigh' ? 'high' : policy.reasoning;
  return { model, reasoning, serviceTier: policy.serviceTier };
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
  const model = choice.model || 'codex-selected';
  if (opts.explicit) return `${category}->${model} (explicit model preserved)`;
  const suffix = opts.quotaLow ? 'quota discipline' : 'Codex catalog passthrough';
  return `${category}->${model} (${suffix})`;
}
