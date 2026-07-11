import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  addWrongnessRecord,
  projectWrongnessLedgerPath,
  readWrongnessLedger,
  resolveWrongnessRecord
} from '../triwiki-wrongness/wrongness-ledger.js';
import { wrongnessContextForRoute } from '../triwiki-wrongness/wrongness-retrieval.js';
import { createWrongnessRecord } from '../triwiki-wrongness/wrongness-schema.js';

function recordInput(index: number) {
  return {
    id: `wrongness-${index}`,
    wrongness_kind: 'incorrect_claim',
    severity: index % 2 ? 'medium' : 'high',
    route: '$Wiki',
    claim: { text: `incorrect claim ${index}` },
    links: { files: ['src/core/triwiki-attention.ts'] }
  };
}

test('concurrent wrongness upserts do not lose records and route context remains bounded', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-concurrent-'));
  try {
    await Promise.all(Array.from({ length: 24 }, (_, index) => addWrongnessRecord(root, recordInput(index))));
    const ledger = await readWrongnessLedger(root);
    assert.equal(ledger.records.length, 24);
    assert.equal(new Set(ledger.records.map((record) => record.id)).size, 24);

    const context = await wrongnessContextForRoute(root, { route: '$Wiki', limit: 5 });
    assert.equal(Number((context.summary as any).active), 24);
    assert.equal(context.summary.active_ids.length, 5);
    assert.equal(context.summary.avoidance_rules.length, 5);
    assert.equal(context.summary.omitted_active_records, 19);
    assert.equal(context.active_records.length, 5);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('resolving a base record does not materialize shared shards into the project ledger', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-shard-'));
  try {
    await addWrongnessRecord(root, recordInput(1));
    const shardDir = path.join(root, '.sneakoscope', 'wiki', 'wrongness');
    await fs.mkdir(shardDir, { recursive: true });
    await fs.writeFile(path.join(shardDir, 'shared.json'), `${JSON.stringify(createWrongnessRecord(recordInput(2)), null, 2)}\n`);

    assert.equal((await readWrongnessLedger(root)).records.length, 2);
    const result = await resolveWrongnessRecord(root, 'wrongness-1');
    assert.equal(result.updated, 1);
    const raw = JSON.parse(await fs.readFile(projectWrongnessLedgerPath(root), 'utf8'));
    assert.equal(raw.records.length, 1);
    assert.equal(raw.records[0].id, 'wrongness-1');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('wrongness mission paths reject traversal before any ledger write', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-traversal-'));
  const escaped = path.join(root, 'outside', 'wrongness-ledger.json');
  try {
    await assert.rejects(
      () => addWrongnessRecord(root, { ...recordInput(3), mission_id: '../../outside' }, { missionId: '../../outside' }),
      /invalid_mission_id/
    );
    assert.equal(await fs.access(escaped).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('wrongness mission paths reject canonical ids backed by external symlinks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-symlink-root-'));
  const victim = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-symlink-victim-'));
  try {
    const missions = path.join(root, '.sneakoscope', 'missions');
    await fs.mkdir(missions, { recursive: true });
    await fs.symlink(victim, path.join(missions, 'M-evil'));

    await assert.rejects(
      addWrongnessRecord(root, { kind: 'failed_assumption', title: 'must not write externally' }, { missionId: 'M-evil' }),
      /unsafe_mission_directory/
    );
    assert.equal(await fs.access(path.join(victim, 'wrongness-ledger.json')).then(() => true, () => false), false);
    assert.equal(await fs.access(path.join(victim, 'wrongness-summary.md')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(victim, { recursive: true, force: true });
  }
});

test('wrongness writes reject an external symlink at the .sneakoscope ancestor', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-state-symlink-root-'));
  const victim = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-state-symlink-victim-'));
  try {
    await fs.mkdir(path.join(victim, 'missions'), { recursive: true });
    await fs.symlink(victim, path.join(root, '.sneakoscope'));

    await assert.rejects(
      addWrongnessRecord(root, recordInput(4), { missionId: 'M-evil' }),
      /unsafe_sneakoscope_root_symlink/
    );
    assert.equal(await fs.access(path.join(victim, 'missions', 'M-evil', 'wrongness-ledger.json')).then(() => true, () => false), false);
    assert.equal(await fs.access(path.join(victim, 'locks')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(victim, { recursive: true, force: true });
  }
});

test('project wrongness writes reject an external wiki symlink', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-wiki-symlink-root-'));
  const victim = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-wiki-symlink-victim-'));
  try {
    const state = path.join(root, '.sneakoscope');
    await fs.mkdir(state, { recursive: true });
    await fs.symlink(victim, path.join(state, 'wiki'));

    await assert.rejects(addWrongnessRecord(root, recordInput(5)), /unsafe_wrongness_wiki_symlink/);
    assert.equal(await fs.access(path.join(victim, 'wrongness-ledger.json')).then(() => true, () => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(victim, { recursive: true, force: true });
  }
});
