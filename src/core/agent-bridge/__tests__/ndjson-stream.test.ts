import test from 'node:test';
import assert from 'node:assert/strict';
import { emitStreamEvent } from '../agent-mode.js';

function fakeOut() {
  const chunks: string[] = [];
  const out: any = {
    write(chunk: any) {
      chunks.push(String(chunk));
      return true;
    }
  };
  return { out, chunks };
}

test('emitStreamEvent writes exactly one newline-terminated JSON line per call', () => {
  const { out, chunks } = fakeOut();
  emitStreamEvent('start', { mission_id: 'M-1' }, out);
  emitStreamEvent('progress', { cycle: 1 }, out);
  emitStreamEvent('result', { ok: true }, out);
  assert.equal(chunks.length, 3, 'expected one write() call per emitted event, no batching');
  for (const chunk of chunks) {
    assert.equal(chunk.endsWith('\n'), true);
    assert.equal(chunk.split('\n').filter(Boolean).length, 1, 'each write must contain exactly one line');
  }
});

test('every emitted line parses as valid JSON with an event field from the allowed enum', () => {
  const { out, chunks } = fakeOut();
  const allowed = new Set(['start', 'progress', 'partial', 'result', 'error']);
  emitStreamEvent('start', { a: 1 }, out);
  emitStreamEvent('progress', { b: 2 }, out);
  emitStreamEvent('partial', { c: 3 }, out);
  emitStreamEvent('error', { d: 4 }, out);
  emitStreamEvent('result', { e: 5 }, out);
  for (const chunk of chunks) {
    const parsed = JSON.parse(chunk.trimEnd());
    assert.equal(allowed.has(parsed.event), true, `unexpected event kind: ${parsed.event}`);
    assert.equal(typeof parsed.ts, 'string');
    assert.equal(Number.isNaN(Date.parse(parsed.ts)), false, 'ts must be a parseable ISO timestamp');
  }
});

test('emitStreamEvent preserves the data payload verbatim', () => {
  const { out, chunks } = fakeOut();
  emitStreamEvent('progress', { cycle: 3, reasons: ['gate_failed'] }, out);
  assert.equal(chunks.length, 1);
  const parsed = JSON.parse(chunks[0]!.trimEnd());
  assert.deepEqual(parsed.data, { cycle: 3, reasons: ['gate_failed'] });
});

test('emitStreamEvent rejects an event kind outside the allowed enum', () => {
  const { out } = fakeOut();
  assert.throws(() => emitStreamEvent('bogus' as any, {}, out));
});

test('a simulated NDJSON stdout stream ending in a result event: every line parses and the last line is event=result', () => {
  const { out, chunks } = fakeOut();
  // Simulate a pilot command run: start -> progress x2 -> result, exactly as
  // qa-loop-command.ts's --stream wiring emits them.
  emitStreamEvent('start', { mission_id: 'M-2' }, out);
  emitStreamEvent('progress', { type: 'qaloop.cycle.start', cycle: 1 }, out);
  emitStreamEvent('progress', { type: 'qaloop.cycle.continue', cycle: 1 }, out);
  emitStreamEvent('result', { ok: true, status: 'passed' }, out);
  const combinedStdout = chunks.join('');
  const lines = combinedStdout.split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 4);
  const parsedLines = lines.map((line) => JSON.parse(line));
  const allowed = new Set(['start', 'progress', 'partial', 'result', 'error']);
  for (const parsed of parsedLines) assert.equal(allowed.has(parsed.event), true);
  assert.equal(parsedLines[parsedLines.length - 1].event, 'result');
});
