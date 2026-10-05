import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createTriWikiProofCard } from '../triwiki-proof-card.js';
import type { TriWikiProofCard, TriWikiProofCardInput } from '../triwiki-proof-card.js';
import { summarizeTriWikiProofBank, writeTriWikiProofCard } from '../triwiki-proof-bank.js';
import { readTriWikiProofIndex, repairTriWikiProofIndex, triWikiProofIndexPath, updateTriWikiProofIndexEntry, type TriWikiProofIndexFs } from '../triwiki-proof-bank-index.js';
import { withTriWikiProofIndexLock } from '../triwiki-proof-bank-index-store.js';

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sks-proof-index-'));
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function proofCard(overrides: Partial<TriWikiProofCardInput> = {}): TriWikiProofCard {
  return createTriWikiProofCard({
    subject_type: 'gate',
    subject_id: 'gate-alpha',
    cache_key: 'cache-alpha',
    input_hash: 'input-alpha',
    gate_impl_hash: 'impl-alpha',
    package_lock_hash: 'lock-alpha',
    release_gates_hash: 'gates-alpha',
    env_allowlist_hash: 'env-alpha',
    tool_versions: { sks: 'test' },
    fixture_version: 'fixture-1',
    result: 'passed',
    reusable: true,
    evidence: { checked: true },
    ...overrides
  });
}

interface CountingFs {
  calls: { readFileSync: number; statSync: number; readdirSync: number };
  facade: TriWikiProofIndexFs;
}

function countingFs(): CountingFs {
  const calls = { readFileSync: 0, statSync: 0, readdirSync: 0 };
  const facade: TriWikiProofIndexFs = {
    readFileSync: (target) => {
      calls.readFileSync += 1;
      return fs.readFileSync(target);
    },
    statSync: (target) => {
      calls.statSync += 1;
      try {
        return fs.statSync(target);
      } catch {
        return null;
      }
    },
    readdirSync: (target) => {
      calls.readdirSync += 1;
      return fs.readdirSync(target, { withFileTypes: true });
    }
  };
  return { calls, facade };
}

test('repair rebuilds from disk, counts corrupt cards and skips bookkeeping files', () => {
  const root = workspace();
  try {
    const cards = [
      proofCard(),
      proofCard({ subject_id: 'gate-beta', cache_key: 'cache-beta' }),
      proofCard({ subject_type: 'module', subject_id: 'module-gamma', cache_key: 'cache-gamma' })
    ];
    for (const card of cards) writeTriWikiProofCard(root, card);
    const bankDir = path.join(root, '.sneakoscope', 'triwiki', 'proof-bank');
    fs.mkdirSync(path.join(bankDir, 'gates', 'gate-broken'), { recursive: true });
    fs.writeFileSync(path.join(bankDir, 'gates', 'gate-broken', 'proof-broken.json'), '{"not":"a proof card"}');
    fs.writeFileSync(path.join(bankDir, 'gates', 'gate-alpha', 'stale.corrupt-1.json'), 'garbage');
    fs.mkdirSync(path.join(bankDir, '.locks', 'gates'), { recursive: true });
    fs.writeFileSync(path.join(bankDir, '.locks', 'gates', 'ignored.json'), '{}');

    const counted = countingFs();
    const result = repairTriWikiProofIndex(root, { fs: counted.facade });
    assert.equal(result.ok, true);
    assert.equal(result.indexed_count, 3);
    assert.equal(result.corrupt_card_count, 1);
    assert.ok(counted.calls.readdirSync > 0, 'repair is the one place that walks');

    const read = readTriWikiProofIndex(root);
    assert.equal(read.status, 'ok');
    assert.deepEqual(
      read.entries.map((entry) => entry.subject_id),
      ['gate-alpha', 'gate-beta', 'module-gamma']
    );
    assert.deepEqual([...read.entries].sort((left, right) => (left.path < right.path ? -1 : 1)).map((row) => row.path), read.entries.map((row) => row.path));
    for (const entry of read.entries) {
      assert.match(entry.hash, /^[0-9a-f]{64}$/);
      assert.equal(entry.path.startsWith('.sneakoscope/triwiki/proof-bank/'), true);
    }
  } finally {
    cleanup(root);
  }
});

