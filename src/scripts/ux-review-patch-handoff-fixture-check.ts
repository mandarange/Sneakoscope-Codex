#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readMissionJson, runUxFixture } from './sks-1-11-gate-lib.js';

const result = runUxFixture();
const plan = readMissionJson(result.mission_id, 'image-ux-fix-task-plan.json');
assertGate(/^sks\.image-ux-fix-task-plan\.v[12]$/.test(plan.schema) && Array.isArray(plan.tasks), 'image UX patch handoff plan invalid', plan);
emitGate('ux-review:patch-handoff-fixture', { mission_id: result.mission_id, tasks: plan.tasks.length });
