import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRIDGE_COMPACTION_ENVELOPE_PREFIX,
  CODEX_SUMMARIZATION_PROMPT,
  CODEX_SUMMARY_PREFIX,
  buildCompactionSummaryRequest,
  compactEndpointResult,
  compactionResponseEvents,
  decodeBridgeCompaction,
  encodeBridgeCompaction,
  expandBridgeCompactionItems,
  normalizeCompactionUsage,
  parseProviderSummary,
  requestsRemoteCompaction,
} from '../compaction-adapter.js';

const userMessage = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });

test('a bridge compaction envelope round-trips and nothing else decodes as one', () => {
  const envelope = encodeBridgeCompaction('progress: parser done; next: tests');
  assert.ok(envelope.startsWith(BRIDGE_COMPACTION_ENVELOPE_PREFIX));
  assert.equal(decodeBridgeCompaction(envelope), 'progress: parser done; next: tests');
  assert.equal(decodeBridgeCompaction('gAAAAABofficial-encrypted-content'), null);
  assert.equal(decodeBridgeCompaction(`${BRIDGE_COMPACTION_ENVELOPE_PREFIX}not-base64-json`), null);
  assert.equal(decodeBridgeCompaction(42), null);
});

test('remote compaction is recognised by the trigger item Codex appends', () => {
  assert.equal(requestsRemoteCompaction({ input: [userMessage('hi'), { type: 'compaction_trigger' }] }), true);
  assert.equal(requestsRemoteCompaction({ input: [userMessage('hi')] }), false);
  assert.equal(requestsRemoteCompaction({ input: 'compact' }), false);
  assert.equal(requestsRemoteCompaction(null), false);
});

test('bridge-made compaction items become the summary message; backend-made ones are left alone', () => {
  const official = { type: 'compaction', encrypted_content: 'gAAAAABofficial' };
  const payload: Record<string, unknown> = {
    input: [
      userMessage('first'),
      { type: 'compaction', id: 'cmp_1', encrypted_content: encodeBridgeCompaction('the summary') },
      { type: 'compaction_summary', encrypted_content: encodeBridgeCompaction('alias summary') },
      official,
    ],
  };
  assert.equal(expandBridgeCompactionItems(payload), true);
  const input = payload.input as any[];
  assert.deepEqual(input[1], userMessage(`${CODEX_SUMMARY_PREFIX}\nthe summary`));
  assert.deepEqual(input[2], userMessage(`${CODEX_SUMMARY_PREFIX}\nalias summary`));
  assert.equal(input[3], official);
  const untouched = { input: [userMessage('only')] };
  assert.equal(expandBridgeCompactionItems(untouched), false);
});

test('the summary request is the compaction request with the trigger replaced and tool calls disabled', () => {
  const tools = [{ type: 'function', name: 'shell', parameters: { type: 'object' } }];
  const request = buildCompactionSummaryRequest({
    type: 'response.create',
    model: 'public-model',
    instructions: 'base instructions',
    input: [
      userMessage('fix the parser'),
      { type: 'function_call', call_id: 'c1', name: 'shell', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: 'ok' },
      { type: 'compaction', encrypted_content: encodeBridgeCompaction('older summary') },
      { type: 'compaction_trigger' },
    ],
    tools,
    parallel_tool_calls: true,
    previous_response_id: 'resp_1',
    stream: false,
    store: false,
  }, 'upstream-model');
  assert.equal(request.type, undefined, 'a WebSocket create type never reaches HTTP');
  assert.equal(request.model, 'upstream-model');
  assert.equal(request.instructions, 'base instructions');
  assert.equal(request.stream, true);
  assert.equal(request.store, false);
  assert.equal(request.tool_choice, 'none');
  assert.deepEqual(request.tools, tools);
  assert.equal(request.parallel_tool_calls, undefined);
  assert.equal(request.previous_response_id, undefined);
  const input = request.input as any[];
  assert.equal(input.some((item) => item.type === 'compaction_trigger'), false);
  assert.deepEqual(input[3], userMessage(`${CODEX_SUMMARY_PREFIX}\nolder summary`));
  assert.deepEqual(input.at(-1), userMessage(CODEX_SUMMARIZATION_PROMPT));
  const toolless = buildCompactionSummaryRequest({ model: 'm', input: [{ type: 'compaction_trigger' }], tools: [] }, 'm');
  assert.equal(toolless.tools, undefined);
  assert.equal(toolless.tool_choice, undefined);
});

