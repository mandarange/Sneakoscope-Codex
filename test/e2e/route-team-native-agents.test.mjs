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

test('Team route preserves compatibility artifacts and exposes Zellij cockpit lanes', async () => {
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

  const zellij = await runSksInRoot(root, ['team', 'open-zellij', json.mission_id, '--json', '--no-attach']);
  assert.equal(zellij.schema, 'sks.zellij-session.v1');
  assert.equal(zellij.kind, 'team');
  assert.equal(zellij.mission_id, json.mission_id);
  assert.equal(zellij.dry_run, true);
  assert.ok(Array.isArray(zellij.command));
  assert.ok(zellij.command.includes('zellij'));
  assert.deepEqual(zellij.launch_command.slice(0, 4), ['zellij', 'attach', '--create-background', zellij.session_name]);
  assert.ok(zellij.launch_command.includes('options'));
  assert.ok(zellij.launch_command.includes('--default-layout'));
  assert.equal(zellij.launch_command.includes('--layout'), false);
  assert.match(zellij.attach_command, /^zellij attach /);
  assert.match(zellij.layout_artifact, /\.kdl$/);
});
