import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed DFix patch handoff gate passes', () => {
  runNpmScript('dfix:patch-handoff');
});
