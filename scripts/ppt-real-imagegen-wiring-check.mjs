#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('ppt:real-imagegen-wiring', 'src/core/ppt-review/slide-imagegen-review.ts', [
  'generateGptImage2CalloutReview',
  'PPT_SLIDE_IMAGEGEN_REQUEST_ARTIFACT',
  'PPT_SLIDE_IMAGEGEN_RESPONSE_ARTIFACT',
  'extraction_pending_count',
  'callout_extraction_status'
]);
requireContains('ppt:real-imagegen-wiring', 'src/core/ppt-review/index.ts', [
  'buildSlideImagegenRequestArtifact',
  'buildSlideImagegenResponseArtifact'
]);

emitGate('ppt:real-imagegen-wiring', { adapter: 'shared UX generateGptImage2CalloutReview' });
