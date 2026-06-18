import { readOption } from '../../../cli/args.js';
import type { OpenRouterProviderPreferences } from '../openrouter/openrouter-types.js';
import {
  GLM_DEEP_MODE,
  GLM_DEEP_PROFILE,
  GLM_SPEED_MODE,
  GLM_SPEED_PROFILE,
  GLM_STRICT_MODE,
  GLM_STRICT_PROFILE,
  GLM_XHIGH_MODE,
  GLM_XHIGH_PROFILE,
  type GlmModeId,
  type GlmProfileName
} from './glm-52-settings.js';

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
  readonly reasoning_effort?: 'high' | 'xhigh';
  readonly response_format?: unknown;
  readonly stop?: readonly string[];
  readonly blockers: readonly string[];
}

export function resolveGlmProfileFromArgs(args: readonly string[] = []): GlmResolvedProfile {
  const list = args.map(String);
  const exactProvider = readOption(list, '--exact-provider', null);
  const providerBlockers = exactProvider && !isValidOpenRouterProviderSlug(exactProvider)
    ? [`invalid_openrouter_provider_slug:${exactProvider}`]
    : [];
  const base = list.includes('--xhigh')
    ? profileFromConst('xhigh')
    : list.includes('--strict')
      ? profileFromConst('strict')
      : list.includes('--deep')
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
    blockers: providerBlockers
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
