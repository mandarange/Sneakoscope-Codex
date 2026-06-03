#!/usr/bin/env node
// @ts-nocheck
import { DFIX_SPEED_BUDGETS_MS } from '../core/dfix/performance.js';

const ok = DFIX_SPEED_BUDGETS_MS.diagnose_cold_source_local <= 500
  && DFIX_SPEED_BUDGETS_MS.path_decision <= 100
  && DFIX_SPEED_BUDGETS_MS.deterministic_patch_plan <= 300
  && DFIX_SPEED_BUDGETS_MS.dry_run_patch_handoff_without_codex <= 500
  && DFIX_SPEED_BUDGETS_MS.exact_patch_apply_small_file <= 1000
  && DFIX_SPEED_BUDGETS_MS.verification_selector <= 300
  && DFIX_SPEED_BUDGETS_MS.no_codex_full_loop_fixture <= 3000
  && DFIX_SPEED_BUDGETS_MS.codex_handoff_timeout <= 60000;
console.log(JSON.stringify({ schema: 'sks.dfix-performance-check.v1', ok, budgets_ms: DFIX_SPEED_BUDGETS_MS }, null, 2));
if (!ok) process.exitCode = 1;
