import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('removed public commands are unknown and never mutate an existing Naruto mission', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'removed-public-commands-unknown', setup: false });
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-current-naruto');
  const sentinel = path.join(missionDir, 'sentinel.txt');
  await fs.mkdir(missionDir, { recursive: true });
  await fs.writeFile(path.join(missionDir, 'mission.json'), `${JSON.stringify({ id: 'M-current-naruto', mode: 'NARUTO' })}\n`);
  await fs.writeFile(sentinel, 'preserve-current-mission\n');

  for (const command of ['team', 'mad-db', 'tmux', 'xai', 'swarm', 'agent']) {
    const before = await fs.readdir(missionDir);
    const result = await runSksInRoot(root, [command, 'status', '--json'], { expectCode: 1 });
    assert.equal(result.ok, false, command);
    assert.equal(result.status, 'blocked', command);
    assert.equal(result.command, command, command);
    assert.equal(result.reason, 'unknown_command', command);
    assert.equal(result.mission_id ?? null, null, command);
    assert.equal(result.replacement ?? null, null, command);
    assert.deepEqual(await fs.readdir(missionDir), before, command);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve-current-mission\n', command);
  }

  const beforeFlagProbe = await fs.readdir(missionDir);
  const flagProbe = await runSksInRoot(root, ['--agent', 'fixture', '--json'], { expectCode: 1 });
  assert.equal(flagProbe.ok, false);
  assert.equal(flagProbe.status, 'blocked');
  assert.equal(flagProbe.command, '--agent');
  assert.equal(flagProbe.reason, 'unknown_command');
  assert.equal(flagProbe.replacement ?? null, null);
  assert.deepEqual(await fs.readdir(missionDir), beforeFlagProbe);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve-current-mission\n');

  const removedNarutoFlag = await runSksInRoot(root, ['--naruto', '--json'], { expectCode: 1 });
  assert.equal(removedNarutoFlag.ok, false);
  assert.equal(removedNarutoFlag.status, 'blocked');
  assert.equal(removedNarutoFlag.command, '--naruto');
  assert.equal(removedNarutoFlag.reason, 'unknown_command');
  assert.equal(removedNarutoFlag.replacement ?? null, null);
  assert.deepEqual(await fs.readdir(missionDir), beforeFlagProbe);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve-current-mission\n');

  for (const retired of ['--naruto', '--agent', '--clones', '--mad-db', '--mad-native-swarm']) {
    const result = await runSksInRoot(root, ['--mad', '--glm', retired, '--status', '--json'], { expectCode: 1 });
    assert.equal(result.ok, false, retired);
    assert.equal(result.status, 'blocked', retired);
    assert.equal(result.schema, 'sks.glm-argument-error.v1', retired);
    assert.equal(result.reason, 'invalid_glm_arguments', retired);
    assert.deepEqual(result.argument_errors, [`unsupported_argument:${retired}`], retired);
    assert.notEqual(result.schema, 'sks.glm-mode-result.v1', retired);
    assert.deepEqual(await fs.readdir(missionDir), beforeFlagProbe, retired);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve-current-mission\n', retired);
  }

  const canonicalGlmNaruto = await runSksInRoot(root, ['--mad', '--glm', 'naruto', '--json'], { expectCode: 1 });
  assert.equal(canonicalGlmNaruto.schema, 'sks.glm-naruto-result.v1');
  assert.equal(canonicalGlmNaruto.termination_reason, 'no_task_provided');
  assert.deepEqual(await fs.readdir(missionDir), beforeFlagProbe);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve-current-mission\n');
});
