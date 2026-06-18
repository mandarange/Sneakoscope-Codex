import type { SksResult } from '../../results.js';
import { redactOpenRouterString } from '../../security/redact-secrets.js';
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  type OpenRouterChatCompletionRequest,
  type OpenRouterIssue
} from './openrouter-types.js';
import { normalizeOpenRouterError } from './openrouter-error.js';
import { encodeGlmRequestWithCache } from '../glm/glm-request-cache.js';

export interface OpenRouterStreamEvent {
  readonly type: 'chunk' | 'done' | 'error';
  readonly content_delta?: string;
  readonly model?: string;
  readonly usage?: unknown;
  readonly raw?: unknown;
}

export interface OpenRouterStreamResult {
  readonly content: string;
  readonly model?: string;
  readonly usage?: unknown;
  readonly ttft_ms: number | null;
  readonly total_ms: number;
  readonly chunk_count: number;
  readonly events: readonly OpenRouterStreamEvent[];
}

export async function sendOpenRouterChatCompletionStream(input: {
  readonly apiKey: string;
  readonly request: OpenRouterChatCompletionRequest;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}): Promise<SksResult<OpenRouterStreamResult, OpenRouterIssue>> {
  const started = Date.now();
  const controller = input.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs || 0)) : null;
  try {
    const request = { ...input.request, stream: true };
    const encoded = encodeGlmRequestWithCache(request);
    const signal = input.signal || controller?.signal;
    const response = await (input.fetchImpl || fetch)(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      ...(signal ? { signal } : {}),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'Sneakoscope-Codex'
      },
      body: encoded.body
    });
    if (timeout) clearTimeout(timeout);
    const text = await response.text();
    if (!response.ok) return { ok: false, error: normalizeOpenRouterError(response.status, text) };
    return { ok: true, value: parseOpenRouterStreamText(text, started) };
  } catch (err: unknown) {
    if (timeout) clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        error: {
          code: 'glm_request_timeout',
          message: `OpenRouter stream aborted after ${input.timeoutMs || 'external'}ms.`,
          severity: 'failed'
        }
      };
    }
    return {
      ok: false,
      error: {
        code: 'glm_openrouter_stream_failed',
        message: redactOpenRouterString(err instanceof Error ? err.message : String(err)),
        severity: 'failed'
      }
    };
  }
}

export function parseOpenRouterStreamText(text: string, startedAtMs = Date.now()): OpenRouterStreamResult {
  const events: OpenRouterStreamEvent[] = [];
  let content = '';
  let model: string | undefined;
  let usage: unknown;
  let ttft: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const raw = JSON.parse(data) as any;
      const delta = raw?.choices?.[0]?.delta?.content;
      if (typeof raw?.model === 'string') model = raw.model;
      if (raw?.usage) usage = raw.usage;
      if (typeof delta === 'string' && delta) {
        if (ttft === null) ttft = Math.max(0, Date.now() - startedAtMs);
        content += delta;
        events.push({ type: 'chunk', content_delta: delta, ...(model ? { model } : {}), raw });
      }
    } catch {
      events.push({ type: 'error', raw: data });
    }
  }
  events.push({ type: 'done', ...(model ? { model } : {}), ...(usage ? { usage } : {}) });
  return {
    content,
    ...(model ? { model } : {}),
    ...(usage ? { usage } : {}),
    ttft_ms: ttft,
    total_ms: Math.max(0, Date.now() - startedAtMs),
    chunk_count: events.filter((event) => event.type === 'chunk').length,
    events
  };
}
