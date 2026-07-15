import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditToolOutputContinuity,
  repairToolCallSequence,
  runWithCodexReliabilityShield
} from '../codex-reliability-shield.js';
import { codexControlAdapterFailureBlockers } from '../codex-task-runner.js';

test('Codex task runner propagates adapter and Reliability Shield failure even without explicit blockers', () => {
  assert.deepEqual(codexControlAdapterFailureBlockers({
    ok: false,
    events: [{ type: 'item.completed' }],
    structuredOutput: { status: 'done' },
    blockers: [],
    reliabilityShield: { ok: false, blockers: [] }
  }, 'codex-sdk'), [
    'codex_sdk_adapter_reported_failure',
    'codex_reliability_shield_failed'
  ]);
  assert.deepEqual(codexControlAdapterFailureBlockers({ ok: true, reliabilityShield: { ok: true } }, 'codex-sdk'), []);
  assert.deepEqual(codexControlAdapterFailureBlockers({ events: [], blockers: [] }, 'python-codex-sdk'), [
    'python_codex_sdk_adapter_reported_failure'
  ]);
})

test('post-run tool continuity audit detects missing output without fabricating an event', () => {
  const events = [
    { type: 'item.completed', item: { id: 'call-1', call_id: 'call-1', type: 'custom_tool_call' } },
    { type: 'item.completed', item: { id: 'call-2', call_id: 'call-2', type: 'custom_tool_call' } },
    { type: 'item.completed', item: { call_id: 'call-1', type: 'custom_tool_call_output', output: 'ok' } }
  ];
  const audit = auditToolOutputContinuity(events);
  assert.equal(audit.missingToolResultCount, 1);
  assert.deepEqual(audit.missingToolCallIds, ['call-2']);
  assert.deepEqual(audit.events, events);
  assert.equal(audit.events.some((event) => event.type === 'tool_result.stubbed'), false);

  const compatibility = repairToolCallSequence(events);
  assert.equal(compatibility.repairedToolResultCount, 0);
  assert.equal(compatibility.missingToolResultCount, 1);
  assert.equal(compatibility.events.some((event) => event.type === 'tool_result.stubbed'), false);
});

test('tool continuity audit unwraps persisted response_item rollout envelopes', () => {
  const events = [
    { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'rollout-call-1', name: 'fixture' } },
    { type: 'rollout_record', response_item: { payload: { type: 'custom_tool_call', call_id: 'rollout-call-2', name: 'fixture' } } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'rollout-call-1', output: 'ok' } }
  ];
  const audit = auditToolOutputContinuity(events);
  assert.equal(audit.missingToolResultCount, 1);
  assert.deepEqual(audit.missingToolCallIds, ['rollout-call-2']);
  assert.deepEqual(audit.events, events);
});

test('Reliability Shield fails closed and does not retry an ambiguous missing custom tool output', async () => {
  let attempts = 0;
  const result = await runWithCodexReliabilityShield({
    route: '$Naruto',
    missionId: 'M-tool-output-continuity',
    cwd: process.cwd(),
    prompt: 'fixture',
    outputSchemaId: 'fixture',
    outputSchema: {},
    sandboxPolicy: 'workspace-write',
    requestedScopeContract: {},
    mutationLedgerRoot: process.cwd(),
    reliabilityPolicy: { maxEmptyResultRetries: 3 }
  }, async () => {
    attempts += 1;
    return {
      ok: true,
      structuredOutput: { status: 'apparently-complete' },
      events: [
        { type: 'item.completed', item: { id: 'call-lost', call_id: 'call-lost', type: 'custom_tool_call' } }
      ]
    };
  });
  assert.equal(attempts, 1);
  assert.equal(result.reliabilityShield.ok, false);
  assert.equal(result.ok, false);
  assert.equal(result.reliabilityShield.missing_tool_result_count, 1);
  assert.equal(result.reliabilityShield.repaired_tool_result_count, 0);
  assert.equal(result.events?.some((event) => event.type === 'tool_result.stubbed'), false);
  assert.match((result.blockers || []).join('\n'), /missing_tool_output_unrecoverable/);
});

test('Reliability Shield treats the missing-output API error text as fatal before empty-result retry', async () => {
  let attempts = 0;
  const result = await runWithCodexReliabilityShield({
    route: '$Naruto',
    missionId: 'M-missing-output-error-text',
    cwd: process.cwd(),
    prompt: 'fixture',
    outputSchemaId: 'fixture',
    outputSchema: {},
    sandboxPolicy: 'workspace-write',
    requestedScopeContract: {},
    mutationLedgerRoot: process.cwd(),
    reliabilityPolicy: { maxEmptyResultRetries: 3 }
  }, async () => {
    attempts += 1;
    return {
      ok: false,
      events: [],
      blockers: ['[No tool output found for custom tool call call_lost_result_1.]']
    };
  });

  assert.equal(attempts, 1);
  assert.equal(result.reliabilityShield.retry_count, 0);
  assert.equal(result.reliabilityShield.ok, false);
  assert.match(result.reliabilityShield.blockers.join('\n'), /codex_reliability_missing_tool_output_unrecoverable/);
});
