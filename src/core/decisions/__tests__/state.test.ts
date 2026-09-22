import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../fsx.js';
import { applyOptionalContextSelection, hydrateContextCandidates, redactDecisionText, sourceSnapshotDigest } from '../state.js';
import type { BoundedTriwikiAttention } from '../../subagents/triwiki-attention.js';

test('redaction removes key-shaped values from evidence text', () => {
  const redacted = redactDecisionText('use sk-abcdefghijklmnopqrstuvwxyz1234 and Bearer abcdefghijklmnopqrstuvwxyz');
  assert.doesNotMatch(redacted, /sk-abcdefghij/);
  assert.doesNotMatch(redacted, /Bearer abcdefghijklmnopqrstuvwxyz/);
  assert.match(redacted, /\[redacted\]/);
});

test('dirty files change the source digest without a HEAD change', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-src-'));
  await runProcess('git', ['init'], { cwd: root, timeoutMs: 2_000, envMode: 'merge' });
  await fsp.writeFile(path.join(root, 'a.ts'), 'one');
  const first = await sourceSnapshotDigest(root);
  await fsp.writeFile(path.join(root, 'a.ts'), 'two');
  const second = await sourceSnapshotDigest(root);
  assert.notEqual(first, second);
  await fsp.rm(root, { recursive: true, force: true });
});

test('optional context selection unions pinned anchors and preserves excerpts', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-ctx-'));
  await fsp.writeFile(path.join(root, 'keep.ts'), 'export const keep = 1;\n');
  await fsp.writeFile(path.join(root, 'drop.ts'), 'export const drop = 1;\n');
  const attention: BoundedTriwikiAttention = {
    schema: 'sks.subagent-triwiki-attention.v1',
    source: '.sneakoscope/wiki/context-graph.json',
    available: true,
    attention_mode: 'context_graph:implementation',
    anchor_limit: 8,
    anchors: [
      {
        id: 'keep',
        claim_hash: 'c1',
        source_hash: 's1',
        hydrate_hint: null,
        reason_path: [],
        trust_score: 0.9,
        freshness: 'fresh',
        token_cost: 10,
        provenance: [{ path: 'keep.ts', hash: 's1' }]
      },
      {
        id: 'drop',
        claim_hash: 'c2',
        source_hash: 's2',
        hydrate_hint: null,
        reason_path: [],
        trust_score: 0.2,
        freshness: 'fresh',
        token_cost: 10,
        provenance: [{ path: 'drop.ts', hash: 's2' }]
      },
      {
        id: 'pinned',
        claim_hash: 'c3',
        source_hash: 's3',
        hydrate_hint: null,
        reason_path: [],
        trust_score: 0.9,
        freshness: 'fresh',
        token_cost: 10,
        provenance: [{ path: 'keep.ts', hash: 's3' }]
      }
    ],
    hydration_policy: 'on_demand_only',
    full_pack_injected: false,
    reason: null,
    repair_command: 'sks align run',
    snapshot_hash: 'snap',
    snapshot_freshness: 'fresh',
    profile: 'implementation',
    token_cost: 30,
    token_budget: 2000
  };
  const candidates = await hydrateContextCandidates(root, attention, ['keep.ts']);
  const pinned = candidates.find((row) => row.id === 'pinned' || row.sourcePath === 'keep.ts');
  assert.ok(candidates.some((row) => row.pinned));
  const selected = applyOptionalContextSelection(attention, candidates, ['drop']);
  assert.ok(selected.anchors.some((anchor) => anchor.id === 'pinned' || candidates.find((row) => row.id === anchor.id)?.pinned));
  assert.ok(pinned);
  await fsp.rm(root, { recursive: true, force: true });
});
