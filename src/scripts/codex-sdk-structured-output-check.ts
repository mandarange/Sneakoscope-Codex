#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const fixture = await runFakeCodexSdkTaskFixture('structured-output');
assertGate(fixture.result.ok === true, 'Codex SDK fake run must pass', fixture.result);
assertGate(fixture.result.structuredOutputValid === true, 'structured output must validate', fixture.result);
assertGate(fixture.worker.backend === 'codex-sdk', 'worker backend must be codex-sdk', fixture.worker);
assertGate(fixture.worker.verification?.checks?.includes('sks.agent-worker-result.v1'), 'worker verification must reference output schema', fixture.worker);
emitGate('codex-sdk:structured-output', { output_schema_id: fixture.proof.output_schema_id, structured_output_valid: fixture.result.structuredOutputValid });
