#!/usr/bin/env node
import { assertGate, emitGate, readMissionJson, runUxFixture } from './sks-1-11-gate-lib.mjs';

const result = runUxFixture();
const issues = readMissionJson(result.mission_id, 'image-ux-issue-ledger.json');
assertGate(issues.schema === 'sks.image-ux-issue-ledger.v3' && Array.isArray(issues.issues), 'image UX issue extraction ledger invalid', issues);
emitGate('ux-review:extract-real-callouts-fixture', { mission_id: result.mission_id, issues: issues.issues.length });
