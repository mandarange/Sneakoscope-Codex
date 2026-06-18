import type { SksResult } from '../../results.js';
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  type OpenRouterChatCompletionResponse,
  type OpenRouterIssue,
  type OpenRouterSendInput
} from './openrouter-types.js';
import { invalidOpenRouterResponseIssue, normalizeOpenRouterError } from './openrouter-error.js';
import { redactOpenRouterString } from '../../security/redact-secrets.js';

export async function sendOpenRouterChatCompletion(
  input: OpenRouterSendInput
): Promise<SksResult<OpenRouterChatCompletionResponse, OpenRouterIssue>> {
  try {
    const doFetch = input.fetchImpl || fetch;
    const response = await doFetch(input.endpoint || OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'Sneakoscope-Codex'
      },
      body: JSON.stringify(input.request)
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: normalizeOpenRouterError(response.status, text) };
    return parseOpenRouterResponse(text);
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: 'glm_openrouter_request_failed',
        message: redactOpenRouterString(err instanceof Error ? err.message : String(err)),
        severity: 'failed'
      }
    };
  }
}

export function parseOpenRouterResponse(
  text: string
): SksResult<OpenRouterChatCompletionResponse, OpenRouterIssue> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: invalidOpenRouterResponseIssue('OpenRouter response was not an object.', text) };
    }
    return { ok: true, value: parsed as OpenRouterChatCompletionResponse };
  } catch {
    return { ok: false, error: invalidOpenRouterResponseIssue('OpenRouter response was not valid JSON.', text) };
  }
}
