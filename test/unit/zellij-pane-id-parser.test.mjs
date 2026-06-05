import test from 'node:test';
import assert from 'node:assert/strict';

import { extractZellijPaneIdFromOutput } from '../../dist/core/zellij/zellij-lane-runtime.js';

test('extractZellijPaneIdFromOutput accepts Zellij terminal resource ids', () => {
  assert.equal(extractZellijPaneIdFromOutput('terminal_1\n'), 'terminal_1');
  assert.equal(extractZellijPaneIdFromOutput('pane_id=terminal_42'), 'terminal_42');
});

test('extractZellijPaneIdFromOutput preserves numeric and JSON pane ids', () => {
  assert.equal(extractZellijPaneIdFromOutput('7\n'), '7');
  assert.equal(extractZellijPaneIdFromOutput('{"pane_id":"terminal_9"}'), 'terminal_9');
});

test('extractZellijPaneIdFromOutput rejects unrelated text', () => {
  assert.equal(extractZellijPaneIdFromOutput('terminal_worker\n'), null);
});
