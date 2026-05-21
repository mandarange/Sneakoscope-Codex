import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('ux-review extract-issues wiring gate reaches real extractor contract', () => {
  runNpmScript('ux-review:extract-wires-real-extractor');
});
