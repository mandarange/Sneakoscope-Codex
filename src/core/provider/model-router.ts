import {
  decideSubagentModel,
  subagentModelProfile,
  type SubagentModelPolicyId
} from '../subagents/model-policy.js';
import { latestTierModelSet } from '../subagents/model-tiers.js';

export type TaskCategory = 'quick' | 'standard' | 'agentic' | 'ultrabrain' | 'verify' | 'review' | 'e2e' | 'refactor' | 'strategy';
export type ModelReasoning = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export type ModelServiceTier = 'fast' | 'standard';

export interface ModelChoice {
  model: string;
  reasoning: ModelReasoning;
  serviceTier: ModelServiceTier;
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

/** Child models SKS routes to: the latest model of each tier, never a pinned family. */
export function narutoModels(): string[] {
  return [...latestTierModelSet()];
}
const E2E_WORK_RE = /(e2e|end[-\s]?to[-\s]?end|test_execution|browser|chrome|computer[-\s]?use|computer\s+use|cross[-\s]?app|playwright|selenium|puppeteer|브라우저|컴퓨터\s*유즈)/i;

export async function routeModel(category: TaskCategory, opts: {
  model?: string | null;
  narutoOnly?: boolean;
  reasoningEffort?: ModelReasoning | null;
  taskText?: string;
  riskText?: string;
  availableModels?: string[] | null;
  availableModelEfforts?: Record<string, string[]> | null;
} = {}): Promise<ModelChoice> {
  if (opts.narutoOnly) {
    return routeNarutoTierModel({
      category,
      ...(opts.taskText !== undefined ? { taskText: opts.taskText } : {}),
      ...(opts.riskText !== undefined ? { riskText: opts.riskText } : {}),
      ...(opts.model !== undefined ? { explicitModel: opts.model } : {}),
      ...(opts.reasoningEffort !== undefined ? { reasoningEffort: opts.reasoningEffort } : {}),
      ...(opts.availableModels !== undefined ? { availableModels: opts.availableModels } : {}),
      ...(opts.availableModelEfforts !== undefined ? { availableModelEfforts: opts.availableModelEfforts } : {})
    });
  }
  const policy = CATEGORY_POLICY[category] || CATEGORY_POLICY.standard;
  const model = String(opts.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || '').trim();
  return { model, reasoning: policy.reasoning, serviceTier: policy.serviceTier };
}

export function routeNarutoTierModel(input: {
  category?: TaskCategory;
  taskText?: string;
  riskText?: string;
  explicitModel?: string | null;
  reasoningEffort?: ModelReasoning | null;
  availableModels?: string[] | null;
  availableModelEfforts?: Record<string, string[]> | null;
} = {}): ModelChoice {
  const category = input.category || 'agentic';
  const explicitRequested = String(input.explicitModel || '').trim();
  const explicit = normalizeNarutoTierModel(input.explicitModel);
  const invalidExplicit = Boolean(explicitRequested && !explicit);
  const explicitHighRisk = /critical|forensic|security|database|migration|release|production|high[- ]?risk|data\s*loss|permission|auth|보안|데이터베이스|마이그레이션|릴리스|운영|고위험/i.test(String(input.riskText || ''));
  const automatic = decideSubagentModel({
    title: input.taskText,
    description: input.riskText,
    role: category,
    toolHeavy: category === 'e2e',
    requiresJudgment: category === 'review'
      || category === 'refactor'
      || category === 'strategy'
      || category === 'ultrabrain'
      || explicitHighRisk
  });
  // No explicit model: the task's tier picks the latest fast or accurate model.
  const preferred: string = explicit || automatic.model;
  const available = input.availableModels == null
    ? narutoModels()
    : input.availableModels.map(normalizeNarutoTierModel).filter((model): model is string => Boolean(model));
  const availableEfforts = effortsForModel(input.availableModelEfforts, preferred);
  const intendedReasoning: ModelReasoning = input.reasoningEffort || (explicit
    ? reasoningForExplicitModel(explicit, automatic.policy)
    : automatic.modelReasoningEffort);
  const model = !invalidExplicit && available.includes(preferred) && (availableEfforts == null || availableEfforts.includes(intendedReasoning)) ? preferred : '';
  return { model, reasoning: intendedReasoning, serviceTier: 'fast' };
}

export function isNarutoTierModel(value: unknown): value is string {
  return normalizeNarutoTierModel(value) !== null;
}

export function normalizeNarutoTierModel(value: unknown): string | null {
  const model = String(value || '').trim().toLowerCase();
  return narutoModels().includes(model) ? model : null;
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

export function modelRouteReason(category: TaskCategory, choice: ModelChoice, opts: { explicit?: boolean } = {}): string {
  const model = choice.model || 'codex-selected';
  if (opts.explicit && !choice.model) return `${category}->blocked (explicit model unavailable)`;
  if (opts.explicit) return `${category}->${model} (explicit model preserved)`;
  if (isNarutoTierModel(choice.model)) return `${category}->${model}@${choice.reasoning} (official subagent model policy)`;
  return `${category}->${model} (Codex catalog passthrough)`;
}

function effortsForModel(catalog: Record<string, string[]> | null | undefined, model: string): string[] | null {
  if (catalog == null) return null;
  const direct = catalog[model];
  if (direct) return direct.map((effort) => String(effort).toLowerCase());
  const match = Object.entries(catalog).find(([key]) => key.trim().toLowerCase() === model);
  return (match?.[1] || []).map((effort) => String(effort).toLowerCase());
}

function reasoningForExplicitModel(_model: string, policy: SubagentModelPolicyId): ModelReasoning {
  return subagentModelProfile(policy).modelReasoningEffort;
}
