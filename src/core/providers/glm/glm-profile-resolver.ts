import { readOption } from '../../../cli/args.js';
import type { OpenRouterProviderPreferences } from '../openrouter/openrouter-types.js';
import {
  GLM_DEEP_MODE,
  GLM_DEEP_PROFILE,
  GLM_52_OPENROUTER_MODEL,
  GLM_SPEED_MODE,
  GLM_SPEED_PROFILE,
  GLM_STRICT_MODE,
  GLM_STRICT_PROFILE,
  GLM_XHIGH_MODE,
  GLM_XHIGH_PROFILE,
  type GlmModeId,
  type GlmProfileName
} from './glm-52-settings.js';

export type GlmSelectableReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface GlmSlashModelSelection {
  readonly model: string | null;
  readonly reasoning_effort: GlmSelectableReasoningEffort | null;
  readonly consumed_indexes: readonly number[];
  readonly blockers: readonly string[];
}

export interface GlmResolvedProfile {
  readonly name: GlmProfileName;
  readonly mode: GlmModeId;
  readonly stream: boolean;
  readonly max_tokens: number;
  readonly temperature: number;
  readonly top_p: number;
  readonly tool_choice: 'none' | 'auto';
  readonly parallel_tool_calls: false;
  readonly provider: OpenRouterProviderPreferences;
  readonly reasoning_effort?: 'high' | 'xhigh' | null;
  readonly response_format?: unknown;
  readonly stop?: readonly string[];
  readonly blockers: readonly string[];
}

export function resolveGlmProfileFromArgs(args: readonly string[] = []): GlmResolvedProfile {
  const list = args.map(String);
  const exactProvider = readOption(list, '--exact-provider', null);
  const slashSelection = parseGlmSlashModelSelection(list);
  const providerBlockers = exactProvider && !isValidOpenRouterProviderSlug(exactProvider)
    ? [`invalid_openrouter_provider_slug:${exactProvider}`]
    : [];
  const base = slashSelection.reasoning_effort === 'xhigh' || list.includes('--xhigh')
    ? profileFromConst('xhigh')
    : list.includes('--strict')
      ? profileFromConst('strict')
      : slashSelection.reasoning_effort === 'high' || list.includes('--deep')
        ? profileFromConst('deep')
        : profileFromConst('speed');

  const provider: OpenRouterProviderPreferences = exactProvider && !providerBlockers.length
    ? {
      allow_fallbacks: false,
      require_parameters: base.provider.require_parameters,
      order: [exactProvider]
    }
    : list.includes('--ttft')
      ? {
        ...base.provider,
        sort: 'latency',
        preferred_max_latency: { p50: 1.5, p90: 4 }
      }
      : base.provider;

  return {
    ...base,
    provider,
    blockers: [...providerBlockers, ...slashSelection.blockers]
  };
}

export function reasoningEffortFromGlmSlashModelArgs(args: readonly string[] = []): GlmSelectableReasoningEffort | null {
  return parseGlmSlashModelSelection(args).reasoning_effort;
}

export function stripGlmSlashModelArgs(args: readonly string[] = []): string[] {
  const consumed = new Set(parseGlmSlashModelSelection(args).consumed_indexes);
  return args.map(String).filter((_arg, index) => !consumed.has(index));
}

export function parseGlmSlashModelSelection(args: readonly string[] = []): GlmSlashModelSelection {
  const list = args.map(String);
  const consumed = new Set<number>();
  const values: string[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i] || '';
    if (arg === '/model') {
      consumed.add(i);
      for (let j = i + 1; j < list.length && values.length < 2; j += 1) {
        const candidate = list[j] || '';
        if (candidate.startsWith('--') || candidate.startsWith('/')) break;
        consumed.add(j);
        values.push(candidate);
        if (values.length === 1 && isSelectableGlmReasoningEffort(candidate.trim().toLowerCase())) break;
      }
      break;
    }
    const inline = arg.match(/^\/model(?::|=)(.+)$/)?.[1];
    if (inline) {
      consumed.add(i);
      values.push(...inline.split(/[,:]/).map((value) => value.trim()).filter(Boolean).slice(0, 2));
      break;
    }
  }

  let model: string | null = null;
  let reasoning: GlmSelectableReasoningEffort | null = null;
  const blockers: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (isSelectableGlmReasoningEffort(normalized)) {
      reasoning = normalized;
      continue;
    }
    if (!model) {
      model = value;
      if (!isAllowedGlmSlashModel(value)) blockers.push(`glm_slash_model_mismatch:${value}`);
      continue;
    }
    blockers.push(`glm_slash_model_unrecognized:${value}`);
  }
  return {
    model,
    reasoning_effort: reasoning,
    consumed_indexes: [...consumed].sort((a, b) => a - b),
    blockers
  };
}

export function profileFromConst(name: GlmProfileName): GlmResolvedProfile {
  if (name === 'deep') {
    return {
      name,
      mode: GLM_DEEP_MODE,
      stream: GLM_DEEP_PROFILE.stream,
      max_tokens: GLM_DEEP_PROFILE.max_tokens,
      temperature: GLM_DEEP_PROFILE.temperature,
      top_p: GLM_DEEP_PROFILE.top_p,
      tool_choice: GLM_DEEP_PROFILE.tool_choice,
      parallel_tool_calls: GLM_DEEP_PROFILE.parallel_tool_calls,
      provider: GLM_DEEP_PROFILE.provider,
      reasoning_effort: GLM_DEEP_PROFILE.reasoning_effort,
      blockers: []
    };
  }
  if (name === 'xhigh') {
    return {
      ...profileFromConst('deep'),
      name,
      mode: GLM_XHIGH_MODE,
      max_tokens: GLM_XHIGH_PROFILE.max_tokens,
      reasoning_effort: GLM_XHIGH_PROFILE.reasoning_effort,
      blockers: []
    };
  }
  if (name === 'strict') {
    return {
      ...profileFromConst('deep'),
      name,
      mode: GLM_STRICT_MODE,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'sks_glm_strict_proof',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              patch: { type: 'string' },
              proof: { type: 'object' }
            },
            required: ['summary', 'patch', 'proof']
          }
        }
      },
      blockers: []
    };
  }
  return {
    name,
    mode: GLM_SPEED_MODE,
    stream: GLM_SPEED_PROFILE.stream,
    max_tokens: GLM_SPEED_PROFILE.max_tokens,
    temperature: GLM_SPEED_PROFILE.temperature,
    top_p: GLM_SPEED_PROFILE.top_p,
    tool_choice: GLM_SPEED_PROFILE.tool_choice,
    parallel_tool_calls: GLM_SPEED_PROFILE.parallel_tool_calls,
    provider: GLM_SPEED_PROFILE.provider,
    reasoning_effort: GLM_SPEED_PROFILE.reasoning_effort,
    stop: ['</sks_patch>'],
    blockers: []
  };
}

export function isValidOpenRouterProviderSlug(value: string): boolean {
  return /^(?!.*(?:^|\/)\.\.?(?:\/|$))[a-z0-9][a-z0-9._-]{0,63}(?:\/[a-z0-9][a-z0-9._-]{0,63}){0,3}$/i.test(value);
}

function isSelectableGlmReasoningEffort(value: string): value is GlmSelectableReasoningEffort {
  return value === 'none' || value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh';
}

function isAllowedGlmSlashModel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === GLM_52_OPENROUTER_MODEL || normalized === 'glm-5.2' || normalized === 'glm5.2';
}
