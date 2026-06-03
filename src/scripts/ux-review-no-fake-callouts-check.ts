#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readMissionJson, runUxFixture } from './sks-1-11-gate-lib.js';

const result = runUxFixture();
const proof = readMissionJson(result.mission_id, 'completion-proof.json');
assertGate(proof.status !== 'verified' && JSON.stringify(proof).includes('mock'), 'mock image UX callouts were allowed to claim full real verification', { status: proof.status });
emitGate('ux-review:no-fake-callouts', { mission_id: result.mission_id, status: proof.status });
