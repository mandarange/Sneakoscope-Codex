import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { detectCodex0140Capability } from './codex-0140-capability.js';
import { CODEX_0140_FEATURE_KEYS, type Codex0140FeatureKey } from './codex-0140-feature-probes.js';

export interface Codex0140RealProbeReport {
  schema: 'sks.codex-0140-real-probes.v1';
  generated_at: string;
  ok: boolean;
  require_real: boolean;
  allow_network: boolean;
  probes: Array<{
    id: Codex0140FeatureKey;
    status: 'passed' | 'failed' | 'skipped';
    reason: string | null;
  }>;
  blockers: string[];
}

export async function runCodex0140RealProbes(input: { root: string; requireReal?: boolean; allowNetwork?: boolean; reportPath?: string | null }): Promise<Codex0140RealProbeReport> {
  const root = path.resolve(input.root);
  const requireReal = input.requireReal === true;
  const capability = await detectCodex0140Capability();
  const probes = CODEX_0140_FEATURE_KEYS.map((id) => {
    if (!capability.supports_0140) {
      return { id, status: requireReal ? 'failed' as const : 'skipped' as const, reason: 'codex_0_140_not_available' };
    }
    return capability.features[id] ? { id, status: 'passed' as const, reason: null } : { id, status: requireReal ? 'failed' as const : 'skipped' as const, reason: `${id}_not_verified` };
  });
  const blockers = probes.filter((probe) => probe.status === 'failed').map((probe) => `codex_0140_real_probe_failed:${probe.id}`);
  const report: Codex0140RealProbeReport = {
    schema: 'sks.codex-0140-real-probes.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    require_real: requireReal,
    allow_network: input.allowNetwork === true,
    probes,
    blockers
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', requireReal ? 'codex-0140-real-probes-require-real.json' : 'codex-0140-real-probes.json'), report).catch(() => undefined);
  return report;
}
