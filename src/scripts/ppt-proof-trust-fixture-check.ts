#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readMissionJson, runPptReview, runSksJson } from './sks-1-11-gate-lib.js';

const result = runPptReview('proof');
const proof = readMissionJson(result.mission_id, 'completion-proof.json');
const trust = runSksJson(['trust', 'report', result.mission_id, '--json']);
assertGate(Boolean(proof.evidence?.ppt_review), 'ppt review evidence missing from completion proof', proof.evidence);
assertGate(JSON.stringify(trust).includes('ppt_review'), 'ppt review evidence missing from trust report', trust);
emitGate('ppt:proof-trust-fixture', { mission_id: result.mission_id, proof_status: proof.status });
