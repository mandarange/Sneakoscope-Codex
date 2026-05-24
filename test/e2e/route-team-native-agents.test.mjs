import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertAgentProof, assertCompletionProof, createHermeticProjectRoot, runSks, runSksInRoot } from './route-real-command-helper.mjs';

test('Team route fixture includes native agent proof evidence', async () => {
  const json = await runSks(['team', 'fixture', '--mock', '--json']);
  await assertCompletionProof(json.mission_id, '$Team');
  await assertAgentProof(json.mission_id, { route: '$Team' });
});

test('Team route exposes native agent backend only', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'team-native-agent-only' });
  const json = await runSksInRoot(root, ['team', 'fixture', '--mock', '--json']);
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'missions', json.mission_id, 'agents', 'agent-proof-evidence.json'), 'utf8'));
  assert.equal(proof.backend, 'fake');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.ok, true);
});

test('Team route preserves compatibility artifacts and exposes tmux cockpit lanes', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'team-compat-artifacts' });
  const json = await runSksInRoot(root, ['team', 'fixture', '--mock', '--json']);
  const missionDir = path.join(root, '.sneakoscope', 'missions', json.mission_id);
  const plan = JSON.parse(await fs.readFile(path.join(missionDir, 'team-plan.json'), 'utf8'));

  for (const name of [
    'team-plan.json',
    'team-workflow.md',
    'team-roster.json',
    'team-runtime-tasks.json',
    'team-analysis.md',
    'team-gate.json',
    'team-live.md',
    'team-transcript.jsonl',
    'team-dashboard.json',
    'team-session-cleanup.json',
    'completion-proof.json'
  ]) {
    await fs.access(path.join(missionDir, name));
  }
  assert.ok(plan.required_artifacts.includes('team-analysis.md'));
  assert.ok(plan.required_artifacts.includes('team-live.md'));
  assert.ok(plan.required_artifacts.includes('team-transcript.jsonl'));
  assert.ok(plan.required_artifacts.includes('team-dashboard.json'));

  const tmux = await runSksInRoot(root, ['team', 'open-tmux', json.mission_id, '--json', '--no-attach']);
  assert.equal(tmux.split_ui.mode, 'single_window_split_panes');
  assert.equal(tmux.overview.agent, 'mission_overview');
  assert.ok(tmux.lanes.some((lane) => lane.agent === 'mission_overview'));
  assert.ok(tmux.lanes.some((lane) => /^native_agent_/.test(lane.agent)));
  assert.match(tmux.cleanup_policy, /main Codex pane remains user controlled/);
});
