import type { SksIssue } from '../../results.js';

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions' as const;

export type OpenRouterRole = 'system' | 'user' | 'assistant' | 'tool';
export type OpenRouterReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type OpenRouterKeySource = 'env' | 'user-secret-store' | 'prompt';

export interface OpenRouterChatMessage {
  readonly role: OpenRouterRole;
  readonly content: string;
  readonly name?: string;
  readonly tool_call_id?: string;
}

export interface OpenRouterProviderPreferences {
  readonly allow_fallbacks: false;
  readonly require_parameters: boolean;
  readonly sort?: 'price' | 'throughput' | 'latency';
  readonly preferred_min_throughput?: number | {
    readonly p50?: number;
    readonly p90?: number;
  };
  readonly preferred_max_latency?: number | {
    readonly p50?: number;
    readonly p90?: number;
  };
  readonly order?: readonly string[];
}

export interface OpenRouterChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly OpenRouterChatMessage[];
  readonly stream?: boolean;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly max_tokens?: number;
  readonly stop?: string | readonly string[];
  readonly reasoning?: {
    readonly effort?: OpenRouterReasoningEffort;
    readonly enabled?: boolean;
    readonly exclude?: boolean;
  };
  readonly tools?: readonly unknown[];
  readonly tool_choice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
  readonly parallel_tool_calls?: boolean;
  readonly response_format?: unknown;
  readonly provider?: OpenRouterProviderPreferences;
}

export interface OpenRouterChatCompletionResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: readonly unknown[];
  readonly usage?: unknown;
  readonly [key: string]: unknown;
}

export interface OpenRouterSendInput {
  readonly apiKey: string;
  readonly request: OpenRouterChatCompletionRequest;
  readonly endpoint?: typeof OPENROUTER_CHAT_COMPLETIONS_URL;
  readonly fetchImpl?: typeof fetch;
}

export interface OpenRouterKeyResolution {
  readonly key: string | null;
  readonly source: OpenRouterKeySource | null;
  readonly env_var?: 'OPENROUTER_API_KEY' | 'SKS_OPENROUTER_API_KEY';
  readonly key_preview: string | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface OpenRouterKeyRecord {
  readonly schema: 'sks.openrouter-key.v1';
  readonly created_at: string;
  readonly updated_at: string;
  readonly key_hash: string;
  readonly key_preview: string;
}

export interface OpenRouterKeyValidation {
  readonly schema: 'sks.openrouter-key-validation.v1';
  readonly ok: boolean;
  readonly requested_model: string;
  readonly actual_model: string | null;
  readonly strict_model_lock: true;
  readonly gpt_fallback_allowed: false;
}

export interface OpenRouterIssue extends SksIssue {
  readonly status?: number;
  readonly redacted_body_tail?: string;
}
