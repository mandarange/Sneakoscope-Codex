import { nowIso, writeJsonAtomic } from '../../fsx.js';
import path from 'node:path';

export interface ProviderHealthRecord {
  readonly schema: 'sks.openrouter-provider-health.v1';
  readonly provider_slug: string;
  readonly model: string;
  readonly p50_ttft_ms: number;
  readonly p90_ttft_ms: number;
  readonly p50_throughput: number;
  readonly p90_throughput: number;
  readonly count_429: number;
  readonly count_5xx: number;
  readonly last_success: string | null;
  readonly last_failure: string | null;
  readonly updated_at: string;
}

export interface ProviderHealthTracker {
  readonly record: (entry: Partial<ProviderHealthRecord> & { provider_slug: string; model: string }) => void;
  readonly getHealth: () => ProviderHealthRecord | null;
  readonly snapshot: () => ProviderHealthRecord | null;
}

export function createProviderHealthTracker(providerSlug = 'openrouter', model = 'z-ai/glm-5.2'): ProviderHealthTracker {
  let health: ProviderHealthRecord = {
    schema: 'sks.openrouter-provider-health.v1',
    provider_slug: providerSlug,
    model,
    p50_ttft_ms: 0,
    p90_ttft_ms: 0,
    p50_throughput: 0,
    p90_throughput: 0,
    count_429: 0,
    count_5xx: 0,
    last_success: null,
    last_failure: null,
    updated_at: nowIso()
  };

  const ttftSamples: number[] = [];

  return {
    record: (entry) => {
      if (typeof entry.p50_ttft_ms === 'number') ttftSamples.push(entry.p50_ttft_ms);
      const sorted = [...ttftSamples].sort((a, b) => a - b);
      const p50 = sorted.length > 0 ? (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))] ?? 0) : 0;
      const p90 = sorted.length > 0 ? (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0) : 0;
      health = {
        ...health,
        ...entry,
        p50_ttft_ms: p50,
        p90_ttft_ms: p90,
        count_429: health.count_429 + (entry.count_429 || 0),
        count_5xx: health.count_5xx + (entry.count_5xx || 0),
        last_success: entry.last_success || health.last_success,
        last_failure: entry.last_failure || health.last_failure,
        updated_at: nowIso()
      };
    },
    getHealth: () => health,
    snapshot: () => health
  };
}

export async function writeProviderHealth(root: string, health: ProviderHealthRecord): Promise<string> {
  const out = path.join(root, '.sneakoscope', 'openrouter', 'provider-health.json');
  await writeJsonAtomic(out, health);
  return out;
}
