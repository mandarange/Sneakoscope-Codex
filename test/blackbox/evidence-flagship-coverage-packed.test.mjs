import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed evidence flagship coverage gate passes', () => {
  runNpmScript('evidence:flagship-coverage');
});
