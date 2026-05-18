import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileFreshness, lastJsonlEventTime } from '../../src/core/evidence/evidence-freshness.mjs';

test('evidence freshness marks files older than the last route event as stale', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-evidence-freshness-'));
  const file = path.join(root, 'artifact.json');
  const events = path.join(root, 'events.jsonl');
  await fs.writeFile(file, '{}\n');
  await fs.utimes(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
  await fs.writeFile(events, `${JSON.stringify({ ts: '2026-01-02T00:00:00Z', type: 'route.event' })}\n`);
  const cutoff = await lastJsonlEventTime(events);
  const result = await fileFreshness(file, { staleAfter: cutoff });
  assert.equal(result.freshness, 'stale');
  assert.ok(result.issues.includes('stale'));
});
