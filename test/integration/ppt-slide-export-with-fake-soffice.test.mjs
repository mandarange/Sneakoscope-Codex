import test from 'node:test';
import { runNpmScript } from '../helpers/real-execution-closure.mjs';

test('ppt slide export adapter gate covers soffice command path', () => {
  runNpmScript('ppt:real-export-adapter');
});
