#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-reliability-shield.js');
let attempts = 0;
const result = await mod.runWithCodexReliabilityShield(baseTask(), async () => {
  attempts += 1;
  if (attempts === 1) return { ok: false, events: [], finalResponse: '', structuredOutput: null, blockers: [] };
  return {
    ok: true,
    sdkThreadId: 'sdk-thread-empty-retry',
    sdkRunId: 'sdk-run-empty-retry',
    events: [
      { type: 'thread.started', thread_id: 'sdk-thread-empty-retry' },
      { type: 'item.completed', item: { type: 'agent_message', text: '{"status":"done"}' } },
      { type: 'turn.completed' }
    ],
    finalResponse: '{"status":"done"}',
    structuredOutput: { status: 'done' },
    blockers: []
  };
});
assertGate(attempts === 2, 'empty SDK result must retry once before meaningful output', { attempts, result });
assertGate(result.reliabilityShield.retry_count === 1, 'retry count mismatch', result.reliabilityShield);
assertGate(result.reliabilityShield.no_duplicate_streamed_output === true, 'empty retry must not duplicate meaningful output', result.reliabilityShield);
emitGate('codex-control:empty-result-retry', { attempts, retry_count: result.reliabilityShield.retry_count });

function baseTask() {
  return {
    route: '$Agent',
    tier: 'worker',
    missionId: 'M-empty-result-retry',
    cwd: process.cwd(),
    prompt: 'empty retry fixture',
    outputSchemaId: 'sks.agent-worker-result.v1',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true },
    reliabilityPolicy: { maxEmptyResultRetries: 1, idleTimeoutMs: 5000, timeoutClass: 'short' },
    mutationLedgerRoot: process.cwd()
  };
}
