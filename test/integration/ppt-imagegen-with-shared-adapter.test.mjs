import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('ppt imagegen wiring gate reuses the shared imagegen adapter', () => {
  runNpmScript('ppt:real-imagegen-wiring');
});
