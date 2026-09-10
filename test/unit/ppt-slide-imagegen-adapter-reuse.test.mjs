import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide imagegen reuses the shared UX gpt-image-2.5-sunburst adapter', () => {
  sourceIncludes('src/core/ppt-review/slide-imagegen-review.ts', ['generateImagegenCalloutReview', 'IMAGEGEN_MODEL', 'extraction_pending_count']);
});
