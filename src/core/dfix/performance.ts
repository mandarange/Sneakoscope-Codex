import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';

export const DFIX_SPEED_BUDGETS_MS = {
  diagnose_cold_source_local: 500,
  path_decision: 100,
  deterministic_patch_plan: 300,
  dry_run_patch_handoff_without_codex: 500,
  exact_patch_apply_small_file: 1000,
  verification_selector: 300,
  no_codex_full_loop_fixture: 3000,
  codex_handoff_timeout: 60000
} as const;

export async function writeDfixPerformanceReport(dir: string, timings: Record<string, number> = {}) {
  const warnings = Object.entries(timings)
    .filter(([key, duration]) => key in DFIX_SPEED_BUDGETS_MS && duration > DFIX_SPEED_BUDGETS_MS[key as keyof typeof DFIX_SPEED_BUDGETS_MS])
    .map(([key, duration]) => `${key}:${duration}ms>${DFIX_SPEED_BUDGETS_MS[key as keyof typeof DFIX_SPEED_BUDGETS_MS]}ms`);
  const report = {
    schema: 'sks.dfix-performance-report.v1',
    created_at: nowIso(),
    budgets_ms: DFIX_SPEED_BUDGETS_MS,
    timings_ms: timings,
    warnings,
    ok: warnings.length === 0
  };
  await writeJsonAtomic(path.join(dir, 'dfix-performance-report.json'), report);
  return report;
}
