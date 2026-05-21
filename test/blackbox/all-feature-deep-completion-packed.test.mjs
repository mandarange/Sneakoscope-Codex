import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed all-feature deep completion gate passes', () => {
  runNpmScript('all-features:deep-completion');
});
