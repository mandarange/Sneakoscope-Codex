import test from 'node:test';
import assert from 'node:assert/strict';
import type { CodexTaskInput } from '../codex-control-plane.js';
import { codexReportedFailure } from '../codex-sdk-adapter.js';
import { isCodexModelCapacityError, runWithCodexReliabilityShield, type CodexReliabilityAttemptResult } from '../codex-reliability-shield.js';

// The event shapes are the ones `codex exec --experimental-json` printed on 2026-10-20, when the release
// smoke failed 12 of 12 attempts on OpenAI model capacity and the SDK reported only "Reading prompt from stdin...".
const CAPACITY = 'Selected model is at capacity. Please try a different model.';
const warning = { type: 'item.completed', item: { id: 'w', type: 'error', message: 'Codex is ignoring 4 unrecognized configuration settings.' } };
const failureEvents = (message: string) => [
  { type: 'thread.started', thread_id: 't1' },
  warning,
  { type: 'turn.started' },
  { type: 'error', message },
  { type: 'turn.failed', error: { message } }
];
const failed = (message: string, extra: any[] = []): CodexReliabilityAttemptResult => ({
  ok: false,
  events: [...extra, ...failureEvents(message)],
  finalResponse: '',
  structuredOutput: null,
  blockers: [`codex_sdk_run_failed:${message} (Codex Exec exited with code 1: Reading prompt from stdin...)`]
});
const succeeded = (): CodexReliabilityAttemptResult => ({
  ok: true,
  events: [{ type: 'item.completed', item: { type: 'agent_message', text: '{"status":"done"}' } }, { type: 'turn.completed' }],
  finalResponse: '{"status":"done"}',
  structuredOutput: { status: 'done' },
  blockers: []
});
const empty = (): CodexReliabilityAttemptResult => ({ ok: false, events: [], blockers: [] });
const ranCommand = { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'ls' } };

function task(sandboxPolicy: CodexTaskInput['sandboxPolicy'], reliabilityPolicy: NonNullable<CodexTaskInput['reliabilityPolicy']> = {}): CodexTaskInput {
  return {
    route: '$Naruto',
    missionId: 'M-capacity',
    cwd: process.cwd(),
    prompt: 'fixture',
    outputSchemaId: 'fixture',
    outputSchema: {},
    sandboxPolicy,
    requestedScopeContract: {},
    mutationLedgerRoot: process.cwd(),
    reliabilityPolicy: { capacityBackoffMs: [1, 1, 1], ...reliabilityPolicy }
  };
}

function sequence(...results: CodexReliabilityAttemptResult[]) {
  let calls = 0;
  return { run: async () => results[Math.min(calls++, results.length - 1)]!, calls: () => calls };
}

test('a capacity failure is retried after a backoff, and a later success carries no capacity blocker', async () => {
  const attempts = sequence(failed(CAPACITY), succeeded());
  const result = await runWithCodexReliabilityShield(task('workspace-write'), attempts.run);
  const shield = result.reliabilityShield;
  assert.equal(attempts.calls(), 2);
  assert.equal(result.ok, true);
  assert.equal(shield.ok, true);
  assert.deepEqual(shield.blockers, []);
  assert.equal(shield.model_capacity_retry_count, 1);
  assert.equal(shield.selected_model_capacity_fallback, true);
  assert.equal(shield.retry_count, 1);
  assert.equal(shield.attempts[0]?.model_capacity_error, true);
  assert.equal(shield.attempts[0]?.retry_reason, 'model_capacity_backoff_retry');
  assert.ok((shield.attempts[0]?.capacity_wait_ms ?? 0) > 0);
  assert.equal(shield.attempts[1]?.model_capacity_error, false);
});

test('capacity retries are bounded and the run then ends as a capacity failure that names its cause', async () => {
  const attempts = sequence(failed(CAPACITY));
  const result = await runWithCodexReliabilityShield(task('workspace-write'), attempts.run);
  assert.equal(attempts.calls(), 4, 'one try and three retries');
  assert.equal(result.ok, false);
  assert.equal(result.reliabilityShield.ok, false);
  assert.equal(result.reliabilityShield.model_capacity_retry_count, 3);
  assert.equal(result.reliabilityShield.selected_model_capacity_fallback, false);
  assert.deepEqual(result.reliabilityShield.blockers, ['codex_model_capacity_unavailable']);
  assert.match((result.blockers || []).join('\n'), /codex_sdk_run_failed:Selected model is at capacity/);
  assert.equal(result.reliabilityShield.attempts.at(-1)?.capacity_wait_ms, null);

  const once = sequence(failed(CAPACITY));
  await runWithCodexReliabilityShield(task('workspace-write', { maxCapacityRetries: 1 }), once.run);
  assert.equal(once.calls(), 2, 'maxCapacityRetries caps the retries');
  const never = sequence(failed(CAPACITY));
  await runWithCodexReliabilityShield(task('workspace-write', { maxCapacityRetries: 0 }), never.run);
  assert.equal(never.calls(), 1, 'zero turns the retry off');
});

