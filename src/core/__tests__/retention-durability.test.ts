import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { enforceRetention } from '../retention.js';
import { backdate, makeRoot, quietPolicy, writeJson } from './retention-test-helpers.js';

test('durable mission compaction preserves Image UX and presentation evidence byte-for-byte', async () => {
  const root = await makeRoot('sks-retention-visual-evidence-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-visual-old');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-visual-old', created_at: '2020-01-01T00:00:00.000Z' });
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await writeJson(path.join(mission, 'reviews', 'image-ux', 'image-ux-review-gate.json'), { passed: true, blockers: [] });
    await writeJson(path.join(mission, 'reviews', 'image-ux', 'policy.json'), { provider: 'gpt-image-2' });
    await writeJson(path.join(mission, 'reviews', 'image-ux', 'response.json'), { output: 'annotated.png' });
    const source = path.join(mission, 'reviews', 'image-ux', 'assets', 'source.png');
    const annotated = path.join(mission, 'reviews', 'image-ux', 'assets', 'annotated.png');
    const html = path.join(mission, 'source-html', 'artifact.html');
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, Buffer.from([1, 2, 3, 4]));
    await fs.writeFile(annotated, Buffer.from([5, 6, 7, 8]));
    await fs.mkdir(path.dirname(html), { recursive: true });
    await fs.writeFile(html, '<html>durable</html>\n');
    await writeJson(path.join(mission, 'agents', 'agent-work-queue.json'), { disposable: true });
    await backdate(mission);

    await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, prune_old_missions: true, max_missions: 0, max_mission_age_days: 0 }
    });

    assert.deepEqual(await fs.readFile(source), Buffer.from([1, 2, 3, 4]));
    assert.deepEqual(await fs.readFile(annotated), Buffer.from([5, 6, 7, 8]));
    assert.equal(await fs.readFile(html, 'utf8'), '<html>durable</html>\n');
    assert.equal(await fs.access(path.join(mission, 'reviews', 'image-ux', 'policy.json')).then(() => true, () => false), true);
    assert.equal(await fs.access(path.join(mission, 'reviews', 'image-ux', 'response.json')).then(() => true, () => false), true);
    assert.equal(await fs.access(path.join(mission, 'agents', 'agent-work-queue.json')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('GC rejects a symlinked .sneakoscope root without touching external state', async () => {
  const root = await makeRoot('sks-retention-state-root-link-');
  const external = await makeRoot('sks-retention-state-root-external-');
  try {
    const jsonl = path.join(external, 'missions', 'events.jsonl');
    await fs.mkdir(path.dirname(jsonl), { recursive: true });
    const original = `${'x'.repeat(10000)}\n`;
    await fs.writeFile(jsonl, original);
    await fs.symlink(external, path.join(root, '.sneakoscope'));

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      policy: { ...quietPolicy, max_event_log_bytes: 100 }
    });

    assert.equal(result.cleanup.ok, false);
    assert.ok(result.cleanup.blockers.includes('unsafe_sneakoscope_root'));
    assert.equal(await fs.readFile(jsonl, 'utf8'), original);
    assert.equal(await fs.access(path.join(external, 'reports', 'retention-cleanup.json')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(external, { recursive: true, force: true });
  }
});

test('GC treats a newer empty dynamic scheduler ledger as resumed despite stale completion proof', async () => {
  const root = await makeRoot('sks-retention-resumed-dynamic-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-resumed-dynamic');
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), { sessions: {} });
    const runtime = path.join(mission, 'agents', 'sessions', 'dynamic', 'runtime.tmp');
    await fs.mkdir(path.dirname(runtime), { recursive: true });
    await fs.writeFile(runtime, 'dynamic runtime\n');

    await enforceRetention(root, { fullMissionSweep: true, skipStorageReport: true, policy: quietPolicy });

    assert.equal(await fs.readFile(runtime, 'utf8'), 'dynamic runtime\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('full GC reports an unresolved storage budget instead of silently claiming success', async () => {
  const root = await makeRoot('sks-retention-budget-');
  try {
    const durable = path.join(root, '.sneakoscope', 'memory', 'durable.bin');
    await fs.mkdir(path.dirname(durable), { recursive: true });
    await fs.writeFile(durable, Buffer.alloc(4096, 1));

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      policy: { ...quietPolicy, max_sneakoscope_bytes: 1024 }
    });

    assert.equal(result.cleanup.ok, false);
    assert.equal(result.cleanup.storage_budget.checked, true);
    assert.ok((result.cleanup.blockers as string[]).includes('retention_budget_exceeded:.sneakoscope'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
