import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeGoalWorkflow } from '../../dist/core/goal-workflow.js';

test('Goal workflow writes official/fallback goal mode artifact', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-goal-mode-'));
  const workflow = await writeGoalWorkflow(dir, { id: 'M-goal', prompt: 'persist' }, { detectOfficialGoalMode: false });
  assert.equal(workflow.goal_mode.artifact, 'goal-mode-applied.json');
  assert.equal(Object.hasOwn(workflow.pipeline_contract, 'ralph_removed'), false);
  const artifact = JSON.parse(await fs.readFile(path.join(dir, 'goal-mode-applied.json'), 'utf8'));
  assert.equal(artifact.mode, 'sks_goal_fallback');
  const bridge = await fs.readFile(path.join(dir, 'goal-bridge.md'), 'utf8');
  assert.doesNotMatch(JSON.stringify(workflow), /ralph/i);
  assert.doesNotMatch(bridge, /ralph/i);
});
