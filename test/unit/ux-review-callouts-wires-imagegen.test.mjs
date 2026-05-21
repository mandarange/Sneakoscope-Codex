import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ux-review callouts delegates to run with generate-callouts', () => {
  sourceIncludes('src/core/commands/image-ux-review-command.ts', [
    'calloutsImageUxReview',
    '--generate-callouts',
    'generateGptImage2CalloutReview'
  ]);
});