test('legacy proof-bank summary preserves the canonical index manifest', () => {
  const root = workspace();
  try {
    writeTriWikiProofCard(root, proofCard());
    repairTriWikiProofIndex(root);
    const indexFile = triWikiProofIndexPath(root);
    const indexBytes = fs.readFileSync(indexFile);

    const summary = summarizeTriWikiProofBank(root);

    assert.equal(summary.proof_count, 1);
    assert.equal(summary.corrupt_backups, 0);
    assert.equal(fs.existsSync(indexFile), true);
    assert.deepEqual(fs.readFileSync(indexFile), indexBytes);
    const read = readTriWikiProofIndex(root);
    assert.equal(read.status, 'ok');
    assert.equal(read.entry_count, 1);
    assert.deepEqual(
      fs.readdirSync(path.dirname(indexFile)).filter((name) => name.startsWith('index.json.corrupt-')),
      []
    );
  } finally {
    cleanup(root);
  }
});

test('a proof path outside the bank is refused', () => {
  const root = workspace();
  try {
    const card = proofCard();
    writeTriWikiProofCard(root, card);
    repairTriWikiProofIndex(root);
    const outside = path.join(root, 'elsewhere.json');
    fs.writeFileSync(outside, `${JSON.stringify(card, null, 2)}\n`);
    const update = updateTriWikiProofIndexEntry(root, card, outside);
    assert.equal(update.ok, false);
    assert.equal(update.status, 'path_outside_proof_bank');
    assert.equal(update.entry, null);
    assert.equal(readTriWikiProofIndex(root).entry_count, 1);
  } finally {
    cleanup(root);
  }
});

test('concurrent writers do not corrupt or lose manifest rows', async () => {
  const root = workspace();
  try {
    const seed = proofCard({ subject_id: 'gate-seed', cache_key: 'cache-seed' });
    writeTriWikiProofCard(root, seed);
    repairTriWikiProofIndex(root);

    const driver = path.join(root, 'update-driver.mjs');
    fs.writeFileSync(
      driver,
      [
        "import fs from 'node:fs';",
        'const [, , moduleUrl, root, file] = process.argv;',
        'const mod = await import(moduleUrl);',
        "const card = JSON.parse(fs.readFileSync(file, 'utf8'));",
        'const result = mod.updateTriWikiProofIndexEntry(root, card, file);',
        'process.exit(result.ok ? 0 : 3);',
        ''
      ].join('\n')
    );
    const moduleUrl = new URL('../triwiki-proof-bank-index.js', import.meta.url).href;
    const files = [0, 1, 2, 3].map((index) =>
      writeTriWikiProofCard(root, proofCard({ subject_id: `gate-worker-${index}`, cache_key: `cache-worker-${index}` }))
    );
    const codes = await Promise.all(
      files.map(
        (file) =>
          new Promise<number>((resolve, reject) => {
            const child = spawn(process.execPath, [driver, moduleUrl, root, file], { stdio: 'ignore' });
            child.on('error', reject);
            child.on('exit', (code) => resolve(code ?? -1));
          })
      )
    );
    assert.deepEqual(codes, [0, 0, 0, 0], 'every concurrent writer must succeed');

    const read = readTriWikiProofIndex(root);
    assert.equal(read.status, 'ok', 'the manifest must remain parseable after concurrent writes');
    assert.equal(read.entry_count, 5);
    assert.deepEqual(
      read.entries.map((entry) => entry.subject_id).sort(),
      ['gate-seed', 'gate-worker-0', 'gate-worker-1', 'gate-worker-2', 'gate-worker-3']
    );
    const leftovers = fs
      .readdirSync(path.join(root, '.sneakoscope', 'triwiki', 'proof-bank'))
      .filter((name) => name.includes('.tmp'));
    assert.deepEqual(leftovers, [], 'atomic writes must not leave temp files behind');
  } finally {
    cleanup(root);
  }
});

test('proof index lock release leaves a successor identity untouched', () => {
  const root = workspace();
  try {
    const lockFile = path.join(root, '.sneakoscope', 'triwiki', 'proof-bank', '.locks', 'index.lock');
    withTriWikiProofIndexLock(root, () => {
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as Record<string, unknown>;
      fs.writeFileSync(lockFile, `${JSON.stringify({ ...current, owner_nonce: 'successor-owner' }, null, 2)}\n`);
    });
    assert.equal(fs.existsSync(lockFile), true, 'release must not delete a lock identity it no longer owns');
    const successor = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { owner_nonce?: string };
    assert.equal(successor.owner_nonce, 'successor-owner');
  } finally {
    cleanup(root);
  }
});
