import type { OpenRouterReasoningEffort } from '../openrouter/openrouter-types.js';

export interface OpenRouterModelReasoningMeta {
  readonly mandatory?: boolean;
  readonly default_enabled?: boolean;
  readonly default_effort?: string;
  readonly supported_efforts?: readonly OpenRouterReasoningEffort[];
  readonly supports_max_tokens?: boolean;
}

export interface OpenRouterReasoningConfig {
  readonly effort?: OpenRouterReasoningEffort;
  readonly exclude: true;
}

const FAST_REASONING_ORDER: readonly OpenRouterReasoningEffort[] = ['none', 'minimal', 'low'];

export function buildFastReasoningConfig(
  meta: OpenRouterModelReasoningMeta | null | undefined = null
): OpenRouterReasoningConfig {
  if (meta?.mandatory === true) return { exclude: true };
  const supported = new Set(meta?.supported_efforts || []);
  for (const effort of FAST_REASONING_ORDER) {
    if (supported.has(effort)) return { effort, exclude: true };
  }
  return { exclude: true };
}

export function buildDeepReasoningConfig(effort: 'high' | 'xhigh'): OpenRouterReasoningConfig {
  return { effort, exclude: true };
}
