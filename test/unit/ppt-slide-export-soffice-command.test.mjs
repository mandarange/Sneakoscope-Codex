import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide export uses soffice conversion command when available', () => {
  sourceIncludes('src/core/ppt-review/slide-exporter.ts', ['--headless', '--convert-to', 'png', '--outdir']);
});
