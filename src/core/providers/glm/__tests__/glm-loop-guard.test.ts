import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlmRunController } from '../glm-run-controller.js';
import { recordGlmLoopIteration } from '../glm-loop-guard.js';
import { GLM_SPEED_LIMITS } from '../glm-run-timeout.js';

test('GLM loop guard blocks repeated output', () => {
  const controller = createGlmRunController({ runId: 'repeat-test', now: () => '2026-06-18T00:00:00.000Z' });
  controller.transition('request');
  const first = recordGlmLoopIteration({
    state: controller.state(),
    limits: GLM_SPEED_LIMITS,
    output: '<sks_blocked>same</sks_blocked>',
    madeProgress: false,
    nowIso: '2026-06-18T00:00:01.000Z'
  });
  assert.equal(first.ok, true);
  const second = recordGlmLoopIteration({
    state: first.state,
    limits: GLM_SPEED_LIMITS,
    output: '<sks_blocked>same</sks_blocked>',
    madeProgress: false,
    nowIso: '2026-06-18T00:00:02.000Z'
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'glm_loop_repeated_output');
});

test('GLM loop guard blocks no-progress after configured limit', () => {
  const controller = createGlmRunController({ runId: 'no-progress-test', now: () => '2026-06-18T00:00:00.000Z' });
  controller.transition('request');
  const first = recordGlmLoopIteration({
    state: controller.state(),
    limits: GLM_SPEED_LIMITS,
    output: '<sks_blocked>a</sks_blocked>',
    madeProgress: false,
    nowIso: '2026-06-18T00:00:01.000Z'
  });
  const second = recordGlmLoopIteration({
    state: first.state,
    limits: GLM_SPEED_LIMITS,
    output: '<sks_blocked>b</sks_blocked>',
    madeProgress: false,
    nowIso: '2026-06-18T00:00:02.000Z'
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'glm_loop_no_progress');
});
