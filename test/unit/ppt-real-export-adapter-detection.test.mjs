import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide export detects real export adapters', () => {
  sourceIncludes('src/core/ppt-review/slide-exporter.ts', ['soffice', 'libreoffice', 'powerpoint_osascript']);
});
