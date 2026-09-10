import test from 'node:test';
import { runReleaseGate } from '../helpers/real-execution-closure.mjs';

test('ppt re-export/re-review gate passes', () => {
  runReleaseGate('ppt:reexport-rereview');
});
