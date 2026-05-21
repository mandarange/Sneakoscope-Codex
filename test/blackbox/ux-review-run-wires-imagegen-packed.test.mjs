import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed UX-Review run imagegen wiring gate passes', () => {
  runNpmScript('ux-review:run-wires-imagegen');
});
