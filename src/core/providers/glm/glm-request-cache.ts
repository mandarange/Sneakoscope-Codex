import crypto from 'node:crypto';
import { SksLruCache } from '../../perf/lru-cache.js';
import type { OpenRouterChatCompletionRequest } from '../openrouter/openrouter-types.js';

export interface EncodedRequestCacheEntry {
  readonly key: string;
  readonly bodySha256: string;
  readonly byteLength: number;
  readonly createdAt: number;
  readonly bodyStored: false;
}

export function createGlmEncodedRequestCache(maxEntries = 128) {
  return new SksLruCache<EncodedRequestCacheEntry>(maxEntries);
}

export function encodeGlmRequestWithCache(
  request: OpenRouterChatCompletionRequest,
  cache = defaultEncodedRequestCache
): { readonly entry: EncodedRequestCacheEntry; readonly cacheHit: boolean } {
  const key = digestRequestForCache(request);
  const hit = cache.get(key);
  if (hit) return { entry: hit, cacheHit: true };
  const body = JSON.stringify(request);
  const entry = {
    key,
    bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
    byteLength: Buffer.byteLength(body),
    createdAt: Date.now(),
    bodyStored: false as const
  };
  cache.set(key, entry);
  return { entry, cacheHit: false };
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
    reasoning: request.reasoning || null
  };
  return crypto.createHash('sha256').update(stableStringify(safe)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

const defaultEncodedRequestCache = createGlmEncodedRequestCache();
