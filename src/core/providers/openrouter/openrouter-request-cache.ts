import crypto from 'node:crypto';
import { SksLruCache } from '../../perf/lru-cache.js';
import type { OpenRouterChatCompletionRequest } from './openrouter-types.js';

export interface EncodedRequestCacheEntry {
  readonly key: string;
  readonly body: string;
  readonly bodySha256: string;
  readonly byteLength: number;
  readonly createdAt: number;
  readonly bodyStored: boolean;
  readonly skippedReason?: string;
}

export interface OpenRouterRequestCacheKeyParts {
  readonly model: string;
  readonly profile: string;
  readonly stable_prefix_digest: string;
  readonly shard_suffix_digest: string;
  readonly tools_digest: string | null;
  readonly response_format_digest: string | null;
  readonly provider_digest: string;
  readonly session_id: string | null;
}

/** @deprecated Prefer OpenRouterRequestCacheKeyParts */
export type GlmRequestCacheKeyParts = OpenRouterRequestCacheKeyParts;

export interface EncodeOpenRouterRequestWithCacheInput {
  readonly request: OpenRouterChatCompletionRequest;
  readonly cacheKeyParts?: OpenRouterRequestCacheKeyParts;
  readonly stringify?: (request: OpenRouterChatCompletionRequest) => string;
}

/** @deprecated Prefer EncodeOpenRouterRequestWithCacheInput */
export type EncodeGlmRequestWithCacheInput = EncodeOpenRouterRequestWithCacheInput;

export function createOpenRouterEncodedRequestCache(maxEntries = 128) {
  return new SksLruCache<EncodedRequestCacheEntry>(maxEntries);
}

/** @deprecated Prefer createOpenRouterEncodedRequestCache */
export const createGlmEncodedRequestCache = createOpenRouterEncodedRequestCache;

export function encodeOpenRouterRequestWithCache(
  input: OpenRouterChatCompletionRequest | EncodeOpenRouterRequestWithCacheInput,
  cache = defaultEncodedRequestCache
): { readonly body: string; readonly entry: EncodedRequestCacheEntry; readonly cacheHit: boolean } {
  const request = 'request' in input ? input.request : input;
  const stringify = 'request' in input && input.stringify ? input.stringify : JSON.stringify;
  const key = 'request' in input && input.cacheKeyParts ? digestRequestCacheKeyParts(input.cacheKeyParts) : digestRequestForCache(request);
  const hit = cache.get(key);
  if (hit) {
    if (hit.bodyStored) {
      return { body: hit.body, entry: hit, cacheHit: true };
    }
    const body = stringify(request);
    return { body, entry: hit, cacheHit: true };
  }
  const body = stringify(request);
  if (containsSecretLikeContent(body)) {
    const entry: EncodedRequestCacheEntry = {
      key,
      body: '',
      bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
      byteLength: Buffer.byteLength(body),
      createdAt: Date.now(),
      bodyStored: false,
      skippedReason: 'secret_like_request_body_not_cached'
    };
    return { body, entry, cacheHit: false };
  }
  const entry: EncodedRequestCacheEntry = {
    key,
    body,
    bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
    byteLength: Buffer.byteLength(body),
    createdAt: Date.now(),
    bodyStored: true
  };
  cache.set(key, entry);
  return { body, entry, cacheHit: false };
}

/** @deprecated Prefer encodeOpenRouterRequestWithCache */
export const encodeGlmRequestWithCache = encodeOpenRouterRequestWithCache;

export function digestRequestCacheKeyParts(parts: OpenRouterRequestCacheKeyParts): string {
  return crypto.createHash('sha256').update(stableStringify(parts)).digest('hex');
}

export function digestRequestForCache(request: OpenRouterChatCompletionRequest): string {
  const safe = {
    model: request.model,
    messages: request.messages,
    tools: request.tools || null,
    response_format: request.response_format || null,
    provider: request.provider || null,
    max_tokens: request.max_tokens || null,
    temperature: request.temperature || null,
    top_p: request.top_p || null,
    tool_choice: request.tool_choice || null,
    parallel_tool_calls: request.parallel_tool_calls || null,
    reasoning: request.reasoning || null,
    session_id: request.session_id || null
  };
  return crypto.createHash('sha256').update(stableStringify(safe)).digest('hex');
}

function containsSecretLikeContent(body: string): boolean {
  return /\b(?:Bearer\s+[A-Za-z0-9._~+/-]+|sk-(?:or-)?[A-Za-z0-9_-]{12,}|OPENROUTER_API_KEY|SKS_OPENROUTER_API_KEY)\b/.test(body);
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

const defaultEncodedRequestCache = createOpenRouterEncodedRequestCache();
