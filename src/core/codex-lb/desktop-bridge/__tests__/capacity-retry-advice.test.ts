import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import test from 'node:test';
import { adviseModelCapacityRetry, isAdvisableEventStream, modelCapacityAdvisingSse } from '../capacity-retry-advice.js';

const overloaded = () => ({ type: 'response.failed', response: { error: { code: 'server_is_overloaded' } } });

async function through(chunks: string[]): Promise<{ out: string; advised: number }> {
  let advised = 0;
  const out = await text(Readable.from(chunks.map((chunk) => Buffer.from(chunk))).pipe(modelCapacityAdvisingSse(() => { advised += 1; })));
  return { out, advised };
}

test('only an unadvised server_is_overloaded failure gains Retry-After, in the slot Codex reads', () => {
  const failed = overloaded();
  assert.equal(adviseModelCapacityRetry(failed), true);
  assert.deepEqual(failed.response.error, { code: 'server_is_overloaded', headers: { 'Retry-After': '5' } });
  const kept = [
    { type: 'response.failed', response: { error: { code: 'server_is_overloaded', headers: { 'retry-after': 1 } } } },
    { type: 'error', status: 503, headers: { 'Retry-After': '2' }, error: { code: 'server_is_overloaded' } },
    { type: 'error', status: 503, error: { code: 'server_is_overloaded', headers: 'unreadable' } },
    { type: 'response.failed', response: { error: { code: 'rate_limit_exceeded' } } },
    { type: 'response.completed', response: { error: { code: 'server_is_overloaded' } } },
  ];
  for (const event of kept) {
    const before = JSON.stringify(event);
    assert.equal(adviseModelCapacityRetry(event), false);
    assert.equal(JSON.stringify(event), before);
  }
});

test('the SSE transform rewrites a failure split across chunks and leaves every other byte alone', async () => {
  const plain = ['data: {"type":"response.created"}\n\n', 'data: {"type":"response.output_text', '.delta","delta":"server_is_overloaded"}\n\n'];
  assert.deepEqual(await through(plain), { out: plain.join(''), advised: 0 });

  const failure = JSON.stringify(overloaded());
  const { out, advised } = await through(['event: response.failed\r\n', `data: ${failure.slice(0, 30)}`, `${failure.slice(30)}\r\n\r\n: keepalive\r\n\r\n`]);
  assert.equal(advised, 1);
  const [block, keepalive, rest] = out.split('\r\n\r\n');
  assert.equal(keepalive, ': keepalive');
  assert.equal(rest, '');
  const [eventLine, dataLine] = block!.split('\n');
  assert.equal(eventLine, 'event: response.failed\r');
  assert.deepEqual(JSON.parse(dataLine!.slice('data: '.length)).response.error.headers, { 'Retry-After': '5' });

  const unterminated = await through([`data: ${failure}`]);
  assert.equal(unterminated.advised, 1, 'a final event without its blank line is still read');
});

test('only a plain event stream is advisable', () => {
  assert.equal(isAdvisableEventStream({ 'content-type': 'text/event-stream; charset=utf-8' }), true);
  assert.equal(isAdvisableEventStream({ 'content-type': 'text/event-stream', 'content-encoding': 'identity' }), true);
  assert.equal(isAdvisableEventStream({ 'content-type': 'text/event-stream', 'content-encoding': 'gzip' }), false);
  assert.equal(isAdvisableEventStream({ 'content-type': 'application/json' }), false);
});
