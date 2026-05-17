import test from 'node:test';
import assert from 'node:assert/strict';
import { hooksCommand } from '../../src/cli/feature-commands.mjs';

test('hooks command module exposes async replay command', async () => {
  assert.equal(typeof hooksCommand, 'function');
});
