import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ux-review run wires generate-callouts and fix to imagegen/extraction', () => {
  sourceIncludes('src/core/commands/image-ux-review-command.ts', [
    'shouldGenerateCallouts',
    'generateGptImage2CalloutReview',
    'extractRealCallouts',
    'buildImageUxCalloutExtractionReport'
  ]);
});
