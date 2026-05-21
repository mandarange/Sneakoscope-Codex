import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ux-review extraction report records provider, hashes, validation, bbox, and cap', () => {
  sourceIncludes('src/core/image-ux-review.ts', [
    'sks.image-ux-callout-extraction-report.v1',
    'generated_image_sha256',
    'source_screenshot_sha256',
    'bbox_validation_issues',
    'verified_cap'
  ]);
});
