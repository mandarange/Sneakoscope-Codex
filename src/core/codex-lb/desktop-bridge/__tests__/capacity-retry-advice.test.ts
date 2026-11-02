import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import test from 'node:test';
import { adviseModelCapacityRetry, isAdvisableEventStream, modelCapacityAdvisingSse } from '../capacity-retry-advice.js';

const overloaded = () => ({ type: 'response.failed', response: { error: { code: 'server_is_overloaded' } } });

async function through(chunks: (string | Buffer)[]): Promise<{ out: string; advised: number }> {
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

test('an unterminated oversized SSE event is forwarded before EOF instead of accumulating', async () => {
  const stream = modelCapacityAdvisingSse(() => assert.fail('ordinary data must not be rewritten'));
  const received: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => received.push(chunk));
  // More than the 1 MiB advice buffer, delivered while the upstream stays open.
  const chunks = [Buffer.from('data: '), ...Array.from({ length: 18 }, () => Buffer.alloc(64 * 1024, 'x'))];
  for (const chunk of chunks) stream.write(chunk);
  assert.ok(received.length > 0, 'oversized partial events must stream before their delimiter or EOF');
  stream.end();
  await new Promise<void>((resolve) => stream.on('end', resolve));
  assert.deepEqual(Buffer.concat(received), Buffer.concat(chunks));
});

test('oversized events pass through byte-for-byte and advice resumes at the next event boundary', async () => {
  const failure = `data: ${JSON.stringify(overloaded())}`;
  for (const newline of ['\n', '\r\n']) {
    const large = `data: ${JSON.stringify({ delta: '한🙂'.repeat(200_000) })}`;
    // Split every delimiter byte and the UTF-8 text across transport chunks.
    const bytes = Buffer.from(large);
    const chunks = [bytes.subarray(0, 19), bytes.subarray(19, 31), bytes.subarray(31), ...`${newline}${newline}`, failure, ...`${newline}${newline}`];
    const { out, advised } = await through(chunks);
    assert.equal(out.slice(0, large.length + newline.length * 2), `${large}${newline}${newline}`);
    assert.equal(advised, 1);
    const rewritten = out.slice(large.length + newline.length * 2).trim().slice(6);
    assert.deepEqual(JSON.parse(rewritten).response.error.headers, { 'Retry-After': '5' });
    const oneChunk = await through([`${large}${newline}${newline}${failure}${newline}${newline}`]);
    assert.equal(oneChunk.out, out, 'transport chunking must not change the result');
  }
});

test('a large transport chunk of small SSE events still receives advice on every failure', async () => {
  const small = `data: ${JSON.stringify(overloaded())}\n\n`;
  const { out, advised } = await through([small.repeat(16_000)]);
  assert.equal(advised, 1, 'the diagnostic callback remains once per transport chunk');
  const events = out.trim().split('\n\n');
  assert.equal(events.length, 16_000);
  for (const event of events) assert.deepEqual(JSON.parse(event.slice(6)).response.error.headers, { 'Retry-After': '5' });
});

test('an oversized capacity failure is relayed unchanged, including when the stream ends mid-event', async () => {
  const event = { type: 'error', error: { code: 'server_is_overloaded', message: 'x'.repeat(1024 * 1024) } };
  const data = `data: ${JSON.stringify(event)}`;
  for (const ending of ['', '\n\n', '\r\n\r\n']) {
    assert.deepEqual(await through([data.slice(0, 800_000), data.slice(800_000), ending]), { out: data + ending, advised: 0 });
  }
});
