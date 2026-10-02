import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOUNDED_TRIWIKI_ATTENTION_SCHEMA,
  DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT,
  readBoundedTriwikiAttention
} from '../triwiki-attention.js';
import {
  HUB_FILE,
  createProjectionFixture,
  removeProjectionFixture
} from '../../triwiki/context-graph/projections/__tests__/projection-fixtures.js';
import {
  createIndexedProjectionFixture,
  resetContextIndexCache
} from '../../triwiki/context-graph/projections/__tests__/projection-index-fixtures.js';

/**
 * The workspace now carries a published CRK2 generation, not a JSON snapshot
 * (CG2-13). That is the whole point of this file after the migration: this
 * consumer's wrapper never changed, so only an end-to-end call against a real
 * index can show that its anchors are still coming from somewhere real.
 */
async function withGraphWorkspace<T>(
  run: (root: string, fixtureHubId: string) => Promise<T>
): Promise<T> {
  const fixture = await createIndexedProjectionFixture({ fillerModules: 4 });
  try {
    return await run(fixture.root, fixture.hubFileNodeId);
  } finally {
    removeProjectionFixture(fixture.root);
  }
}

test('anchors come from a graph query and every one is grounded in provenance', async () => {
  await withGraphWorkspace(async (root) => {
    const attention = await readBoundedTriwikiAttention(root, 6, HUB_FILE);
    assert.equal(attention.schema, BOUNDED_TRIWIKI_ATTENTION_SCHEMA);
    assert.equal(attention.available, true);
    assert.equal(attention.reason, null);
    assert.equal(attention.profile, 'implementation');
    assert.ok(attention.snapshot_hash);
    assert.ok(attention.anchors.length > 0 && attention.anchors.length <= 6);
    for (const anchor of attention.anchors) {
      assert.ok(anchor.provenance.length > 0, `anchor ${anchor.id} has no provenance`);
      assert.ok(anchor.reason_path.length > 0, `anchor ${anchor.id} has no reason path`);
      assert.ok(anchor.token_cost >= 0);
      assert.ok(anchor.trust_score >= 0 && anchor.trust_score <= 1);
      assert.ok(['fresh', 'stale', 'unknown'].includes(anchor.freshness));
      for (const ref of anchor.provenance) {
        assert.ok(!path.isAbsolute(ref.path) && !ref.path.startsWith('~'), `leaky provenance path ${ref.path}`);
      }
    }
    assert.ok(attention.anchors.some((anchor) => anchor.id.includes(HUB_FILE)));
    assert.equal(attention.token_cost <= attention.token_budget, true);
  });
});

test('the bounded attention contract stays backward compatible for existing fields', async () => {
  await withGraphWorkspace(async (root) => {
    const attention = await readBoundedTriwikiAttention(root, 4, HUB_FILE);
    assert.equal(attention.hydration_policy, 'on_demand_only');
    assert.equal(attention.full_pack_injected, false);
    assert.equal(attention.anchor_limit, 4);
    assert.equal(typeof attention.attention_mode, 'string');
    const anchor = attention.anchors[0];
    assert.ok(anchor);
    assert.equal(typeof anchor.id, 'string');
    assert.ok(anchor.claim_hash === null || typeof anchor.claim_hash === 'string');
    assert.ok(anchor.source_hash === null || typeof anchor.source_hash === 'string');
    assert.ok(anchor.hydrate_hint === null || typeof anchor.hydrate_hint === 'string');
  });
});

test('the anchor limit is clamped to the bounded range', async () => {
  await withGraphWorkspace(async (root) => {
    const tooMany = await readBoundedTriwikiAttention(root, 500, HUB_FILE);
    assert.equal(tooMany.anchor_limit, 16);
    assert.ok(tooMany.anchors.length <= 16);
    const tooFew = await readBoundedTriwikiAttention(root, 0, HUB_FILE);
    assert.equal(tooFew.anchor_limit, 1);
    assert.ok(tooFew.anchors.length <= 1);
    const defaulted = await readBoundedTriwikiAttention(root, Number.NaN, HUB_FILE);
    assert.equal(defaulted.anchor_limit, DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT);
  });
});

test('a missing graph is reported explicitly instead of degrading to text matching', async () => {
  const fixture = createProjectionFixture({ fillerModules: 0 });
  resetContextIndexCache();
  try {
    const attention = await readBoundedTriwikiAttention(fixture.root, 8, HUB_FILE);
    assert.equal(attention.available, false);
    assert.equal(attention.reason, 'context_graph_missing');
    assert.equal(attention.repair_command, 'sks align run');
    assert.deepEqual(attention.anchors, []);
    assert.equal(attention.attention_mode, null);
    assert.equal(attention.profile, null);
  } finally {
    removeProjectionFixture(fixture.root);
  }
});

test('a stale graph is refused rather than answered from a lexical index', async () => {
  await withGraphWorkspace(async (root) => {
    // Staleness is now the preflight's source fingerprint disagreeing with the
    // pointer's, which is what "the index describes a tree that has moved" means
    // when there is no snapshot left to re-hash.
    const attention = await readBoundedTriwikiAttention(root, 8, HUB_FILE, {
      expectedSourceFingerprint: 'a-fingerprint-this-workspace-does-not-have'
    });
    assert.equal(attention.available, false);
    assert.equal(attention.reason, 'context_graph_stale');
    assert.deepEqual(attention.anchors, []);
    assert.equal(attention.repair_command, 'sks align run');
  });
});

test('a query that matches no graph node yields no anchors and says why', async () => {
  await withGraphWorkspace(async (root) => {
    const attention = await readBoundedTriwikiAttention(root, 8, 'zzzz');
    assert.equal(attention.available, false);
    assert.equal(attention.reason, 'context_graph_no_match');
    assert.deepEqual(attention.anchors, []);
  });
});

test('an empty goal produces no anchors instead of an arbitrary selection', async () => {
  await withGraphWorkspace(async (root) => {
    const attention = await readBoundedTriwikiAttention(root, 8, '   ');
    assert.equal(attention.available, false);
    assert.equal(attention.reason, 'empty_query');
    assert.deepEqual(attention.anchors, []);
  });
});

test('the retired lexical scorer is not present in the shipped module', () => {
  // Reads the compiled artifact next to this test, so the assertion is about what
  // actually ships rather than about a source file that may not be installed.
  const shipped = fs.readFileSync(fileURLToPath(new URL('../triwiki-attention.js', import.meta.url)), 'utf8');
  assert.ok(!shipped.includes('attentionRelevance'), 'the token-overlap scorer must not survive');
  assert.ok(!shipped.includes('attentionQueryTokens'), 'the query tokenizer must not survive');
});
