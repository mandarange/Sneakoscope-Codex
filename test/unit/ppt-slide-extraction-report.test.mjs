import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('ppt slide extraction report records generated image sha and validation', () => {
  sourceIncludes('src/core/ppt-review/slide-issue-extraction.ts', ['PPT_SLIDE_EXTRACTION_REPORT_ARTIFACT', 'sks.ppt-slide-extraction-report.v1', 'bbox_validation_issues']);
});
