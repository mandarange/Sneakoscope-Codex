#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, hasRelationType, runPptReview } from './sks-1-11-gate-lib.js';

const result = runPptReview('review');
for (const type of ['slide_callout_review_of', 'slide_issue_detected_in', 'deck_patch_attempt_for_issue', 'fixed_slide_after', 'slide_re_review_of_after', 'slide_issue_resolved_by_recheck']) {
  assertGate(hasRelationType(result.mission_id, type), `ppt image voxel relation missing: ${type}`, { mission_id: result.mission_id });
}
emitGate('ppt:image-voxel-relations', { mission_id: result.mission_id });
