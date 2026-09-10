import test from 'node:test';
import { runReleaseGate } from '../helpers/real-execution-closure.mjs';

test('ppt slide export adapter gate covers soffice command path', () => {
  runReleaseGate('ppt:real-export-adapter');
});
