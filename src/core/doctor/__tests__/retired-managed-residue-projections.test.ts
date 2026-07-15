import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcileRetiredManagedResidue } from '../retired-managed-residue.js';
import { findFile } from './retired-managed-residue-test-helpers.js';

test('doctor rewrites exact managed trust and wrongness projections idempotently without rebranding history', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-projections-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current');
    const strictMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-strict');
    const trustFile = path.join(missionRoot, 'trust-report.json');
    const strictTrustFile = path.join(strictMissionRoot, 'trust-report.json');
    const wrongnessRoot = path.join(root, '.sneakoscope', 'wiki', 'wrongness');
    const wrongnessFile = path.join(wrongnessRoot, 'wrong-managed.json');
    const wrongnessIndexFile = path.join(root, '.sneakoscope', 'wiki', 'wrongness-index.json');
    const wrongnessLedgerFile = path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json');
    const trust = {
      schema: 'sks.trust-report.v1',
      route: '$Naruto',
      status: 'verified_partial',
      evidence: { keep: ['trust', 1] },
      git_collaboration: {
        schema: 'sks.git-collaboration-trust.v1',
        mode: 'team',
        status: 'verified_partial',
        issues: ['preserve-this-field']
      }
    };
    const strictTrust = {
      schema: 'sks.trust-report.v1',
      route: '$Work',
      marker: { keep: true },
      git_collaboration: {
        schema: 'sks.git-collaboration-trust.v1',
        mode: 'strict-team',
        shared_memory_ok: true
      }
    };
    const wrappedWrongness = {
      schema: 'sks.triwiki-wrongness-record.v1',
      id: 'wrong-managed',
      source: 'historical-source',
      wrongness: {
        schema: 'sks.triwiki-wrongness.v1',
        id: 'WRONG-MANAGED',
        route: '$Team',
        claim: { text: 'Historical $Team claim remains historical.' },
        keep: { nested: true }
      }
    };
    const wrongnessIndex = {
      schema: 'sks.triwiki-wrongness-index.v1',
      generated_at: '2026-01-01T00:00:00.000Z',
      summary: { keep: true },
      records: [
        { id: 'WRONG-TEAM', route: '$Team', claim: 'historical team route' },
        { id: 'WRONG-AGENT', route: '$Agent', claim: 'historical agent route' },
        { id: 'WRONG-NARUTO', route: '$Naruto', claim: 'current route' }
      ]
    };
    const wrongnessLedger = {
      schema: 'sks.triwiki-wrongness-ledger.v1',
      generated_at: '2026-01-01T00:00:00.000Z',
      scope: 'project',
      mission_id: null,
      keep: ['ledger-field'],
      records: [
        { schema: 'sks.triwiki-wrongness.v1', id: 'WRONG-SWARM', route: '$Swarm', claim: { text: 'historical swarm route' } },
        { schema: 'sks.triwiki-wrongness.v1', id: 'WRONG-WORK', route: '$Work', claim: { text: 'current work route' } }
      ]
    };

    await fs.mkdir(missionRoot, { recursive: true });
    await fs.mkdir(strictMissionRoot, { recursive: true });
    await fs.mkdir(wrongnessRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), '{"id":"M-current","mode":"$Naruto"}\n');
    await fs.writeFile(path.join(strictMissionRoot, 'mission.json'), '{"id":"M-strict","mode":"$Work"}\n');
    await fs.writeFile(trustFile, `${JSON.stringify(trust, null, 2)}\n`);
    await fs.writeFile(strictTrustFile, `${JSON.stringify(strictTrust, null, 2)}\n`);
    await fs.writeFile(wrongnessFile, `${JSON.stringify(wrappedWrongness, null, 2)}\n`);
    await fs.writeFile(wrongnessIndexFile, `${JSON.stringify(wrongnessIndex, null, 2)}\n`);
    await fs.writeFile(wrongnessLedgerFile, `${JSON.stringify(wrongnessLedger, null, 2)}\n`);

    const observed = await reconcileRetiredManagedResidue({ root, fix: false });
    assert.equal(observed.ok, false);
    assert.equal(observed.detected_managed_artifact_count, 5);
    assert.equal(observed.remaining_managed_artifact_count, 5);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.removed_managed_artifact_count, 5);
    assert.equal(fixed.rewritten_state_file_count, 5);
    assert.equal(fixed.remaining_managed_artifact_count, 0);

    assert.deepEqual(JSON.parse(await fs.readFile(trustFile, 'utf8')), {
      ...trust,
      git_collaboration: { ...trust.git_collaboration, mode: 'work' }
    });
    assert.deepEqual(JSON.parse(await fs.readFile(strictTrustFile, 'utf8')), {
      ...strictTrust,
      git_collaboration: { ...strictTrust.git_collaboration, mode: 'strict-work' }
    });
    assert.deepEqual(JSON.parse(await fs.readFile(wrongnessFile, 'utf8')), {
      ...wrappedWrongness,
      wrongness: { ...wrappedWrongness.wrongness, route: null }
    });
    assert.deepEqual(JSON.parse(await fs.readFile(wrongnessIndexFile, 'utf8')), {
      ...wrongnessIndex,
      records: [
        { ...wrongnessIndex.records[0], route: null },
        { ...wrongnessIndex.records[1], route: null },
        wrongnessIndex.records[2]
      ]
    });
    assert.deepEqual(JSON.parse(await fs.readFile(wrongnessLedgerFile, 'utf8')), {
      ...wrongnessLedger,
      records: [
        { ...wrongnessLedger.records[0], route: null },
        wrongnessLedger.records[1]
      ]
    });

    const firstPassBytes = await Promise.all([
      trustFile,
      strictTrustFile,
      wrongnessFile,
      wrongnessIndexFile,
      wrongnessLedgerFile
    ].map((file) => fs.readFile(file)));
    const secondPass = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(secondPass.ok, true);
    assert.equal(secondPass.detected_managed_artifact_count, 0);
    assert.equal(secondPass.rewritten_state_file_count, 0);
    const secondPassBytes = await Promise.all([
      trustFile,
      strictTrustFile,
      wrongnessFile,
      wrongnessIndexFile,
      wrongnessLedgerFile
    ].map((file) => fs.readFile(file)));
    assert.deepEqual(secondPassBytes, firstPassBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor quarantines wrong-schema legacy projection collisions byte for byte', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-projection-collision-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current');
    const trustFile = path.join(missionRoot, 'trust-report.json');
    const wrongnessRoot = path.join(root, '.sneakoscope', 'wiki', 'wrongness');
    const wrongnessFile = path.join(wrongnessRoot, 'wrong-collision.json');
    const wrongnessIndexFile = path.join(root, '.sneakoscope', 'wiki', 'wrongness-index.json');
    const wrongnessLedgerFile = path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json');
    const trustBytes = Buffer.from('{ "schema": "customer.trust.v1", "git_collaboration": { "schema": "sks.git-collaboration-trust.v1", "mode": "team" }, "keep": "exact bytes" }\n');
    const wrongnessBytes = Buffer.from('{ "schema": "customer.wrongness-wrapper.v1", "wrongness": { "schema": "sks.triwiki-wrongness.v1", "route": "$Team" }, "keep": "exact bytes" }\n');
    const indexBytes = Buffer.from('{ "schema": "customer.wrongness-index.v1", "records": [{ "route": "$Agent", "keep": 1 }] }\n');
    const ledgerBytes = Buffer.from('{ "schema": "sks.triwiki-wrongness-ledger.v1", "records": [{ "schema": "customer.wrongness.v1", "route": "$Swarm", "keep": 2 }] }\n');
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.mkdir(wrongnessRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), '{"id":"M-current","mode":"$Naruto"}\n');
    await fs.writeFile(trustFile, trustBytes);
    await fs.writeFile(wrongnessFile, wrongnessBytes);
    await fs.writeFile(wrongnessIndexFile, indexBytes);
    await fs.writeFile(wrongnessLedgerFile, ledgerBytes);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.preserved_user_file_count, 4);
    for (const file of [trustFile, wrongnessFile, wrongnessIndexFile, wrongnessLedgerFile]) {
      await assert.rejects(fs.access(file));
    }
    for (const [name, bytes] of [
      ['trust-report.json', trustBytes],
      ['wrong-collision.json', wrongnessBytes],
      ['wrongness-index.json', indexBytes],
      ['wrongness-ledger.json', ledgerBytes]
    ] as const) {
      const quarantined = await findFile(root, name);
      assert.ok(quarantined?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
      assert.deepEqual(await fs.readFile(quarantined!), bytes);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor never follows trust or wrongness projection symlinks outside the project', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-projection-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-projection-outside-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current');
    const wrongnessRoot = path.join(root, '.sneakoscope', 'wiki', 'wrongness');
    const trustTarget = path.join(outside, 'trust-target.json');
    const wrongnessTarget = path.join(outside, 'wrongness-target.json');
    const indexTarget = path.join(outside, 'index-target.json');
    const trustBytes = Buffer.from('{"schema":"sks.trust-report.v1","git_collaboration":{"schema":"sks.git-collaboration-trust.v1","mode":"team"}}\n');
    const wrongnessBytes = Buffer.from('{"schema":"sks.triwiki-wrongness-record.v1","wrongness":{"schema":"sks.triwiki-wrongness.v1","route":"$Team"}}\n');
    const indexBytes = Buffer.from('{"schema":"sks.triwiki-wrongness-index.v1","records":[{"route":"$Agent"}]}\n');
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.mkdir(wrongnessRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), '{"id":"M-current","mode":"$Naruto"}\n');
    await fs.writeFile(trustTarget, trustBytes);
    await fs.writeFile(wrongnessTarget, wrongnessBytes);
    await fs.writeFile(indexTarget, indexBytes);
    await fs.symlink(trustTarget, path.join(missionRoot, 'trust-report.json'));
    await fs.symlink(wrongnessTarget, path.join(wrongnessRoot, 'wrong-external.json'));
    await fs.symlink(indexTarget, path.join(root, '.sneakoscope', 'wiki', 'wrongness-index.json'));

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.preserved_user_file_count, 3);
    assert.deepEqual(await fs.readFile(trustTarget), trustBytes);
    assert.deepEqual(await fs.readFile(wrongnessTarget), wrongnessBytes);
    assert.deepEqual(await fs.readFile(indexTarget), indexBytes);
    await assert.rejects(fs.lstat(path.join(missionRoot, 'trust-report.json')));
    await assert.rejects(fs.lstat(path.join(wrongnessRoot, 'wrong-external.json')));
    await assert.rejects(fs.lstat(path.join(root, '.sneakoscope', 'wiki', 'wrongness-index.json')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
