#!/usr/bin/env node
import { emitGate, runPptReview } from './sks-1-11-gate-lib.mjs';

const result = runPptReview('review');
emitGate('ppt:imagegen-review-fixture', { mission_id: result.mission_id, relations: result.proof_evidence.image_voxel_relation_count });
