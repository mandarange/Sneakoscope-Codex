import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('dfix patch handoff gate covers diff capture', () => {
  runNpmScript('dfix:patch-handoff');
});
