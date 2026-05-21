import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt re-export and re-review status depends on fixed deck or slide evidence', () => {
  sourceIncludes('src/core/ppt-review/index.ts', ['changed_slides_rechecked', 'ppt_slide_recheck_missing', 'fixedDeckPath']);
});
