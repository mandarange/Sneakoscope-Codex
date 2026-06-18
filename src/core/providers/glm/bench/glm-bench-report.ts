import type { GlmBenchmarkResult, GlmBenchmarkCaseResult } from './glm-benchmark-types.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { writeTextAtomic, nowIso } from '../../../fsx.js';
import path from 'node:path';

export async function writeGlmBenchReport(
  benchDir: string,
  result: GlmBenchmarkResult
): Promise<string> {
  const reportPath = path.join(benchDir, 'bench-report.md');
  const lines: string[] = [];

  lines.push('# GLM Benchmark Report — True Direct vs Naruto', '');
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Model: ${GLM_52_OPENROUTER_MODEL}`);
  lines.push(`GPT fallback allowed: false`);
  lines.push(`Status: ${result.status}`);
  lines.push('');

  if (result.fixture) {
    lines.push('## Fixture', '');
    lines.push(`- Task: ${result.fixture.task}`);
    lines.push(`- Target: ${result.fixture.target_file}`);
    lines.push(`- Temp repo: ${result.fixture.fixture_dir}`);
    lines.push('');
  }

  lines.push('## Cases', '');
  lines.push('| Case | Kind | Workers | Wall ms | TTFT p50 | Total p50 | Candidates | Gate pass | Verifier | Merge | Patch gen | Patch gate | Metric |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const c of result.cases) {
    lines.push(formatCaseRow(c));
  }
  lines.push('');

  const direct = result.cases.find((c) => c.implementation_path === 'direct-glm');
  const narutoBest = result.cases
    .filter((c) => c.implementation_path === 'glm-naruto')
    .sort((a, b) => a.wall_clock_ms - b.wall_clock_ms)[0];

  lines.push('## Comparison', '');
  if (direct) {
    lines.push(`- Direct GLM: ${direct.wall_clock_ms}ms`);
  }
  if (narutoBest) {
    lines.push(`- Best Naruto: ${narutoBest.name} at ${narutoBest.wall_clock_ms}ms`);
  }
  lines.push(`- Recommendation: ${result.comparison.recommendation}`);
  lines.push(`- Reason: ${result.comparison.reason}`);
  lines.push('');

  lines.push('## Limitations', '');
  lines.push('- This benchmark uses a tiny single-file task; tiny tasks may favor direct GLM.');
  lines.push('- Multi-file parallelizable tasks may favor GLM Naruto.');
  lines.push('- Missing usage metrics are reported as `unavailable` or `n/a`, never as fake zero.');
  lines.push('- Direct GLM candidate/verifier/merge metrics are `not_applicable`.');
  lines.push('');

  if (result.model_lock_proof) {
    lines.push('## Model Lock Proof', '');
    lines.push(`- Passed: ${result.model_lock_proof.passed}`);
    lines.push(`- Mismatches: ${result.model_lock_proof.mismatches.length}`);
    lines.push('');
  }

  if (result.no_mutation_proof) {
    lines.push('## No Mutation Proof', '');
    lines.push(`- Passed: ${result.no_mutation_proof.passed}`);
    lines.push(`- User CWD unchanged: ${result.no_mutation_proof.user_cwd_unchanged}`);
    lines.push('');
  }

  lines.push(`_Report generated at ${nowIso()}_`, '');

  await writeTextAtomic(reportPath, lines.join('\n'));
  return reportPath;
}

function formatCaseRow(c: GlmBenchmarkCaseResult): string {
  const ttft = c.p50_ttft_ms !== null ? String(c.p50_ttft_ms) : 'unavailable';
  const total = c.p50_total_ms !== null ? String(c.p50_total_ms) : 'unavailable';
  const candidates = c.candidate_count !== null ? String(c.candidate_count) : 'n/a';
  const gate = c.gate_pass_rate !== null ? c.gate_pass_rate.toFixed(2) : 'n/a';
  const verifier = c.verifier_pass_rate !== null ? c.verifier_pass_rate.toFixed(2) : 'n/a';
  const merge = c.merge_success !== null ? String(c.merge_success) : 'n/a';
  const patchGen = c.patch_generated !== null ? String(c.patch_generated) : 'n/a';
  const patchGate = c.patch_gate_passed !== null ? String(c.patch_gate_passed) : 'n/a';
  const metricLatency = c.metric_status.latency;
  return `| ${c.name} | ${c.kind} | ${c.workers} | ${c.wall_clock_ms} | ${ttft} | ${total} | ${candidates} | ${gate} | ${verifier} | ${merge} | ${patchGen} | ${patchGate} | ${metricLatency} |`;
}
