import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { contextCapsule } from '../triwiki-attention.js';
import { writeValidatedWikiContextPack } from '../commands/wiki-command.js';
import { loadTriWikiRuntimeContext } from '../triwiki-runtime.js';
import { validateWikiCoordinateIndex } from '../wiki-coordinate.js';
import {
  sealTriWikiContextPack,
  validateTriWikiContextPackProvenance
} from '../triwiki-provenance.js';

function fixturePack(sourcePath: string | null = null) {
  return contextCapsule({
    mission: { id: 'provenance-fixture', coord: { rgba: [48, 132, 212, 240] } },
    claims: [{
      id: 'claim-a',
      text: 'source-backed compact claim',
      authority: 'code',
      status: 'supported',
      freshness: 'fresh',
      risk: 'low',
      evidence_count: 2,
      trust_score: 0.95,
      ...(sourcePath ? { source: sourcePath, file: sourcePath } : {})
    }],
    budget: { maxClaims: 1, maxWikiAnchors: 1, includeTrustSummary: true }
  });
}

test('coordinate validation binds anchor hashes to available compact claims', () => {
  const pack = fixturePack();
  assert.equal(validateWikiCoordinateIndex(pack.wiki, { claims: pack.claims }).ok, true);

  const tampered = structuredClone(pack);
  tampered.wiki.a[0][7] = '0000000000000000';
  const result = validateWikiCoordinateIndex(tampered.wiki, { claims: tampered.claims });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue: any) => issue.id === 'anchor_hash_mismatch'));
});

test('nine-anchor positive recall packs hash the emitted text in compact and verbose modes', () => {
  const claims = Array.from({ length: 9 }, (_, index) => ({
    id: `wiki-eval-${index + 1}`,
    text: index === 4
      ? 'Unsupported TriWiki memory must never be used without source hydration.'
      : `Supported source-backed claim ${index + 1}`,
    authority: 'code',
    status: 'supported',
    freshness: 'fresh',
    risk: index === 4 ? 'high' : 'low',
    evidence_count: 2,
    trust_score: 0.95,
    required_weight: 2 - (index / 10)
  }));

  for (const verboseWiki of [false, true]) {
    const pack = contextCapsule({
      mission: { id: `nine-anchor-${verboseWiki ? 'verbose' : 'compact'}`, coord: { rgba: [48, 132, 212, 240] } },
      claims,
      budget: {
        maxClaims: 9,
        maxWikiAnchors: 9,
        maxAttentionUse: 9,
        maxAttentionHydrate: 9,
        verboseWiki,
        verboseClaims: verboseWiki,
        includeTrustSummary: true
      }
    });
    const rewritten = pack.claims.find((claim: any) => claim.id === 'wiki-eval-5');
    assert.ok(rewritten);
    assert.equal(rewritten.text_policy, 'positive_recall_negation_suppressed');
    assert.doesNotMatch(String(rewritten.text || ''), /unsupported|must never/i);
    assert.equal(validateWikiCoordinateIndex(pack.wiki, { claims: pack.claims }).ok, true);
    assert.ok(pack.attention.hydrate_first.some((row: any[]) => row[0] === 'wiki-eval-5' && String(row[1]).includes('negative_priming')));

    const sealed = sealTriWikiContextPack(pack, { generatedAt: '2026-07-14T00:00:00.000Z', root: process.cwd() });
    const roundTrip = JSON.parse(JSON.stringify(sealed));
    assert.equal(validateTriWikiContextPackProvenance(roundTrip, { root: process.cwd() }).ok, true);
    assert.equal(validateWikiCoordinateIndex(roundTrip.wiki, { claims: roundTrip.claims }).ok, true);
  }
});

