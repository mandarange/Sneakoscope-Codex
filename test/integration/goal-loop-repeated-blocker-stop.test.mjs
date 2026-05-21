import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectRepeatedBlocker } from '../../dist/core/loop-blocker.js';
import { writeGoalWorkflow } from '../../dist/core/goal-workflow.js';
import { tempImageRoot } from '../helpers/ux-review-1-0-8-fixtures.mjs';

test('Goal loop repeated blocker policy aligns with Codex 0.133 stop behavior', () => {
  const report = detectRepeatedBlocker([{ reason: 'usage_limit' }, { reason: 'usage_limit' }], 2);
  assert.equal(report.stop_required, true);
});

test('Goal workflow artifact records repeated blocker stop policy', async () => {
  const { root } = await tempImageRoot('sks-goal-loop-');
  const dir = path.join(root, '.sneakoscope/missions/M-goal');
  await fs.mkdir(dir, { recursive: true });
  const workflow = await writeGoalWorkflow(dir, { id: 'M-goal', prompt: 'fixture goal' });
  assert.equal(workflow.repeated_blocker_policy.aligned_with_codex_0_133, true);
  assert.equal(workflow.repeated_blocker_policy.aligned_with_codex_0_132, true);
  assert.equal(workflow.repeated_blocker_policy.stop_after_same_blocker_count, 2);
});
