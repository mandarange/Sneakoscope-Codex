import { SksLruCache } from '../../perf/lru-cache.js';
import type { OpenRouterModelReasoningMeta } from './glm-reasoning-policy.js';

export interface GlmModelMetaCacheEntry {
  readonly model: string;
  readonly reasoning: OpenRouterModelReasoningMeta | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createGlmModelMetaCache(maxEntries = 16, ttlMs = DAY_MS) {
  const cache = new SksLruCache<GlmModelMetaCacheEntry>(maxEntries);
  return {
    get(model: string, now = Date.now()): GlmModelMetaCacheEntry | null {
      const entry = cache.get(model);
      if (!entry || entry.expiresAt <= now) return null;
      return entry;
    },
    set(model: string, reasoning: OpenRouterModelReasoningMeta | null, now = Date.now()): GlmModelMetaCacheEntry {
      const entry = { model, reasoning, createdAt: now, expiresAt: now + ttlMs };
      cache.set(model, entry, now);
      return entry;
    }
  };
}