function sse(...events: object[]): string {
  return events.map((event) => `event: ${(event as any).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}
const assistant = (text: string) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });

test('the provider summary is read from finished items, the completed output, or the JSON body', () => {
  const usage = { input_tokens: 1200, output_tokens: 80, total_tokens: 1280 };
  const streamed = parseProviderSummary(sse(
    { type: 'response.created', response: { id: 'r1' } },
    { type: 'response.output_text.delta', delta: 'Summ' },
    { type: 'response.output_item.done', item: assistant('Summary: parser fixed.') },
    { type: 'response.completed', response: { id: 'r1', output: [assistant('Summary: parser fixed.')], usage } },
  ));
  assert.deepEqual(streamed, { summary: 'Summary: parser fixed.', usage, failed: false });

  const completedOnly = parseProviderSummary(sse({ type: 'response.completed', response: { id: 'r2', output: [{ type: 'reasoning' }, assistant('From completed.')] } }));
  assert.equal(completedOnly.summary, 'From completed.');
  assert.equal(completedOnly.failed, false);

  const cut = parseProviderSummary(sse({ type: 'response.output_text.delta', delta: 'partial' }));
  assert.equal(cut.failed, true, 'a stream that never completed is not a summary');

  const failed = parseProviderSummary(sse(
    { type: 'response.output_item.done', item: assistant('text') },
    { type: 'response.failed', response: { error: { code: 'server_error' } } },
  ));
  assert.equal(failed.failed, true);

  const json = parseProviderSummary(JSON.stringify({ id: 'r3', output: [assistant('Non-streamed.')], usage }));
  assert.deepEqual(json, { summary: 'Non-streamed.', usage, failed: false });
  assert.equal(parseProviderSummary('{"ok":true}').failed, true);
});

test('usage is forwarded only in the shape Codex parses', () => {
  assert.deepEqual(normalizeCompactionUsage({ input_tokens: 10, output_tokens: 2 }), { input_tokens: 10, output_tokens: 2, total_tokens: 12 });
  assert.deepEqual(normalizeCompactionUsage({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: {} }), {
    input_tokens: 7, output_tokens: 3, total_tokens: 10, input_tokens_details: { cached_tokens: 4 },
  });
  assert.equal(normalizeCompactionUsage({ output_tokens: 2 }), null);
  assert.equal(normalizeCompactionUsage(null), null);
});

test('the compaction answer carries exactly one compaction item in Codex wire shape', () => {
  const events = compactionResponseEvents('resp_x', 'public-model', 'the summary', { input_tokens: 5, output_tokens: 1, total_tokens: 6, extra: true });
  assert.equal(events.created.type, 'response.created');
  assert.equal((events.created.response as any).id, 'resp_x');
  const item = (events.itemDone as any).item;
  assert.equal(events.itemDone.type, 'response.output_item.done');
  assert.equal(item.type, 'compaction');
  assert.equal(decodeBridgeCompaction(item.encrypted_content), 'the summary');
  const completed = events.completed as any;
  assert.equal(completed.type, 'response.completed');
  assert.equal(completed.response.id, 'resp_x');
  assert.deepEqual(completed.response.output, [item]);
  assert.deepEqual(completed.response.usage, { input_tokens: 5, output_tokens: 1, total_tokens: 6 });
});

test('the /responses/compact answer keeps recent user messages and ends with the compaction item', () => {
  const result = compactEndpointResult({
    input: [{ type: 'message', role: 'developer', content: [] }, userMessage('one'), assistant('reply'), userMessage('two')],
  }, 'the summary') as { output: any[] };
  assert.deepEqual(result.output.slice(0, 2), [userMessage('one'), userMessage('two')]);
  assert.equal(result.output.at(-1).type, 'compaction');
  assert.equal(decodeBridgeCompaction(result.output.at(-1).encrypted_content), 'the summary');
});
