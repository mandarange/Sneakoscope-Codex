#!/usr/bin/env node
// @ts-nocheck
import { buildNativeGoalRequest } from '../core/goal-workflow.js';
import { assertGate, emitGate } from './gate-lib.js';

// goal:artifact-compat — `sks goal` is a stateless helper that renders a native Codex /goal
// command; it must not write SKS goal state or the retired goal-compat.json artifact.
const request = buildNativeGoalRequest('create', 'fix release cache');
assertGate(request.native_only === true && request.slash_command.startsWith('/goal Outcome:'), 'goal maps to a detailed native Codex command', request);
assertGate(request.sks_state_written === false, 'goal helper writes no SKS goal state or compat artifact', request);
emitGate('goal:artifact-compat', { native_only: true, sks_state_written: false });
