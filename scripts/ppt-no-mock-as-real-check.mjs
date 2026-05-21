#!/usr/bin/env node
import { assertGate, emitGate, readMissionJson, runPptReview } from './sks-1-11-gate-lib.mjs';

const result = runPptReview('review');
const proof = readMissionJson(result.mission_id, 'completion-proof.json');
assertGate(proof.status !== 'verified' && result.proof_evidence.status === 'verified_partial', 'ppt mock fixture was allowed to claim fully real evidence', { proof_status: proof.status, evidence_status: result.proof_evidence.status });
emitGate('ppt:no-mock-as-real', { mission_id: result.mission_id, proof_status: proof.status });
