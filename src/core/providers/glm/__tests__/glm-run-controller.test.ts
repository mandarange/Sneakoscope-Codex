import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlmRunController } from '../glm-run-controller.js';

test('GLM run controller refuses transition after terminal state', () => {
  const controller = createGlmRunController({ runId: 'terminal-test', now: () => '2026-06-18T00:00:00.000Z' });
  controller.transition('request');
  const termination = controller.terminate('blocked', 'glm_loop_no_progress', ['no_progress']);
  assert.equal(termination.terminal, true);
  assert.equal(controller.state().terminal, true);
  controller.transition('request');
  assert.equal(controller.state().phase, 'blocked');
  assert.equal(controller.state().terminal_reason, 'glm_loop_no_progress');
});
