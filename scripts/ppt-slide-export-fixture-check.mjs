#!/usr/bin/env node
import { assertGate, emitGate, runPptReview } from './sks-1-11-gate-lib.mjs';

const result = runPptReview('slide-export');
assertGate(result.proof_evidence.slide_export_status === 'exported' && result.proof_evidence.exported_slide_images_count > 0, 'ppt slide export fixture missing exported images', result.proof_evidence);
emitGate('ppt:slide-export-fixture', { mission_id: result.mission_id });
