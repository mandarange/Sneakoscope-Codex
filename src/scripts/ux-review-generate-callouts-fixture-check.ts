#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readMissionJson, runUxFixture } from './sks-1-11-gate-lib.js';

const result = runUxFixture();
const ledger = readMissionJson(result.mission_id, 'image-ux-generated-review-ledger.json');
assertGate(
  ledger.status === 'generated'
    || (ledger.generated_images || ledger.review_images || ledger.generated_review_images || []).length > 0,
  'generated image UX callout ledger missing generated evidence',
  ledger
);
emitGate('ux-review:generate-callouts-fixture', { mission_id: result.mission_id });
