import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { tailJsonl } from '../ui-command.js';

async function tempFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ui-tail-'));
  return path.join(dir, 'events.jsonl');
}

function line(i: number) {
  return JSON.stringify({ ts: i, type: 'evt', n: i });
}

test('tailJsonl: missing file returns empty', async () => {
  const file = await tempFile();
  const result = await tailJsonl(file, 5);
  assert.deepEqual(result, []);
});

test('tailJsonl: returns only the last `limit` lines', async () => {
  const file = await tempFile();
  const rows = Array.from({ length: 10 }, (_, i) => line(i));
  await fsp.writeFile(file, `${rows.join('\n')}\n`);
  const result = await tailJsonl(file, 3);
  assert.deepEqual(result.map((r: any) => r.n), [7, 8, 9]);
});

test('tailJsonl: incremental reads pick up appended lines without re-reading old content', async () => {
  const file = await tempFile();
  await fsp.writeFile(file, `${line(1)}\n${line(2)}\n`);
  const first = await tailJsonl(file, 5);
  assert.deepEqual(first.map((r: any) => r.n), [1, 2]);

  await fsp.appendFile(file, `${line(3)}\n`);
  const second = await tailJsonl(file, 5);
  assert.deepEqual(second.map((r: any) => r.n), [1, 2, 3]);

  await fsp.appendFile(file, `${line(4)}\n${line(5)}\n${line(6)}\n`);
  const third = await tailJsonl(file, 3);
  assert.deepEqual(third.map((r: any) => r.n), [4, 5, 6]);
});

test('tailJsonl: an unchanged file between calls does not error and returns the same tail', async () => {
  const file = await tempFile();
  await fsp.writeFile(file, `${line(1)}\n${line(2)}\n`);
  const first = await tailJsonl(file, 5);
  const second = await tailJsonl(file, 5);
  assert.deepEqual(first, second);
});

test('tailJsonl: a truncated/rotated file (size shrinks) is detected and re-seeded rather than erroring', async () => {
  const file = await tempFile();
  await fsp.writeFile(file, `${line(1)}\n${line(2)}\n${line(3)}\n`);
  await tailJsonl(file, 5);
  await fsp.writeFile(file, `${line(100)}\n`);
  const afterRotate = await tailJsonl(file, 5);
  assert.deepEqual(afterRotate.map((r: any) => r.n), [100]);
});

test('tailJsonl: a trailing partial (unterminated) line is not returned until it is completed', async () => {
  const file = await tempFile();
  await fsp.writeFile(file, `${line(1)}\n`);
  await fsp.appendFile(file, '{"ts":2,"type":"evt","n":2');
  const partial = await tailJsonl(file, 5);
  assert.deepEqual(partial.map((r: any) => r.n), [1]);
  await fsp.appendFile(file, '}\n');
  const completed = await tailJsonl(file, 5);
  assert.deepEqual(completed.map((r: any) => r.n), [1, 2]);
});
