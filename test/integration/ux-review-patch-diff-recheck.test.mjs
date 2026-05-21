import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('ux-review patch diff recheck release gate passes', () => {
  runNpmScript('ux-review:patch-diff-recheck');
});
