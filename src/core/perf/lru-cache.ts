export interface LruCacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly createdAt: number;
}

export class SksLruCache<T> {
  private readonly maxEntries: number;
  private readonly map = new Map<string, LruCacheEntry<T>>();
  private readonly flights = new Map<string, Promise<T>>();
  private generation = 0;
  private readonly maxInflight: number;

  constructor(maxEntries = 128, maxInflight = 16) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.maxInflight = Math.max(1, Math.floor(maxInflight));
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

  getEntry(key: string): LruCacheEntry<T> | null {
    const value = this.get(key);
    if (value === null) return null;
    const entry = this.map.get(key);
    return entry ? { ...entry } : null;
  }

  getFresh(key: string, maxAgeMs: number, now = Date.now()): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (now - entry.createdAt > Math.max(0, maxAgeMs)) {
      this.map.delete(key);
      return null;
    }
    return this.get(key);
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

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  async getOrCompute(key: string, compute: () => Promise<T> | T, createdAt = Date.now(), cacheValue: (value: T) => boolean = () => true): Promise<{ value: T; cacheHit: boolean }> {
    const cached = this.get(key);
    if (cached !== null) return { value: cached, cacheHit: true };
    const existing = this.flights.get(key);
    if (existing) return { value: await existing, cacheHit: false };
    if (this.flights.size >= this.maxInflight) throw new Error('cache_inflight_limit');
    const generation = this.generation;
    const flight = Promise.resolve().then(compute);
    this.flights.set(key, flight);
    try {
      const value = await flight;
      if (this.generation === generation && cacheValue(value)) this.set(key, value, createdAt);
      return { value, cacheHit: false };
    } finally {
      if (this.flights.get(key) === flight) this.flights.delete(key);
    }
  }

  clear(): void {
    this.generation += 1;
    this.map.clear();
    this.flights.clear();
  }
}
