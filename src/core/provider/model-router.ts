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

export const NARUTO_GPT56_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'] as const;
export type NarutoGpt56Model = typeof NARUTO_GPT56_MODELS[number];

const NARUTO_LUNA_WORK_RE = /(e2e|end[-\s]?to[-\s]?end|test_execution|ux_review|browser|chrome|computer[-\s]?use|computer\s+use|gui|visual\s+(?:qa|test|check)|cross[-\s]?app|playwright|selenium|puppeteer|브라우저|컴퓨터\s*유즈|화면\s*검증)/i;
const NARUTO_SOL_WORK_RE = /(refactor|re-?architect|architecture|architect|planning|\bplan\b|strategy|strategic|integrat|conflict[-_\s]?resolv|patch[-_\s]?rebase|rollback[-_\s]?plan|gpt[-_\s]?final|arbiter|리팩터|아키텍처|기획|전략|통합|충돌\s*해결|롤백\s*계획)/i;
const NARUTO_MAX_WORK_RE = /(complex|critical|high[-\s]?risk|security|database|migration|release|publish|forensic|flaky|failure|cross[-\s]?app|multi[-\s]?step|복잡|고위험|보안|데이터베이스|마이그레이션|릴리즈|포렌식|실패)/i;

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
  const text = `${category} ${String(input.taskText || '')}`;
  const riskText = `${text} ${String(input.riskText || '')}`;
  const explicitRequested = String(input.explicitModel || '').trim();
  const explicit = normalizeNarutoGpt56Model(input.explicitModel);
  const invalidExplicit = Boolean(explicitRequested && !explicit);
  const preferred: NarutoGpt56Model = explicit
    || (category === 'refactor' || category === 'strategy' || category === 'ultrabrain' || NARUTO_SOL_WORK_RE.test(text)
      ? 'gpt-5.6-sol'
      : category === 'e2e' || NARUTO_LUNA_WORK_RE.test(text)
        ? 'gpt-5.6-luna'
        : 'gpt-5.6-terra');
  const available = input.availableModels == null
    ? [...NARUTO_GPT56_MODELS]
    : input.availableModels.map(normalizeNarutoGpt56Model).filter((model): model is NarutoGpt56Model => Boolean(model));
  const degraded = new Set((input.degradedModels || []).map((model) => String(model).toLowerCase()));
  const usable = available.filter((model) => !degraded.has(model));
  const availableEfforts = input.availableModelEfforts == null ? null : input.availableModelEfforts[preferred] || [];
  const maxWork = NARUTO_MAX_WORK_RE.test(riskText);
  const intendedReasoning: ModelReasoning = preferred === 'gpt-5.6-sol'
    ? 'max'
    : preferred === 'gpt-5.6-luna'
      ? maxWork ? 'max' : 'xhigh'
      : preferred === 'gpt-5.6-terra'
        ? maxWork || category === 'review' ? 'max' : 'xhigh'
        : 'xhigh';
  const model = !invalidExplicit && usable.includes(preferred) && (availableEfforts == null || availableEfforts.includes(intendedReasoning)) ? preferred : '';
  return { model, reasoning: intendedReasoning, serviceTier: 'fast' };
}

export function isNarutoGpt56Model(value: unknown): value is NarutoGpt56Model {
  return normalizeNarutoGpt56Model(value) !== null;
}

function normalizeNarutoGpt56Model(value: unknown): NarutoGpt56Model | null {
  const model = String(value || '').trim().toLowerCase();
  return (NARUTO_GPT56_MODELS as readonly string[]).includes(model) ? model as NarutoGpt56Model : null;
}

export function categoryForWorkerRole(role: string, taskText = ''): TaskCategory {
  const text = `${String(role || '')} ${String(taskText || '')}`.toLowerCase();
  if (NARUTO_LUNA_WORK_RE.test(text)) return 'e2e';
  if (/(refactor|re-?architect|리팩터|아키텍처)/i.test(text)) return 'refactor';
  if (/(planning|\bplan\b|strategy|strategic|기획|전략)/i.test(text)) return 'strategy';
  if (/verif|test|qa/.test(text)) return 'verify';
  if (/review|critic|judge/.test(text)) return 'review';
  if (/research|explore|read|scout/.test(text)) return 'quick';
  if (/plan|architect|strategy/.test(text)) return 'ultrabrain';
  return 'agentic';
}

export function modelRouteReason(category: TaskCategory, choice: ModelChoice, opts: { explicit?: boolean; quotaLow?: boolean; degraded?: string[] } = {}): string {
  const model = choice.model || 'codex-selected';
  if (opts.explicit && !choice.model) return `${category}->blocked (explicit model unavailable)`;
  if (opts.explicit) return `${category}->${model} (explicit model preserved)`;
  if (isNarutoGpt56Model(choice.model)) return `${category}->${model}@${choice.reasoning} (Naruto GPT-5.6 family policy)`;
  const suffix = opts.quotaLow ? 'quota discipline' : 'Codex catalog passthrough';
  return `${category}->${model} (${suffix})`;
}
