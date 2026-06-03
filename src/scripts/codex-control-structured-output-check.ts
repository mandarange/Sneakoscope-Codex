#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const fixture = await runFakeCodexSdkTaskFixture('control-structured-output');
assertGate(fixture.result.ok === true, 'Codex Control Plane fake run must pass', fixture.result);
assertGate(fixture.result.structuredOutputValid === true, 'structured output must validate', fixture.result);
assertGate(fixture.proof.output_schema_id === 'sks.agent-worker-result.v1', 'control proof output schema mismatch', fixture.proof);
assertGate(fixture.proof.reliability_shield?.ok === true, 'reliability shield proof must pass', fixture.proof);
assertGate(fixture.proof.ultra_router?.selected_profile, 'ultra router proof missing from control proof', fixture.proof);
emitGate('codex-control:structured-output', { output_schema_id: fixture.proof.output_schema_id, profile: fixture.proof.ultra_router.selected_profile });
