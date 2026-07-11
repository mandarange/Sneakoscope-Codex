#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readMissionJson, runPptReview } from './sks-1-11-gate-lib.js';

const result = runPptReview('review');
const proof = readMissionJson(result.mission_id, 'completion-proof.json');
assertGate(
  proof.status === 'mock_only'
    && result.proof_evidence.status === 'blocked'
    && (result.proof_evidence.blockers || []).some((blocker) => String(blocker).includes('mock_fixture')),
  'ppt mock fixture was allowed to claim fully real evidence',
  { proof_status: proof.status, evidence_status: result.proof_evidence.status, blockers: result.proof_evidence.blockers || [] }
);
emitGate('ppt:no-mock-as-real', { mission_id: result.mission_id, proof_status: proof.status });
