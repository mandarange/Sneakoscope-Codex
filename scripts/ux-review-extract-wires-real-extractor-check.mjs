#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('ux-review:extract-wires-real-extractor', 'src/core/commands/image-ux-review-command.ts', [
  'extractIssuesImageUxReview',
  'extractRealCallouts',
  'IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT'
]);
requireContains('ux-review:extract-wires-real-extractor', 'src/core/image-ux-review.ts', [
  'sks.image-ux-callout-extraction-report.v1',
  'bbox_validation_issues',
  'verified_cap'
]);

emitGate('ux-review:extract-wires-real-extractor', { artifact: 'image-ux-callout-extraction-report.json' });
