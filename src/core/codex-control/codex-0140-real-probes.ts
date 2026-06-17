import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { detectCodex0140Capability } from './codex-0140-capability.js';
import { CODEX_0140_FEATURE_KEYS, type Codex0140FeatureKey, type Codex0140ProbeCertainty, type Codex0140ProbeStatus } from './codex-0140-feature-probes.js';

export interface Codex0140RealProbeReport {
  schema: 'sks.codex-0140-real-probes.v1';
  generated_at: string;
  ok: boolean;
  require_real: boolean;
  allow_network: boolean;
  probes: Array<{
    id: Codex0140FeatureKey;
    status: Codex0140ProbeStatus;
    certainty: Codex0140ProbeCertainty | 'failed';
    reason: string | null;
    evidence: string[];
  }>;
  feature_results: Record<Codex0140FeatureKey, {
    status: Codex0140ProbeStatus;
    certainty: Codex0140ProbeCertainty | 'failed';
    supported: boolean;
    blockers: string[];
    evidence: string[];
  }>;
  actual_pass_count: number;
  discovered_count: number;
  skipped_count: number;
  blockers: string[];
}

export async function runCodex0140RealProbes(input: { root: string; requireReal?: boolean; allowNetwork?: boolean; reportPath?: string | null }): Promise<Codex0140RealProbeReport> {
  const root = path.resolve(input.root);
  const requireReal = input.requireReal === true;
  const previousProbeMode = process.env.SKS_CODEX_0140_PROBE;
  process.env.SKS_CODEX_0140_PROBE = '1';
  const capability = await detectCodex0140Capability();
  if (previousProbeMode === undefined) delete process.env.SKS_CODEX_0140_PROBE;
  else process.env.SKS_CODEX_0140_PROBE = previousProbeMode;
  const probes = CODEX_0140_FEATURE_KEYS.map((id) => {
    if (!capability.supports_0140) {
      return { id, status: requireReal ? 'failed' as const : 'skipped' as const, certainty: 'failed' as const, reason: 'codex_0_140_not_available', evidence: [] };
    }
    const detail = capability.feature_probe_details?.[id];
    const state = capability.feature_states[id];
    const status = detail?.status || (state.supported ? 'passed' : requireReal ? 'failed' : 'skipped');
    const certainty = (state.certainty === 'failed' ? 'failed' : detail?.certainty || state.certainty) as Codex0140ProbeCertainty | 'failed';
    return {
      id,
      status,
      certainty,
      reason: state.supported ? null : `${id}_not_verified`,
      evidence: state.evidence
    };
  });
  const featureResults = Object.fromEntries(CODEX_0140_FEATURE_KEYS.map((id) => {
    const state = capability.feature_states[id];
    const detail = capability.feature_probe_details?.[id];
    return [id, {
      status: detail?.status || (state.supported ? 'passed' : 'skipped'),
      certainty: state.certainty === 'failed' ? 'failed' : detail?.certainty || state.certainty,
      supported: state.supported,
      blockers: state.blockers,
      evidence: state.evidence
    }];
  })) as Codex0140RealProbeReport['feature_results'];
  const actualPassCount = Object.values(featureResults).filter((result) => result.status === 'passed' && result.certainty === 'actual').length;
  const discoveredCount = Object.values(featureResults).filter((result) => result.certainty === 'discovered').length;
  const skippedCount = probes.filter((probe) => probe.status === 'skipped').length;
  const coreActual = ['goal_attachment_preservation', 'mcp_reliability', 'non_tty_interrupt'] as Codex0140FeatureKey[];
  const blockers = [
    ...probes.filter((probe) => probe.status === 'failed').map((probe) => `codex_0140_real_probe_failed:${probe.id}`),
    ...(requireReal && !capability.supports_0140 ? ['codex_0_140_real_cli_required'] : []),
    ...(requireReal && featureResults.goal_attachment_preservation.certainty !== 'actual' ? ['codex_0140_goal_attachment_roundtrip_missing_actual'] : []),
    ...(requireReal && coreActual.filter((id) => featureResults[id].certainty === 'actual' && featureResults[id].status === 'passed').length < 3 ? ['codex_0140_core_real_probe_minimum_not_met'] : [])
  ];
  const report: Codex0140RealProbeReport = {
    schema: 'sks.codex-0140-real-probes.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    require_real: requireReal,
    allow_network: input.allowNetwork === true,
    probes,
    feature_results: featureResults,
    actual_pass_count: actualPassCount,
    discovered_count: discoveredCount,
    skipped_count: skippedCount,
    blockers
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', requireReal ? 'codex-0140-real-probes-require-real.json' : 'codex-0140-real-probes.json'), report).catch(() => undefined);
  return report;
}
