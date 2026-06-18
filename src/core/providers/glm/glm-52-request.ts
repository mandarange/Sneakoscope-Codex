import type {
  OpenRouterChatCompletionRequest,
  OpenRouterChatMessage
} from '../openrouter/openrouter-types.js';
import {
  GLM_52_DEFAULT_REQUEST_SETTINGS,
  GLM_52_OPENROUTER_MODEL,
  clampGlm52MaxTokens,
  type Glm52ReasoningEffort
} from './glm-52-settings.js';

export interface Glm52RequestInput {
  readonly messages: readonly OpenRouterChatMessage[];
  readonly stream?: boolean;
  readonly reasoningEffort?: Glm52ReasoningEffort;
  readonly maxTokens?: number;
  readonly tools?: readonly unknown[];
  readonly toolChoice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  readonly parallelToolCalls?: boolean;
  readonly providerSort?: 'price' | 'throughput' | 'latency';
  readonly responseFormat?: unknown;
}

export function buildGlm52Request(input: Glm52RequestInput): OpenRouterChatCompletionRequest {
  const request: OpenRouterChatCompletionRequest = {
    model: GLM_52_OPENROUTER_MODEL,
    messages: input.messages,
    stream: input.stream ?? GLM_52_DEFAULT_REQUEST_SETTINGS.stream,
    temperature: GLM_52_DEFAULT_REQUEST_SETTINGS.temperature,
    top_p: GLM_52_DEFAULT_REQUEST_SETTINGS.top_p,
    reasoning: { effort: input.reasoningEffort ?? 'high' },
    max_tokens: clampGlm52MaxTokens(input.maxTokens),
    tool_choice: input.toolChoice ?? 'auto',
    parallel_tool_calls: input.parallelToolCalls ?? false,
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      sort: input.providerSort ?? 'throughput'
    }
  };
  return {
    ...request,
    ...(input.tools ? { tools: input.tools } : {}),
    ...(input.responseFormat ? { response_format: input.responseFormat } : {})
  };
}

export function buildGlm52KeyValidationRequest(): OpenRouterChatCompletionRequest {
  return buildGlm52Request({
    messages: [{ role: 'user', content: 'Reply with OK.' }],
    stream: false,
    maxTokens: 1,
    toolChoice: 'none',
    parallelToolCalls: false
  });
}
