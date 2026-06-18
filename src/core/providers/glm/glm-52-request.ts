import type {
  OpenRouterChatCompletionRequest,
  OpenRouterChatMessage
} from '../openrouter/openrouter-types.js';
import {
  GLM_52_DEFAULT_REQUEST_SETTINGS,
  GLM_52_OPENROUTER_MODEL,
  clampGlm52MaxTokens,
  type Glm52ReasoningEffort,
  type GlmProfileName
} from './glm-52-settings.js';
import { buildDeepReasoningConfig, type OpenRouterModelReasoningMeta } from './glm-reasoning-policy.js';
import { profileFromConst, resolveGlmProfileFromArgs, type GlmResolvedProfile } from './glm-profile-resolver.js';

export interface Glm52RequestInput {
  readonly messages: readonly OpenRouterChatMessage[];
  readonly args?: readonly string[];
  readonly profile?: GlmProfileName | GlmResolvedProfile;
  readonly stream?: boolean;
  readonly reasoningEffort?: Glm52ReasoningEffort;
  readonly reasoningMeta?: OpenRouterModelReasoningMeta | null;
  readonly maxTokens?: number;
  readonly tools?: readonly unknown[];
  readonly toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  readonly parallelToolCalls?: boolean;
  readonly providerSort?: 'price' | 'throughput' | 'latency';
  readonly responseFormat?: unknown;
}

export function buildGlm52Request(input: Glm52RequestInput): OpenRouterChatCompletionRequest {
  const profile = resolveInputProfile(input.profile, input.args, input.reasoningEffort);
  if (profile.blockers.length) {
    throw new Error(`GLM request profile blocked: ${profile.blockers.join(', ')}`);
  }
  const strictOrDeepEffort = profile.reasoning_effort || (
    input.reasoningEffort === 'high' || input.reasoningEffort === 'xhigh' ? input.reasoningEffort : undefined
  );
  const reasoning = profile.name === 'speed'
    ? buildDeepReasoningConfig('xhigh')
    : buildDeepReasoningConfig(strictOrDeepEffort || 'high');
  const request: OpenRouterChatCompletionRequest = {
    model: GLM_52_OPENROUTER_MODEL,
    messages: input.messages,
    stream: input.stream ?? profile.stream,
    temperature: profile.temperature,
    top_p: profile.top_p,
    ...(reasoning ? { reasoning } : {}),
    max_tokens: clampGlm52MaxTokens(input.maxTokens ?? profile.max_tokens),
    tool_choice: input.toolChoice ?? profile.tool_choice,
    parallel_tool_calls: input.parallelToolCalls ?? profile.parallel_tool_calls,
    ...(profile.stop && profile.name === 'speed' ? { stop: profile.stop } : {}),
    provider: {
      allow_fallbacks: false,
      require_parameters: profile.provider.require_parameters,
      ...(profile.provider.sort || input.providerSort ? { sort: input.providerSort ?? profile.provider.sort } : {}),
      ...(profile.provider.preferred_min_throughput ? { preferred_min_throughput: profile.provider.preferred_min_throughput } : {}),
      ...(profile.provider.preferred_max_latency ? { preferred_max_latency: profile.provider.preferred_max_latency } : {}),
      ...(profile.provider.order ? { order: profile.provider.order } : {})
    },
    ...(input.responseFormat || profile.response_format ? { response_format: input.responseFormat ?? profile.response_format } : {})
  };
  return {
    ...request,
    ...(input.tools && request.tool_choice !== 'none' ? { tools: input.tools } : {})
  };
}

export function buildGlm52KeyValidationRequest(): OpenRouterChatCompletionRequest {
  return buildGlm52Request({
    messages: [{ role: 'user', content: 'Reply with OK.' }],
    profile: 'speed',
    stream: false,
    maxTokens: 1,
    toolChoice: 'none',
    parallelToolCalls: false
  });
}

function resolveInputProfile(
  profile: Glm52RequestInput['profile'],
  args: readonly string[] | undefined,
  reasoningEffort: Glm52RequestInput['reasoningEffort']
): GlmResolvedProfile {
  if (profile && typeof profile === 'object') return profile;
  if (profile) return profileFromConst(profile);
  if (args) return resolveGlmProfileFromArgs(args);
  if (reasoningEffort === 'xhigh') return profileFromConst('xhigh');
  if (reasoningEffort === 'high') return profileFromConst('deep');
  return profileFromConst(GLM_52_DEFAULT_REQUEST_SETTINGS.mode === 'mad-glm-speed' ? 'speed' : 'speed');
}
