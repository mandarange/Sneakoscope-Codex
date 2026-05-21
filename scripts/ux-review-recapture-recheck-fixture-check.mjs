#!/usr/bin/env node
import { assertGate, emitGate, readMissionJson, runUxFixture } from './sks-1-11-gate-lib.mjs';

const result = runUxFixture();
const recapture = readMissionJson(result.mission_id, 'image-ux-recapture-plan.json');
assertGate(recapture.changed_screens_rechecked_or_not_applicable === true, 'image UX recapture/recheck did not pass', recapture);
emitGate('ux-review:recapture-recheck-fixture', { mission_id: result.mission_id });
