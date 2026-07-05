import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTriWikiAttention } from '../triwiki-attention.js';
import { createWrongnessRecord } from '../triwiki-wrongness/wrongness-schema.js';

test('buildTriWikiAttention is unchanged when codePackEntries is omitted (backward compatible)', () => {
  const withDefault = buildTriWikiAttention({ selected: [], wiki: {}, maxUse: 4, maxHydrate: 4 });
  const withEmpty = buildTriWikiAttention({ selected: [], wiki: {}, maxUse: 4, maxHydrate: 4, codePackEntries: [] });
  assert.deepEqual(withDefault, withEmpty);
  assert.deepEqual(withDefault.use_first, []);
  assert.deepEqual(withDefault.hydrate_first, []);
});

test('buildTriWikiAttention ranks code-pack entries into use_first/hydrate_first by trust_score within a dedicated token sub-budget', () => {
  const codePackEntries = [
    { id: 'code:low-trust', text: 'low trust module summary', trust_score: 0.5, token_cost: 10, citations: [{ path: 'src/low.ts' }] },
    { id: 'code:high-trust', text: 'high trust module summary', trust_score: 0.95, token_cost: 10, citations: [{ path: 'src/high.ts' }] },
    { id: 'code:too-expensive', text: 'x'.repeat(4000), trust_score: 0.99, token_cost: 5000, citations: [{ path: 'src/expensive.ts' }] }
  ];
  const attention = buildTriWikiAttention({ selected: [], wiki: {}, maxUse: 4, maxHydrate: 4, codePackEntries, codePackTokenBudget: 100 });
  const useIds = attention.use_first.map((row: any) => row[0]);
  assert.ok(useIds.includes('code:high-trust'), 'higher trust_score entry must be ranked in');
  assert.ok(useIds.includes('code:low-trust'), 'lower trust_score entry still fits the budget');
  assert.ok(!useIds.includes('code:too-expensive'), 'entry exceeding the token sub-budget must be excluded');
  assert.equal(useIds.indexOf('code:high-trust') < useIds.indexOf('code:low-trust'), true, 'higher trust_score must rank first');
  const hydrateIds = attention.hydrate_first.map((row: any) => row[0]);
  assert.ok(hydrateIds.includes('code:high-trust'));
  const hydrateRow = attention.hydrate_first.find((row: any) => row[0] === 'code:high-trust');
  assert.match(String(hydrateRow?.[1] || ''), /code_citations:src\/high\.ts/);
});

test('buildTriWikiAttention does not let code-pack entries crowd out policy-claim use_first rows', () => {
  const wiki = { anchors: [{ id: 'policy-claim-1', rgba: 'abc', h: 'hash1' }] };
  const selected = [{ id: 'policy-claim-1', text: 'a real policy claim', trust_score: 0.9, risk: 'low', status: 'supported' }];
  const codePackEntries = [{ id: 'code:module-a', text: 'module a summary', trust_score: 0.99, token_cost: 5, citations: [] }];
  const attention = buildTriWikiAttention({ selected, wiki, maxUse: 4, maxHydrate: 4, codePackEntries, codePackTokenBudget: 2000 });
  const useIds = attention.use_first.map((row: any) => row[0]);
  assert.ok(useIds.includes('policy-claim-1'), 'existing policy claim selection must be preserved');
  assert.ok(useIds.includes('code:module-a'), 'code entry is additive, not competing for the same maxUse slots');
});

test('buildTriWikiAttention ranks a wrongness-flagged module first and tags its hydrate row with the wrongness count (A-6)', () => {
  const codePackEntries = [
    { id: 'code:clean-module', text: 'clean module summary', trust_score: 0.99, token_cost: 10, citations: [{ path: 'src/clean.ts' }] },
    { id: 'code:buggy-module', text: 'buggy module summary', trust_score: 0.5, token_cost: 10, citations: [{ path: 'src/buggy.ts' }] }
  ];
  const attention = buildTriWikiAttention({
    selected: [], wiki: {}, maxUse: 4, maxHydrate: 4,
    codePackEntries, codePackTokenBudget: 2000,
    wrongnessByModule: { 'buggy-module': 3 }
  });
  const useIds = attention.use_first.map((row: any) => row[0]);
  // Despite lower trust_score, the past-wrongness module is ranked ahead of the clean one.
  assert.ok(useIds.indexOf('code:buggy-module') < useIds.indexOf('code:clean-module'), 'wrongness-flagged module must rank first');
  const buggyHydrate = attention.hydrate_first.find((row: any) => row[0] === 'code:buggy-module');
  assert.ok(buggyHydrate, 'wrongness-flagged module must have a hydrate row');
  assert.match(String(buggyHydrate?.[1] || ''), /wrongness:3/);
  // A clean module with no wrongness must not carry a wrongness signal.
  const cleanHydrate = attention.hydrate_first.find((row: any) => row[0] === 'code:clean-module');
  assert.doesNotMatch(String(cleanHydrate?.[1] || ''), /wrongness:/);
});

test('createWrongnessRecord derives module_ids from linked files that map to a known TriWiki module (A-6)', () => {
  const record = createWrongnessRecord({
    wrongness_kind: 'incorrect_claim',
    claim: { text: 'a wrong claim about the triwiki module' },
    links: { files: ['src/core/triwiki/triwiki-cache-key.ts'] }
  });
  assert.ok(Array.isArray(record.module_ids), 'expected module_ids to be derived');
  assert.ok(record.module_ids!.includes('triwiki'), `expected 'triwiki' module id, got ${JSON.stringify(record.module_ids)}`);
});

test('createWrongnessRecord omits module_ids when no linked file maps to a known module (backward compatible)', () => {
  const record = createWrongnessRecord({
    wrongness_kind: 'incorrect_claim',
    claim: { text: 'a wrong claim with no mappable files' },
    links: { files: ['some/unrelated/path/outside/any/module.txt'] }
  });
  assert.equal(record.module_ids, undefined);
});
