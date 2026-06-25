#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, readText } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-reliability-shield.js');
let attempts = 0;
const seenAttempts = [];
const result = await mod.runWithCodexReliabilityShield(baseTask(), async (attempt) => {
  attempts += 1;
  seenAttempts.push(attempt);
  return {
    ok: false,
    sdkThreadId: '',
    sdkRunId: null,
    events: [{ type: 'turn.failed', message: 'Selected model is at capacity. Please try a different model.' }],
    finalResponse: '',
    structuredOutput: null,
    blockers: ['Selected model is at capacity. Please try a different model.']
  };
});

assertGate(attempts === 1, 'model capacity must not retry with downgraded pressure', { attempts, seenAttempts, result });
assertGate(result.reliabilityShield.ok === false, 'terminal model capacity must remain visible as a blocker', result.reliabilityShield);
assertGate(result.reliabilityShield.retry_count === 0, 'capacity retry count must stay zero', result.reliabilityShield);
assertGate(result.reliabilityShield.model_capacity_retry_count === 0, 'model capacity retry must not be counted', result.reliabilityShield);
assertGate(result.reliabilityShield.selected_model_capacity_fallback === false, 'capacity fallback flag must not be selected', result.reliabilityShield);
assertGate(result.reliabilityShield.attempts[0].retryable === false, 'capacity attempt must be terminal', result.reliabilityShield.attempts[0]);
assertGate(result.reliabilityShield.attempts[0].retry_reason === null, 'capacity retry reason must stay null', result.reliabilityShield.attempts[0]);
assertGate(result.reliabilityShield.attempts[0].blockers.includes('codex_model_capacity_unavailable'), 'capacity blocker must be explicit', result.reliabilityShield.attempts[0]);
assertGate(mod.isCodexModelCapacityError({ blockers: ['Selected model is at capacity. Please try a different model.'] }, []) === true, 'capacity classifier must recognize common Codex error text');
const runnerSource = readText('src/core/codex-control/codex-task-runner.ts');
assertGate(!runnerSource.includes("capacity_fallback_service_tier: 'standard'"), 'capacity fallback must not force standard service tier');
assertGate(!runnerSource.includes("capacity_fallback_reasoning_effort: 'low'"), 'capacity fallback must not force low reasoning');
assertGate(!runnerSource.includes('SKS_CODEX_CAPACITY_FALLBACK_MODEL'), 'capacity fallback model override must be removed');
emitGate('codex-control:model-capacity-fallback', {
  attempts,
  retry_count: result.reliabilityShield.retry_count,
  model_capacity_retry_count: result.reliabilityShield.model_capacity_retry_count
});

function baseTask() {
  return {
    route: '$Agent',
    tier: 'worker',
    missionId: 'M-model-capacity-fallback',
    cwd: process.cwd(),
    prompt: 'model capacity fallback fixture',
    outputSchemaId: 'sks.agent-worker-result.v1',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true },
    reliabilityPolicy: { maxEmptyResultRetries: 1, idleTimeoutMs: 5000, timeoutClass: 'short' },
    mutationLedgerRoot: process.cwd()
  };
}
