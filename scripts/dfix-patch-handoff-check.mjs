#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('dfix:patch-handoff', 'src/core/dfix.ts', [
  'codex_patch_handoff',
  'buildDfixCodexPatchPrompt',
  'git_diff_before',
  'git_diff_after',
  'rollback_plan',
  'explicit_apply_opt_in'
]);

emitGate('dfix:patch-handoff', { patch_mode: 'exact-find-replace-or-codex-handoff', diff_capture: true });
