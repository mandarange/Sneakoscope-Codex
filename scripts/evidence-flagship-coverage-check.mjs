#!/usr/bin/env node
import { emitGate, requireContains } from './sks-1-12-real-execution-check-lib.mjs';

requireContains('evidence:flagship-coverage', 'src/core/commands/image-ux-review-command.ts', [
  'visualEvidence: { image_ux_review',
  'IMAGE_UX_REVIEW_CALLOUT_EXTRACTION_REPORT_ARTIFACT'
]);
requireContains('evidence:flagship-coverage', 'src/core/commands/ppt-command.ts', [
  'visualEvidence: { ppt_review',
  'PPT_REVIEW_ARTIFACT_PATHS'
]);
requireContains('evidence:flagship-coverage', 'src/core/dfix.ts', [
  'visualEvidence: { dfix',
  'DFIX_VERIFICATION_SUGGESTION_ARTIFACT'
]);
requireContains('evidence:flagship-coverage', 'scripts/release-readiness-report.mjs', [
  'all_features_completion',
  'image_ux_review',
  'ppt_imagegen_review',
  'dfix'
]);

emitGate('evidence:flagship-coverage', { flagship_routes: ['UX-Review', 'PPT Imagegen Review', 'DFix', 'All-feature completion'] });
