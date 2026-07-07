#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-reliability-shield.js');
const policy = { maxEmptyResultRetries: 1, idleTimeoutMs: 1000, timeoutClass: 'short' };
const idleBeforeOutput = mod.evaluateCodexReliabilityAttempt(
  { ok: false, finalResponse: '', structuredOutput: null, blockers: [] },
  [
    { type: 'thread.started', ts: '2026-06-03T00:00:00.000Z' },
    { type: 'turn.started', ts: '2026-06-03T00:00:02.500Z' }
  ],
  policy,
  1
);
const idleAfterPartial = mod.evaluateCodexReliabilityAttempt(
  { ok: false, finalResponse: 'partial', structuredOutput: null, blockers: [] },
  [
    { type: 'thread.started', ts: '2026-06-03T00:00:00.000Z' },
    { type: 'item.completed', ts: '2026-06-03T00:00:00.100Z', item: { type: 'agent_message', text: 'partial' } },
    { type: 'turn.started', ts: '2026-06-03T00:00:02.500Z' }
  ],
  policy,
  1
);
const gitStatusTextInStructuredOutput = mod.evaluateCodexReliabilityAttempt(
  {
    ok: true,
    finalResponse: '{"status":"done","findings":["git status reported fatal: not a git repository"],"blockers":[]}',
    structuredOutput: { status: 'done', findings: ['git status reported fatal: not a git repository'], blockers: [] },
    blockers: []
  },
  [
    { type: 'thread.started', ts: '2026-06-03T00:00:00.000Z' },
    { type: 'item.completed', ts: '2026-06-03T00:00:00.100Z', item: { type: 'agent_message', text: '{"status":"done","findings":["git status reported fatal: not a git repository"],"blockers":[]}' } },
    { type: 'turn.completed', ts: '2026-06-03T00:00:00.200Z' }
  ],
  policy,
  1
);
const realSdkFatalEvent = mod.evaluateCodexReliabilityAttempt(
  { ok: false, finalResponse: '', structuredOutput: null, blockers: [] },
  [
    { type: 'thread.started', ts: '2026-06-03T00:00:00.000Z' },
    { type: 'turn.failed', ts: '2026-06-03T00:00:00.200Z', error: { message: 'fatal sdk transport failure' } }
  ],
  policy,
  1
);
assertGate(idleBeforeOutput.retryable === true && idleBeforeOutput.retry_reason === 'stream_idle_before_meaningful_event', 'idle before output must be retryable', idleBeforeOutput);
assertGate(idleAfterPartial.retryable === false && idleAfterPartial.blockers.includes('codex_reliability_idle_after_partial_output'), 'idle after partial output must block', idleAfterPartial);
assertGate(gitStatusTextInStructuredOutput.fatal_error === false && gitStatusTextInStructuredOutput.blockers.length === 0, 'structured output text must not be treated as SDK fatal error', gitStatusTextInStructuredOutput);
assertGate(realSdkFatalEvent.fatal_error === true && realSdkFatalEvent.blockers.includes('codex_reliability_fatal_error_no_retry'), 'real SDK fatal event must still block', realSdkFatalEvent);
emitGate('codex-control:stream-idle-watchdog', { retryable_before_output: true, blocks_after_partial: true, ignores_structured_text_fatal: true, blocks_real_sdk_fatal: true });
