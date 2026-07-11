import test from 'node:test';
import { runReleaseGate } from '../helpers/real-execution-closure.mjs';

test('all-feature deep completion gate passes', () => {
  runReleaseGate('all-features:deep-completion');
});
