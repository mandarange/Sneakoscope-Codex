import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('ux-review run wiring gate passes with fake/static adapter coverage', () => {
  runNpmScript('ux-review:run-wires-imagegen');
});