test('context-pack provenance detects payload, source manifest, and missing provenance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-provenance-'));
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const source = true;\n');
    const withJsonOmittedValue = { ...fixturePack('src/a.ts'), omitted_by_json: undefined };
    const sealed = sealTriWikiContextPack(withJsonOmittedValue, { generatedAt: '2026-07-11T00:00:00.000Z', root });
    assert.equal(validateTriWikiContextPackProvenance(sealed, { root }).ok, true);
    assert.equal(validateTriWikiContextPackProvenance(JSON.parse(JSON.stringify(sealed)), { root }).ok, true, 'persisted JSON round-trip must preserve the provenance digest');

    const payloadTamper = structuredClone(sealed);
    payloadTamper.role = 'tampered';
    assert.ok(validateTriWikiContextPackProvenance(payloadTamper, { root }).issues.some((issue: any) => issue.id === 'context_pack_payload_sha256_mismatch'));

    const sourceTamper = structuredClone(sealed);
    sourceTamper.provenance.source_manifest.entries[0].sha256 = '0'.repeat(64);
    const sourceIssues = validateTriWikiContextPackProvenance(sourceTamper, { root }).issues;
    assert.ok(sourceIssues.some((issue: any) => issue.id === 'context_pack_source_snapshot_mismatch'));
    assert.ok(sourceIssues.some((issue: any) => issue.id === 'context_pack_payload_sha256_mismatch'));

    const { provenance: _provenance, ...missing } = sealed;
    assert.ok(validateTriWikiContextPackProvenance(missing, { root }).issues.some((issue: any) => issue.id === 'context_pack_provenance_missing'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('invalid context-pack candidate never overwrites the valid predecessor', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-transaction-'));
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  try {
    const predecessor = sealTriWikiContextPack(fixturePack(), { generatedAt: '2026-07-11T00:00:00.000Z', root });
    const first = await writeValidatedWikiContextPack(file, predecessor, root);
    assert.equal(first.written, true);
    const predecessorBytes = await fs.readFile(file, 'utf8');

    const invalidBase = fixturePack();
    const invalidClaim = invalidBase.claims[0];
    assert.ok(invalidClaim);
    invalidClaim.text = 'claim text changed without rebuilding its anchor';
    const invalid = sealTriWikiContextPack(invalidBase, { generatedAt: '2026-07-11T00:01:00.000Z', root });
    const rejected = await writeValidatedWikiContextPack(file, invalid, root);
    assert.equal(rejected.written, false);
    assert.ok(rejected.validation.result.issues.some((issue: any) => issue.id === 'anchor_hash_mismatch'));
    assert.equal(await fs.readFile(file, 'utf8'), predecessorBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('runtime invalidates cited source byte changes but ignores dynamic mission churn', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-source-bytes-'));
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-fixture'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const source = 1;\n');
    await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-fixture', 'mission.json'), '{"revision":1}\n');
    const pack = contextCapsule({
      mission: { id: 'source-byte-fixture', coord: { rgba: [48, 132, 212, 240] } },
      claims: [
        { id: 'source-claim', text: 'authoritative source claim', source: 'src/a.ts', file: 'src/a.ts', authority: 'code', status: 'supported', freshness: 'fresh', risk: 'high', evidence_count: 2, trust_score: 0.95, required_weight: 1.4 },
        { id: 'mission-signal', text: 'dynamic mission preference signal', source: '.sneakoscope/missions', file: '.sneakoscope/missions', authority: 'wiki', status: 'supported', freshness: 'fresh', risk: 'medium', evidence_count: 2, trust_score: 0.9, required_weight: 1.2 }
      ],
      budget: { maxClaims: 2, maxWikiAnchors: 2, includeTrustSummary: true }
    });
    const sealed = sealTriWikiContextPack(pack, { root });
    assert.deepEqual(sealed.provenance.source_manifest.citations, ['src/a.ts']);
    assert.deepEqual(sealed.provenance.source_manifest.excluded_dynamic_citations, ['.sneakoscope/missions']);
    assert.ok(sealed.provenance.source_manifest.excluded_dynamic_prefixes.includes('.sneakoscope/missions'));
    assert.equal((await writeValidatedWikiContextPack(file, sealed, root)).written, true);
    assert.equal((await loadTriWikiRuntimeContext(root)).present, true);

    await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-fixture', 'mission.json'), '{"revision":2}\n');
    assert.equal((await loadTriWikiRuntimeContext(root)).present, true, 'dynamic mission artifacts must not stale the source manifest');

    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const source = 2;\n');
    const stale = await loadTriWikiRuntimeContext(root);
    assert.equal(stale.present, false);
    assert.match(String(stale.warning), /context_pack_source_bytes_mismatch/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
