import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('packed PPT review wiring gate passes', () => {
  runNpmScript('ppt:real-imagegen-wiring');
});
