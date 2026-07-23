import type { OpenRouterIssue } from './openrouter-types.js';
import { redactOpenRouterString } from '../../security/redact-secrets.js';

export type OpenRouterErrorCode =
  | 'glm_openrouter_unauthorized'
  | 'glm_openrouter_rate_limited'
  | 'glm_openrouter_provider_unavailable'
  | 'glm_openrouter_invalid_response'
  | 'glm_openrouter_request_failed';

export function normalizeOpenRouterError(status: number, body: string, env: NodeJS.ProcessEnv = process.env): OpenRouterIssue {
  const code: OpenRouterErrorCode =
    status === 401 || status === 403
      ? 'glm_openrouter_unauthorized'
      : status === 429
        ? 'glm_openrouter_rate_limited'
        : status >= 500
          ? 'glm_openrouter_provider_unavailable'
          : 'glm_openrouter_request_failed';
  return {
    code,
    message: statusMessage(code),
    severity: status >= 500 ? 'failed' : 'blocked',
    status,
    redacted_body_tail: redactOpenRouterString(body, env).slice(-2000)
  };
}

export function invalidOpenRouterResponseIssue(message: string, body?: string, env: NodeJS.ProcessEnv = process.env): OpenRouterIssue {
  const issue: OpenRouterIssue = {
    code: 'glm_openrouter_invalid_response',
    message,
    severity: 'failed'
  };
  return body ? { ...issue, redacted_body_tail: redactOpenRouterString(body, env).slice(-2000) } : issue;
}

function statusMessage(code: OpenRouterErrorCode): string {
  if (code === 'glm_openrouter_unauthorized') return 'OpenRouter rejected the API key.';
  if (code === 'glm_openrouter_rate_limited') return 'OpenRouter rate limited the request.';
  if (code === 'glm_openrouter_provider_unavailable') return 'OpenRouter is temporarily unavailable.';
  if (code === 'glm_openrouter_invalid_response') return 'OpenRouter returned an invalid response.';
  return 'OpenRouter request failed.';
}
