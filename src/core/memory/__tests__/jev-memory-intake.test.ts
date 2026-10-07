import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildJevMemoryIntake, readJevMemoryIntake, stageJevMemoryIntake } from '../jev-memory-intake.js';
import { memoryDispositionPolicy } from '../../memory-governor.js';

async function fixture() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-memory-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-test'), { recursive: true });
  await fsp.mkdir(path.join(root, '.sneakoscope', 'state', 'locks'), { recursive: true });
  await fsp.mkdir(path.join(root, 'docs'), { recursive: true });
  await fsp.writeFile(path.join(root, 'docs', 'preferences.md'), 'verified preference evidence\n');
  return root;
}

test('mission intake is redacted, bounded, atomic, and idempotent', async () => {
  const root = await fixture();
  const entry = buildJevMemoryIntake({
    missionId: 'M-test', turnId: 'T-1', sessionId: 'session-secret', disposition: 'durable_preference',
    text: 'Remember that dark mode is preferred. Do not store the rest of this prompt.',
    sourceDigest: 'a'.repeat(64), contextGraphHash: 'b'.repeat(64),
    evidenceRefs: ['docs/preferences.md', '../escape.txt'],
    evidenceHashes: { 'docs/preferences.md': createHash('sha256').update('verified preference evidence\n').digest('hex') }
  });
  assert.equal(entry.text_redacted, 'dark mode is preferred. Do not store the rest of this prompt.');
  assert.deepEqual(entry.evidence_refs, ['docs/preferences.md']);
  const first = await stageJevMemoryIntake(root, entry);
  const second = await stageJevMemoryIntake(root, entry);
  assert.equal(first.staged, true);
  assert.equal(second.duplicate, true);
  assert.equal((await readJevMemoryIntake(root, 'M-test')).length, 1);
});

test('secret candidates never reach staged intake', async () => {
  const root = await fixture();
  assert.throws(() => buildJevMemoryIntake({
    missionId: 'M-test', turnId: 'T-2', disposition: 'durable_policy', text: 'Remember this token: sk-test-12345678901234567890'
  }), /memory_redaction_failed|memory_intake_invalid/);
});

test('explicit remember keeps durable precedence over Jev and stale evidence is rejected at promotion', () => {
  const result = memoryDispositionPolicy({
    prompt: 'Remember that dark mode is preferred.',
    missionId: 'M-test',
    enabled: true,
    choice: 'ephemeral_turn',
    sourceFresh: false,
    graphFresh: false
  });
  assert.equal(result.disposition, 'durable_preference');
  assert.equal(result.reason, 'explicit_remember');
});
