import type { SksResult } from '../../results.js';
import { redactOpenRouterString } from '../../security/redact-secrets.js';
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  type OpenRouterChatCompletionRequest,
  type OpenRouterIssue
} from './openrouter-types.js';
import { normalizeOpenRouterError } from './openrouter-error.js';
import { encodeOpenRouterRequestWithCache, type OpenRouterRequestCacheKeyParts } from './openrouter-request-cache.js';

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
  readonly last_chunk_ms?: number;
  readonly total_ms: number;
  readonly chunk_count: number;
  readonly events: readonly OpenRouterStreamEvent[];
  readonly real_stream: boolean;
  readonly request_cache_hit?: boolean;
  readonly request_body_sha256?: string;
}

export class GlmStreamIdleTimeout extends Error {
  readonly code: 'glm_stream_idle_timeout' | 'glm_stream_idle_timeout_after_ttft';

  constructor(afterTtft: boolean) {
    const code = afterTtft ? 'glm_stream_idle_timeout_after_ttft' : 'glm_stream_idle_timeout';
    super(code);
    this.name = 'GlmStreamIdleTimeout';
    this.code = code;
  }
}

export async function sendOpenRouterChatCompletionStream(input: {
  readonly apiKey: string;
  readonly request: OpenRouterChatCompletionRequest;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly cacheKeyParts?: OpenRouterRequestCacheKeyParts;
}): Promise<SksResult<OpenRouterStreamResult, OpenRouterIssue>> {
  const started = Date.now();
  const controller = input.timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs || 0)) : null;
  try {
    const request = { ...input.request, stream: true };
    const encoded = encodeOpenRouterRequestWithCache(input.cacheKeyParts ? { request, cacheKeyParts: input.cacheKeyParts } : request);
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
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: normalizeOpenRouterError(response.status, text) };
    }
    // Real streaming via ReadableStream reader
    if (response.body && typeof response.body.getReader === 'function') {
      const value = await readRealStream(response.body, started, input.idleTimeoutMs);
      return { ok: true, value: { ...value, request_cache_hit: encoded.cacheHit, request_body_sha256: encoded.entry.bodySha256 } };
    }
    // Fallback: non-streaming response
    const text = await response.text();
    const value = parseOpenRouterStreamText(text, started, false);
    return { ok: true, value: { ...value, request_cache_hit: encoded.cacheHit, request_body_sha256: encoded.entry.bodySha256 } };
  } catch (err: unknown) {
    if (timeout) clearTimeout(timeout);
    if (err instanceof Error && (err.name === 'AbortError' || err instanceof GlmStreamIdleTimeout || err.message === 'glm_stream_idle_timeout' || err.message === 'glm_stream_idle_timeout_after_ttft')) {
      const code = err instanceof GlmStreamIdleTimeout ? err.code : err.message;
      const isIdle = code.startsWith('glm_stream_idle');
      return {
        ok: false,
        error: {
          code: isIdle ? code : 'glm_request_timeout',
          message: isIdle ? `OpenRouter stream idle timeout after ${input.idleTimeoutMs || 0}ms.` : `OpenRouter stream aborted after ${input.timeoutMs || 'external'}ms.`,
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

async function readRealStream(body: ReadableStream<Uint8Array>, startedAtMs: number, idleTimeoutMs?: number): Promise<OpenRouterStreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: OpenRouterStreamEvent[] = [];
  let content = '';
  let model: string | undefined;
  let usage: unknown;
  let ttft: number | null = null;
  let buffer = '';
  let chunkCount = 0;
  let lastChunkMs = startedAtMs;

  try {
    while (true) {
      const readPromise = reader.read();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let result;
      try {
        result = idleTimeoutMs && idleTimeoutMs > 0
          ? await Promise.race([
              readPromise,
              new Promise<never>((_, reject) => {
                idleTimer = setTimeout(() => reject(new GlmStreamIdleTimeout(ttft !== null)), idleTimeoutMs);
              })
            ])
          : await readPromise;
      } catch (err) {
        if (err instanceof GlmStreamIdleTimeout) await reader.cancel(err.code).catch(() => undefined);
        throw err;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }
      const { done, value } = result;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      let hadChunk = false;
      for (const line of lines) {
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
            chunkCount++;
            lastChunkMs = Date.now();
            hadChunk = true;
            events.push({ type: 'chunk', content_delta: delta, ...(model ? { model } : {}), raw });
          }
        } catch {
          events.push({ type: 'error', raw: data });
        }
      }
      if (hadChunk) lastChunkMs = Date.now();
    }
  } finally {
    reader.releaseLock();
  }

  events.push({ type: 'done', ...(model ? { model } : {}), ...(usage ? { usage } : {}) });
  return {
    content,
    ...(model ? { model } : {}),
    ...(usage ? { usage } : {}),
    ttft_ms: ttft,
    last_chunk_ms: lastChunkMs,
    total_ms: Math.max(0, Date.now() - startedAtMs),
    chunk_count: chunkCount,
    events,
    real_stream: true
  };
}

export function parseOpenRouterStreamText(text: string, startedAtMs = Date.now(), realStream = false): OpenRouterStreamResult {
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
    events,
    real_stream: realStream
  };
}
