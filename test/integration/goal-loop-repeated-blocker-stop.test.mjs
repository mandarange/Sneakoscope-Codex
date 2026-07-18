import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeGoalRequest } from '../../dist/core/goal-workflow.js';

test('Goal request defines bounded stop conditions instead of an SKS loop policy', () => {
  const request = buildNativeGoalRequest('create', 'Fix the release cache regression');
  assert.match(request.objective, /Stop conditions:/);
  assert.match(request.objective, /Do not continue merely to improve, generalize, or polish/i);
  assert.equal(Object.hasOwn(request, 'loop_plan'), false);
  assert.equal(Object.hasOwn(request, 'repeated_blocker_policy'), false);
  assert.equal(Object.hasOwn(request, 'mission_id'), false);
});

test('Goal edit keeps the detailed contract on the native edit surface', () => {
  const request = buildNativeGoalRequest('edit', 'Narrow the release to version 6.7.0 and do not publish');
  assert.equal(request.slash_command.startsWith('/goal edit Outcome:\n'), true);
  assert.equal(request.completion_contract.done_when, true);
  assert.equal(request.completion_contract.non_goals, true);
});
