import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide imagegen reuses the shared UX gpt-image-2 adapter', () => {
  sourceIncludes('src/core/ppt-review/slide-imagegen-review.ts', ['generateGptImage2CalloutReview', 'gpt-image-2', 'extraction_pending_count']);
});
