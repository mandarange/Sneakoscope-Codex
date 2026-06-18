import crypto from 'node:crypto';
import { SksLruCache } from '../../perf/lru-cache.js';

export interface GlmToolSchemaCacheEntry {
  readonly key: string;
  readonly tools: readonly unknown[];
  readonly createdAt: number;
}

export function createGlmToolSchemaCache(maxEntries = 64) {
  const cache = new SksLruCache<GlmToolSchemaCacheEntry>(maxEntries);
  return {
    get(toolsetVersion: string): GlmToolSchemaCacheEntry | null {
      return cache.get(toolsetVersion);
    },
    set(toolsetVersion: string, tools: readonly unknown[]): GlmToolSchemaCacheEntry {
      const entry = { key: toolsetVersion, tools, createdAt: Date.now() };
      cache.set(toolsetVersion, entry);
      return entry;
    }
  };
}

export function digestToolset(tools: readonly unknown[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(tools)).digest('hex');
}
