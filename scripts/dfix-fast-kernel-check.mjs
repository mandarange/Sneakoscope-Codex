#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('dfix:fast-kernel', 'src/core/dfix.ts', [
  'DFIX_ERROR_SIGNATURE_ARTIFACT',
  'DFIX_PATH_DECISION_ARTIFACT',
  'DFIX_PATCH_RUNNER_RESULT_ARTIFACT',
  'DFIX_VERIFICATION_SELECTION_ARTIFACT',
  'dfix-performance-report.json'
]);
for (const file of [
  'src/core/dfix/error-signature.ts',
  'src/core/dfix/dfix-cache.ts',
  'src/core/dfix/path-decision.ts',
  'src/core/dfix/root-cause-ranking.ts',
  'src/core/dfix/patch-templates.ts',
  'src/core/dfix/patch-runner.ts',
  'src/core/dfix/codex-handoff.ts',
  'src/core/dfix/verification-selector.ts',
  'src/core/dfix/verification-runner.ts',
  'src/core/dfix/performance.ts'
]) {
  requireContains('dfix:fast-kernel', file, ['sks.dfix']);
}
emitGate('dfix:fast-kernel', { paths: ['L0', 'L1', 'L2', 'L3'], artifacts: 10 });
