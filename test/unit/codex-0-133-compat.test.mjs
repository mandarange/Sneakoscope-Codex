import test from 'node:test';
import assert from 'node:assert/strict';
import { codex0133Matrix } from '../../dist/core/codex-compat/codex-0-133.js';

test('Codex 0.133 matrix exposes P0 and P1 capabilities', () => {
  const matrix = codex0133Matrix({ version: '0.133.0', available: true, execResumeHelp: '--output-schema' });
  const ids = matrix.capabilities.map((capability) => capability.id);
  assert.equal(matrix.baseline, 'rust-v0.133.0');
  assert.ok(ids.includes('exec_resume_output_schema'));
  assert.ok(ids.includes('app_server_image_fidelity'));
  assert.ok(ids.includes('memory_summary_version_rebuild'));
  assert.ok(ids.includes('goal_continuation_blocker_stop'));
  assert.ok(ids.includes('tui_probe_batching'));
  assert.ok(ids.includes('goals_default_enabled'));
  assert.ok(ids.includes('remote_control_foreground_app_server'));
  assert.ok(ids.includes('permission_profiles_requirements'));
  assert.ok(ids.includes('plugin_discovery_marketplaces'));
  assert.ok(ids.includes('extension_lifecycle_events'));
  assert.ok(ids.includes('python_sdk_turn_result'));
  assert.equal(matrix.goals_enabled_by_default, true);
  assert.equal(matrix.remote_control_foreground_preferred, true);
  assert.equal(matrix.permission_profiles_requirements_preferred, true);
  assert.equal(matrix.ux_review_output_schema_preferred, true);
  assert.equal(matrix.hook_strict_subset_baseline, 'latest');
});
