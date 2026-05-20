import test from 'node:test';
import assert from 'node:assert/strict';
import { codex0132Matrix } from '../../dist/core/codex-compat/codex-0-132.js';

test('Codex 0.132 matrix exposes P0 and P1 capabilities', () => {
  const matrix = codex0132Matrix({ version: '0.132.0', available: true, execResumeHelp: '--output-schema' });
  const ids = matrix.capabilities.map((capability) => capability.id);
  assert.equal(matrix.baseline, 'rust-v0.132.0');
  assert.ok(ids.includes('exec_resume_output_schema'));
  assert.ok(ids.includes('app_server_image_fidelity'));
  assert.ok(ids.includes('memory_summary_version_rebuild'));
  assert.ok(ids.includes('goal_continuation_blocker_stop'));
  assert.ok(ids.includes('tui_probe_batching'));
  assert.ok(ids.includes('python_sdk_turn_result'));
  assert.equal(matrix.ux_review_output_schema_preferred, true);
  assert.equal(matrix.hook_strict_subset_baseline, 'rust-v0.131.0');
});
