import { type Codex0140RealProbeReport } from './codex-0140-real-probes.js';

export function summarizeCodex0140RealProbes(report: Codex0140RealProbeReport) {
  return {
    schema: 'sks.codex-0140-real-probe-summary.v1',
    ok: report.ok,
    passed: report.probes.filter((probe) => probe.status === 'passed').length,
    skipped: report.probes.filter((probe) => probe.status === 'skipped').length,
    failed: report.probes.filter((probe) => probe.status === 'failed').length,
    blockers: report.blockers
  };
}
