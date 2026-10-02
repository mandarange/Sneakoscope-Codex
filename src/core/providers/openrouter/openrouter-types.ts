import type { SksIssue } from '../../results.js';

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions' as const;

export type OpenRouterKeySource = 'env' | 'user-secret-store' | 'prompt';

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

export interface OpenRouterIssue extends SksIssue {
  readonly status?: number;
  readonly redacted_body_tail?: string;
}
