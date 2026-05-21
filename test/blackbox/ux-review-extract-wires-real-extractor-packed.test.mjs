import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed UX-Review extract real extractor gate passes', () => {
  runNpmScript('ux-review:extract-wires-real-extractor');
});
