import { decideSubagentModel, SUBAGENT_EFFORT } from '../subagents/model-policy.js';

export type TaskCategory = 'quick' | 'standard' | 'agentic' | 'ultrabrain' | 'verify' | 'review' | 'e2e' | 'refactor' | 'strategy';
export type ModelReasoning = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
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
  review: { reasoning: 'high', serviceTier: 'fast' },
  e2e: { reasoning: 'xhigh', serviceTier: 'fast' },
  refactor: { reasoning: 'max', serviceTier: 'fast' },
  strategy: { reasoning: 'max', serviceTier: 'fast' }
};

export const NARUTO_MODELS = ['gpt-5.6-luna', 'gpt-5.6-sol'] as const;
const NARUTO_EXPLICIT_COMPATIBILITY_MODELS = [...NARUTO_MODELS, 'gpt-5.6-terra'] as const;
export type NarutoGpt56Model = typeof NARUTO_EXPLICIT_COMPATIBILITY_MODELS[number];

const E2E_WORK_RE = /(e2e|end[-\s]?to[-\s]?end|test_execution|browser|chrome|computer[-\s]?use|computer\s+use|cross[-\s]?app|playwright|selenium|puppeteer|브라우저|컴퓨터\s*유즈)/i;

export async function routeModel(category: TaskCategory, opts: {
  lbHealth?: LbHealth | null;
  model?: string | null;
  narutoOnly?: boolean;
  taskText?: string;
  riskText?: string;
  availableModels?: string[] | null;
  availableModelEfforts?: Record<string, string[]> | null;
} = {}): Promise<ModelChoice> {
  if (opts.narutoOnly) {
    return routeNarutoGpt56Model({
      category,
      ...(opts.taskText !== undefined ? { taskText: opts.taskText } : {}),
      ...(opts.riskText !== undefined ? { riskText: opts.riskText } : {}),
      ...(opts.model !== undefined ? { explicitModel: opts.model } : {}),
      ...(opts.availableModels !== undefined ? { availableModels: opts.availableModels } : {}),
      ...(opts.availableModelEfforts !== undefined ? { availableModelEfforts: opts.availableModelEfforts } : {}),
      degradedModels: opts.lbHealth?.degraded_models || []
    });
  }
  const policy = CATEGORY_POLICY[category] || CATEGORY_POLICY.standard;
  const model = String(opts.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || '').trim();
  const reasoning = opts.lbHealth?.quota_low && policy.reasoning === 'xhigh' ? 'high' : policy.reasoning;
  return { model, reasoning, serviceTier: policy.serviceTier };
}

export function routeNarutoGpt56Model(input: {
  category?: TaskCategory;
  taskText?: string;
  riskText?: string;
  explicitModel?: string | null;
  availableModels?: string[] | null;
  availableModelEfforts?: Record<string, string[]> | null;
  degradedModels?: string[];
} = {}): ModelChoice {
  const category = input.category || 'agentic';
  const explicitRequested = String(input.explicitModel || '').trim();
  const explicit = normalizeNarutoGpt56Model(input.explicitModel);
  const invalidExplicit = Boolean(explicitRequested && !explicit);
  const automatic = decideSubagentModel({
    title: input.taskText,
    description: input.riskText,
    role: category,
    requiresJudgment: category === 'review'
      || category === 'refactor'
      || category === 'strategy'
      || category === 'ultrabrain'
  });
  const preferred: NarutoGpt56Model = explicit || automatic.model;
  const available = input.availableModels == null
    ? [...NARUTO_EXPLICIT_COMPATIBILITY_MODELS]
    : input.availableModels.map(normalizeNarutoGpt56Model).filter((model): model is NarutoGpt56Model => Boolean(model));
  const degraded = new Set((input.degradedModels || []).map((model) => String(model).toLowerCase()));
  const usable = available.filter((model) => !degraded.has(model));
  const availableEfforts = effortsForModel(input.availableModelEfforts, preferred);
  const intendedReasoning: ModelReasoning = SUBAGENT_EFFORT;
  const model = !invalidExplicit && usable.includes(preferred) && (availableEfforts == null || availableEfforts.includes(intendedReasoning)) ? preferred : '';
  return { model, reasoning: intendedReasoning, serviceTier: 'fast' };
}

export function isNarutoGpt56Model(value: unknown): value is NarutoGpt56Model {
  return normalizeNarutoGpt56Model(value) !== null;
}

export function normalizeNarutoGpt56Model(value: unknown): NarutoGpt56Model | null {
  const model = String(value || '').trim().toLowerCase();
  return (NARUTO_EXPLICIT_COMPATIBILITY_MODELS as readonly string[]).includes(model) ? model as NarutoGpt56Model : null;
}

export function categoryForWorkerRole(role: string, taskText = ''): TaskCategory {
  const text = `${String(role || '')} ${String(taskText || '')}`.toLowerCase();
  if (/(refactor|re-?architect|리팩터|아키텍처)/i.test(text)) return 'refactor';
  if (/(planning|\bplan\b|strategy|strategic|기획|전략)/i.test(text)) return 'strategy';
  if (decideSubagentModel({ description: text }).kind === 'expert') return 'review';
  if (E2E_WORK_RE.test(text)) return 'e2e';
  if (/verif|test|qa/.test(text)) return 'verify';
  if (/research|explore|read|scout/.test(text)) return 'quick';
  return 'agentic';
}

export function modelRouteReason(category: TaskCategory, choice: ModelChoice, opts: { explicit?: boolean; quotaLow?: boolean; degraded?: string[] } = {}): string {
  const model = choice.model || 'codex-selected';
  if (opts.explicit && !choice.model) return `${category}->blocked (explicit model unavailable)`;
  if (opts.explicit) return `${category}->${model} (explicit model preserved)`;
  if (isNarutoGpt56Model(choice.model)) return `${category}->${model}@${choice.reasoning} (official subagent model policy)`;
  const suffix = opts.quotaLow ? 'quota discipline' : 'Codex catalog passthrough';
  return `${category}->${model} (${suffix})`;
}

function effortsForModel(catalog: Record<string, string[]> | null | undefined, model: string): string[] | null {
  if (catalog == null) return null;
  const direct = catalog[model];
  if (direct) return direct.map((effort) => String(effort).toLowerCase());
  const match = Object.entries(catalog).find(([key]) => key.trim().toLowerCase() === model);
  return (match?.[1] || []).map((effort) => String(effort).toLowerCase());
}
