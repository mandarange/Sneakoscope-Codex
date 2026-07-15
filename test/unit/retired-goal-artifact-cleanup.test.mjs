import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcileRetiredManagedResidue } from '../../dist/core/doctor/retired-managed-residue.js';

test('doctor migration cleanup removes retired Goal metadata without deleting the current mission', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retired-goal-artifact-'));
  const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current-goal');
  try {
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), `${JSON.stringify({
      id: 'M-current-goal',
      mode: 'Goal',
      prompt: 'preserve goal mission',
      phase: 'intake'
    }, null, 2)}\n`);
    await fs.writeFile(path.join(missionRoot, 'goal-workflow.json'), `${JSON.stringify({
      schema_version: 1,
      mission_id: 'M-current-goal',
      route: 'Goal',
      native_goal: { workflow_kind: 'native /goal persistence bridge' },
      pipeline_contract: { overlay_only: true, ralph_removed: true }
    }, null, 2)}\n`);
    await fs.writeFile(path.join(missionRoot, 'goal-bridge.md'), [
      '# SKS Goal Persistence Bridge',
      '',
      '## Native Codex Goal Control',
      '',
      '## SKS Bridge Contract',
      '',
      '- Ralph route is removed from the user-facing SKS surface.',
      '- This file is a fast SKS overlay.',
      ''
    ].join('\n'));

    const first = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.detected_managed_artifact_count, 2);
    assert.equal(first.removed_managed_artifact_count, 2);
    assert.equal(first.rewritten_state_file_count, 2);
    assert.equal(first.remaining_managed_artifact_count, 0);
    assert.equal((await fs.stat(path.join(missionRoot, 'mission.json'))).isFile(), true);

    const workflow = JSON.parse(await fs.readFile(path.join(missionRoot, 'goal-workflow.json'), 'utf8'));
    const bridge = await fs.readFile(path.join(missionRoot, 'goal-bridge.md'), 'utf8');
    assert.equal(Object.hasOwn(workflow.pipeline_contract, 'ralph_removed'), false);
    assert.doesNotMatch(bridge, /ralph/i);

    const second = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.detected_managed_artifact_count, 0);
    assert.equal(second.removed_managed_artifact_count, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
