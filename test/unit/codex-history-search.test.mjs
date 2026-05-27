import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { searchCodexHistory } from '../../dist/core/source-intelligence/codex-history-search.js';

test('Codex history search finds case-insensitive local conversation previews', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-history-test-'));
  await fs.mkdir(path.join(root, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(root, 'sessions', 'one.jsonl'), '{"message":"Need Ultra Stability evidence"}\n');
  const report = await searchCodexHistory({ codexHome: root, query: 'ultra stability' });
  assert.equal(report.ok, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].line, 1);
});
