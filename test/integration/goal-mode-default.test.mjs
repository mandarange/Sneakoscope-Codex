import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeGoalRequest,
  NATIVE_GOAL_MAX_CHARS
} from '../../dist/core/goal-workflow.js';
import { COMMAND_MANIFEST_BY_NAME } from '../../dist/cli/command-manifest-lite.js';
import { COMMANDS } from '../../dist/cli/command-registry.js';

test('Goal create produces a detailed Codex-native objective without SKS state ownership', () => {
  const request = buildNativeGoalRequest('create', 'Ship version 6.7.0 without publishing it');
  assert.equal(request.native_only, true);
  assert.equal(request.sks_state_written, false);
  assert.equal(request.slash_command.startsWith('/goal Outcome:\n'), true);
  for (const heading of ['Outcome:', 'Scope:', 'Constraints:', 'Verification:', 'Done when:', 'Stop conditions:', 'Non-goals:']) {
    assert.match(request.objective, new RegExp(`^${heading.replace('-', '\\-')}`, 'm'));
  }
  assert.match(request.objective, /do not create SKS goal missions, bridge artifacts, compatibility loops, or fallback goal state/i);
  assert.equal(request.objective.length <= NATIVE_GOAL_MAX_CHARS, true);
});

test('Goal control actions map directly to Codex native controls', () => {
  assert.equal(buildNativeGoalRequest('pause').slash_command, '/goal pause');
  assert.equal(buildNativeGoalRequest('resume').slash_command, '/goal resume');
  assert.equal(buildNativeGoalRequest('clear').slash_command, '/goal clear');
  assert.equal(buildNativeGoalRequest('status').slash_command, '/goal');
});

test('Goal command metadata remains stateless and native-owned', () => {
  assert.equal(COMMANDS.goal.mutatesRouteState, undefined);
  assert.equal(COMMANDS.goal.ownsGates, undefined);
  assert.equal(COMMANDS.goal.ownedGateFiles, undefined);
  assert.equal(COMMAND_MANIFEST_BY_NAME.goal.mutatesRouteState, undefined);
  assert.equal(COMMAND_MANIFEST_BY_NAME.goal.summary, 'Print stateless Codex native Goal controls');
});
