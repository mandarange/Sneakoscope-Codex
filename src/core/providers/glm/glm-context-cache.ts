import { SksLruCache } from '../../perf/lru-cache.js';
import type { GlmSpeedContext } from './glm-speed-context.js';

export interface GlmContextCache {
  readonly getByDigest: (digest: string) => GlmSpeedContext | null;
  readonly set: (context: GlmSpeedContext) => void;
}

export function createGlmContextCache(maxEntries = 64): GlmContextCache {
  const cache = new SksLruCache<GlmSpeedContext>(maxEntries);
  return {
    getByDigest: (digest: string) => cache.get(digest),
    set: (context: GlmSpeedContext) => cache.set(context.digest, context)
  };
}
