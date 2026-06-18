export interface LruCacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly createdAt: number;
}

export class SksLruCache<T> {
  private readonly maxEntries: number;
  private readonly map = new Map<string, LruCacheEntry<T>>();

  constructor(maxEntries = 128) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, createdAt = Date.now()): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { key, value, createdAt });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (!oldest) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