test('capacity retries and empty-result retries keep separate budgets', async () => {
  const attempts = sequence(failed(CAPACITY), empty(), empty());
  const result = await runWithCodexReliabilityShield(task('workspace-write', { maxEmptyResultRetries: 1 }), attempts.run);
  assert.equal(attempts.calls(), 3, 'capacity retry, empty retry, then the empty budget is spent');
  assert.equal(result.reliabilityShield.model_capacity_retry_count, 1);
  assert.equal(result.reliabilityShield.retry_count, 2);

  const noEmptyRetry = sequence(empty(), succeeded());
  await runWithCodexReliabilityShield(task('workspace-write', { maxEmptyResultRetries: 0 }), noEmptyRetry.run);
  assert.equal(noEmptyRetry.calls(), 1, 'the capacity budget does not lend retries to an empty result');
});

test('a usage limit is terminal: it is named, never retried, and never taken for capacity', async () => {
  const limit = "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 22nd, 2026 2:16 AM.";
  const attempts = sequence(failed(limit), succeeded());
  const result = await runWithCodexReliabilityShield(task('workspace-write'), attempts.run);
  assert.equal(attempts.calls(), 1);
  assert.equal(result.ok, false);
  assert.equal(result.reliabilityShield.attempts[0]?.model_capacity_error, false);
  assert.match(result.reliabilityShield.blockers.join('\n'), /codex_reliability_fatal_error_no_retry/);
  assert.match((result.blockers || []).join('\n'), /hit your usage limit/);
});

test('a capacity failure after work is retried only when a rerun cannot repeat a side effect', async () => {
  const writer = sequence(failed(CAPACITY, [ranCommand]), succeeded());
  const written = await runWithCodexReliabilityShield(task('workspace-write'), writer.run);
  assert.equal(writer.calls(), 1);
  assert.equal(written.ok, false);
  assert.deepEqual(written.reliabilityShield.blockers, ['codex_model_capacity_unavailable']);

  const reader = sequence(failed(CAPACITY, [ranCommand]), succeeded());
  const read = await runWithCodexReliabilityShield(task('read-only'), reader.run);
  assert.equal(reader.calls(), 2);
  assert.equal(read.ok, true);
  assert.equal(read.reliabilityShield.no_duplicate_streamed_output, false, 'the rerun is on the record');
});

test('agent text that mentions capacity is not a capacity failure', async () => {
  const mention = { type: 'item.completed', item: { type: 'agent_message', text: CAPACITY } };
  assert.equal(isCodexModelCapacityError({ ok: true, events: [mention], finalResponse: CAPACITY, blockers: [] }, [mention]), false);
  assert.equal(isCodexModelCapacityError({ ok: false, events: [mention], blockers: [] }, [mention]), false);
  assert.equal(isCodexModelCapacityError({ ok: false, events: failureEvents(CAPACITY), blockers: [] }, failureEvents(CAPACITY)), true);
  assert.equal(isCodexModelCapacityError({ ok: false, events: [], blockers: [`codex_sdk_run_failed:${CAPACITY}`] }, []), true);

  const attempts = sequence({ ...succeeded(), finalResponse: CAPACITY, events: [mention, { type: 'turn.completed' }] });
  const result = await runWithCodexReliabilityShield(task('workspace-write'), attempts.run);
  assert.equal(attempts.calls(), 1);
  assert.equal(result.reliabilityShield.attempts[0]?.model_capacity_error, false);
  assert.equal(result.ok, true);
});

test('a capacity retry that could not finish before the deadline is not started', async () => {
  const attempts = sequence(failed(CAPACITY), succeeded());
  const result = await runWithCodexReliabilityShield(
    task('workspace-write', { capacityBackoffMs: [60_000, 60_000, 60_000], deadlineEpochMs: Date.now() + 5_000 }),
    attempts.run
  );
  assert.equal(attempts.calls(), 1);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reliabilityShield.blockers, ['codex_model_capacity_unavailable']);
  assert.equal(result.reliabilityShield.attempts[0]?.capacity_wait_ms, null);
});

test('the failure Codex reported is the last failure event that has a message', () => {
  assert.equal(codexReportedFailure([{ type: 'turn.started' }, warning]), null);
  assert.deepEqual(codexReportedFailure(failureEvents(CAPACITY))?.message, CAPACITY);
  assert.equal(codexReportedFailure(failureEvents(CAPACITY))?.event.type, 'turn.failed');
  const silent = [{ type: 'error', message: 'first  line\nsecond' }, { type: 'turn.failed', error: {} }];
  assert.equal(codexReportedFailure(silent)?.message, 'first line second', 'a later failure without a message does not hide the cause');
  assert.equal(codexReportedFailure([{ type: 'turn.failed' }])?.message, '');
  assert.equal(codexReportedFailure([{ type: 'error', message: 'x'.repeat(500) }])?.message.length, 300);
});
