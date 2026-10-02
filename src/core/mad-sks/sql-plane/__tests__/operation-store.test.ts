import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson } from '../../../fsx.js';
import type { MadSksSqlPlaneCapabilityV2 } from '../capability.js';
import {
  extractCanonicalToolCallId,
  operationFile,
  reserveMadSksSqlPlaneOperation
} from '../operation-store.js';
import { maybeRecordMadSksSqlPlaneToolResultFromToolUse } from '../result-lifecycle.js';
import { madSksSqlPlaneRuntimeDir } from '../paths.js';

// Pre/PostToolUse payload keys recorded from Codex: the call is identified by
// `tool_use_id` (the same value on both hooks); there is no tool_call_id/call_id/id.
const MISSION = 'M-sql-plane-tool-use-id';
const STATEMENT = 'update public.fixture set name = name where id = 1';

function preToolUse(toolUseId: string, query = STATEMENT) {
  return {
    session_id: '019fa1ac-d303-77f0-9c3c-b3536dba9fd8',
    turn_id: '019fa294-1599-7d42-a854-c3afe6d6cc60',
    transcript_path: '/Users/example/.codex/sessions/2026/09/30/rollout.jsonl',
    cwd: '/Users/example/project',
    hook_event_name: 'PreToolUse',
    model: 'gpt-5.6-sol',
    permission_mode: 'default',
    tool_name: 'mcp__supabase__execute_sql',
    tool_input: { query },
    tool_use_id: toolUseId
  };
}

function postToolUse(toolUseId: string, toolResponse: unknown) {
  return { ...preToolUse(toolUseId), hook_event_name: 'PostToolUse', tool_response: toolResponse };
}

const capability = { cycle_id: 'mad-sks-sql-plane-test', project_ref: 'abcdefghijklmnopqrst' } as MadSksSqlPlaneCapabilityV2;

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-sql-plane-operation-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function reserve(root: string, payload: ReturnType<typeof preToolUse>) {
  return reserveMadSksSqlPlaneOperation({
    root,
    missionId: MISSION,
    capability,
    toolCallId: extractCanonicalToolCallId(payload) || 'payload-content-hash',
    toolName: payload.tool_name,
    sql: payload.tool_input.query,
    operationClasses: ['update']
  });
}

test('the tool call id is the real payload tool_use_id, ahead of every other key', () => {
  assert.equal(extractCanonicalToolCallId(preToolUse('call_mQ3vXbT2k9LrNd7sYw1HaPcE')), 'call_mQ3vXbT2k9LrNd7sYw1HaPcE');
  assert.equal(extractCanonicalToolCallId({ toolUseId: 'call_camel' }), 'call_camel');
  assert.equal(extractCanonicalToolCallId({ tool_use_id: 'call_first', tool_call_id: 'other', id: 'x', request_id: 'y' }), 'call_first');
  assert.equal(extractCanonicalToolCallId({ tool_call_id: 'legacy' }), 'legacy');
  assert.equal(extractCanonicalToolCallId({ tool_name: 'mcp__supabase__execute_sql' }), null);
});

test('two identical statements are separate operations; a redelivered hook of one call is reused', async () => {
  await withRoot(async (root) => {
    const first = await reserve(root, preToolUse('call_aaaaaaaaaaaaaaaaaaaaaaaa'));
    const second = await reserve(root, preToolUse('call_bbbbbbbbbbbbbbbbbbbbbbbb'));
    assert.equal(first.reused, false);
    assert.equal(second.reused, false);
    assert.notEqual(first.operation.operation_id, second.operation.operation_id);
    assert.equal(first.operation.tool_call_id, 'call_aaaaaaaaaaaaaaaaaaaaaaaa');

    const redelivered = await reserve(root, preToolUse('call_aaaaaaaaaaaaaaaaaaaaaaaa'));
    assert.equal(redelivered.reused, true);
    assert.equal(redelivered.operation.operation_id, first.operation.operation_id);
  });
});

test('a real PostToolUse payload finds the operation its PreToolUse reserved', async () => {
  await withRoot(async (root) => {
    const pre = preToolUse('call_cccccccccccccccccccccccc');
    const { operation } = await reserve(root, pre);

    const failed = await maybeRecordMadSksSqlPlaneToolResultFromToolUse({
      root,
      missionId: MISSION,
      toolCallPayload: postToolUse('call_cccccccccccccccccccccccc', { isError: true }),
      toolResult: postToolUse('call_cccccccccccccccccccccccc', { isError: true })
    });
    assert.equal(failed?.ok, true);
    assert.equal(failed?.result_status, 'failed');
    const stored: any = await readJson(operationFile(root, MISSION, 'call_cccccccccccccccccccccccc'), null);
    assert.equal(stored.operation_id, operation.operation_id);
    assert.equal(stored.state, 'failed');

    // A tool call that reserved nothing (any other tool's PostToolUse) records
    // nothing and leaves no lock directory behind.
    const other = postToolUse('call_dddddddddddddddddddddddd', { content: [] });
    const miss = await maybeRecordMadSksSqlPlaneToolResultFromToolUse({ root, missionId: MISSION, toolCallPayload: other, toolResult: other });
    assert.equal(miss?.ok, false);
    assert.equal(miss?.operation, null);
  });
  await withRoot(async (root) => {
    const post = postToolUse('call_eeeeeeeeeeeeeeeeeeeeeeee', { content: [] });
    await maybeRecordMadSksSqlPlaneToolResultFromToolUse({ root, missionId: MISSION, toolCallPayload: post, toolResult: post });
    await assert.rejects(fs.access(madSksSqlPlaneRuntimeDir(root, MISSION)));
  });
});
