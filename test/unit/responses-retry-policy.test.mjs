import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESPONSES_RETRY_POLICY,
  responsesRetryDelayMs,
  shouldRetryResponsesError,
  withResponsesRetry
} from '../../dist/core/responses-retry-policy.js';

test('default policy lists imagegen among retry adapters and keeps exponential backoff', () => {
  const policy = DEFAULT_RESPONSES_RETRY_POLICY;
  assert.ok(policy.adapters.includes('imagegen'));
  assert.ok(policy.adapters.includes('source-intelligence'));
  assert.equal(shouldRetryResponsesError({ status: 429, attempt: 1 }), true);
  assert.equal(shouldRetryResponsesError({ status: 429, attempt: policy.max_attempts }), false);
  assert.equal(shouldRetryResponsesError({ status: 400, attempt: 1 }), false);
  assert.ok(responsesRetryDelayMs(3) > responsesRetryDelayMs(1));
});

test('withResponsesRetry retries a retryable status then returns the eventual success', async () => {
  const statuses = [429, 503, null];
  let calls = 0;
  const slept = [];
  const outcome = await withResponsesRetry(async (attempt) => {
    calls += 1;
    return { value: `attempt-${attempt}`, status: statuses[attempt - 1] ?? null, code: null };
  }, { sleep: async (ms) => { slept.push(ms); } });

  assert.equal(calls, 3);
  assert.equal(outcome.result, 'attempt-3');
  assert.equal(outcome.attempts, 3);
  assert.equal(outcome.retry_log.filter((row) => row.retried).length, 2);
  assert.deepEqual(slept, [500, 1000]);
});

test('withResponsesRetry stops immediately on a non-retryable status', async () => {
  let calls = 0;
  const outcome = await withResponsesRetry(async () => {
    calls += 1;
    return { value: 'client-error', status: 400, code: null };
  }, { sleep: async () => {} });
  assert.equal(calls, 1);
  assert.equal(outcome.result, 'client-error');
  assert.equal(outcome.retry_log[0].retried, false);
});

test('withResponsesRetry retries a thrown timeout error and re-throws after exhausting attempts', async () => {
  let calls = 0;
  await assert.rejects(
    withResponsesRetry(async () => {
      calls += 1;
      const err = new Error('imagegen_fetch_timeout_90000ms');
      throw err;
    }, {
      sleep: async () => {},
      classifyError: () => ({ code: 'ETIMEDOUT', status: null })
    }),
    /imagegen_fetch_timeout/
  );
  assert.equal(calls, DEFAULT_RESPONSES_RETRY_POLICY.max_attempts);
});
