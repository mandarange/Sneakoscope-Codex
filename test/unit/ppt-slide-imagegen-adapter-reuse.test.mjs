import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide imagegen reuses the shared UX image adapter and records the model it used', () => {
  sourceIncludes('src/core/ppt-review/slide-imagegen-review.ts', ['generateImagegenCalloutReview', 'isRecordedImagegenModel', 'extraction_pending_count']);
});
