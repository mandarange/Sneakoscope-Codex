import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed PPT re-export/re-review gate passes', () => {
  runNpmScript('ppt:reexport-rereview');
});
