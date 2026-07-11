import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { contextCapsule } from '../triwiki-attention.js';
import { loadTriWikiRuntimeContext, triWikiContextBlock } from '../triwiki-runtime.js';
import { validateWikiCoordinateIndex } from '../wiki-coordinate.js';
import { writeWikiContextPack } from '../commands/wiki-command.js';
import { sealTriWikiContextPack } from '../triwiki-provenance.js';

async function writePack(root: string, pack: unknown) {
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(pack, null, 2)}\n`);
}

test('runtime rejects coordinate-only legacy or structurally incomplete packs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-runtime-invalid-'));
  try {
    await writePack(root, {
      mission: 'legacy',
      attention: { use_first: [], hydrate_first: [] },
      claims: [],
      wiki: { schema: 'sks.wiki-coordinate.v1', ch: 'legacy', a: [] }
    });
    const context = await loadTriWikiRuntimeContext(root);
    assert.equal(context.present, false);
    assert.match(String(context.warning), /vx_missing/);
    assert.match(triWikiContextBlock(context), /do not rely on cached project memory/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('runtime accepts a validated coordinate plus voxel context pack', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-runtime-valid-'));
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const sourceBacked = true;\n');
    const pack = sealTriWikiContextPack(contextCapsule({
      mission: { id: 'runtime-valid', coord: { rgba: [48, 132, 212, 240] } },
      claims: [{ id: 'claim-a', text: 'source-backed claim', source: 'src/a.ts', authority: 'code', status: 'supported', freshness: 'fresh', risk: 'low', evidence_count: 2, trust_score: 0.95 }],
      budget: { maxClaims: 1, maxWikiAnchors: 1, includeTrustSummary: true }
    }), { root });
    await writePack(root, pack);
    const context = await loadTriWikiRuntimeContext(root);
    assert.equal(context.present, true);
    assert.equal(context.anchor_count, 1);
    assert.equal(context.claim_count, 1);
    assert.match(String(context.context_pack_hash), /^[0-9a-f]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('runtime rejects a coordinate plus voxel pack whose hydration source is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-runtime-missing-source-'));
  try {
    const pack = sealTriWikiContextPack(contextCapsule({
      mission: { id: 'runtime-missing-source', coord: { rgba: [48, 132, 212, 240] } },
      claims: [{ id: 'claim-a', text: 'stale source claim', source: 'src/missing.ts', file: 'src/missing.ts', authority: 'code', status: 'supported', freshness: 'fresh', risk: 'high', evidence_count: 2, trust_score: 0.95 }],
      budget: { maxClaims: 1, maxWikiAnchors: 1, includeTrustSummary: true }
    }), { root });
    await writePack(root, pack);
    const context = await loadTriWikiRuntimeContext(root);
    assert.equal(context.present, false);
    assert.match(String(context.warning), /hydration_path_missing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('runtime fails closed when context-pack provenance is missing or tampered', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-runtime-provenance-'));
  try {
    const base = contextCapsule({
      mission: { id: 'runtime-provenance', coord: { rgba: [48, 132, 212, 240] } },
      claims: [{ id: 'claim-a', text: 'sealed claim', authority: 'code', status: 'supported', freshness: 'fresh', risk: 'low', evidence_count: 2, trust_score: 0.95 }],
      budget: { maxClaims: 1, maxWikiAnchors: 1, includeTrustSummary: true }
    });
    await writePack(root, base);
    const missing = await loadTriWikiRuntimeContext(root);
    assert.equal(missing.present, false);
    assert.match(String(missing.warning), /context_pack_provenance_missing/);

    const sealed = sealTriWikiContextPack(base, { root });
    sealed.provenance.generated_at = '2020-01-01T00:00:00.000Z';
    await writePack(root, sealed);
    const tampered = await loadTriWikiRuntimeContext(root);
    assert.equal(tampered.present, false);
    assert.match(String(tampered.warning), /context_pack_payload_sha256_mismatch/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('consumer-project refresh fixture without src/core uses managed local hydration citations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-triwiki-consumer-project-'));
  try {
    await fs.writeFile(path.join(root, 'AGENTS.md'), '# Managed SKS policy\nTriWiki uses active recall, wrongness memory, and current documentation evidence.\n');
    await fs.mkdir(path.join(root, '.agents', 'skills', 'wiki'), { recursive: true });
    await fs.writeFile(path.join(root, '.agents', 'skills', 'wiki', 'SKILL.md'), '# Wiki\nUse Voxel TriWiki attention and hydration.\n');
    await fs.mkdir(path.join(root, '.sneakoscope', 'memory'), { recursive: true });
    await fs.writeFile(path.join(root, '.sneakoscope', 'policy.json'), '{"version":"6.1.0"}\n');
    await assert.rejects(fs.access(path.join(root, 'src', 'core')));

    const { pack } = await writeWikiContextPack(root, [], { dryRun: true });
    const validation = validateWikiCoordinateIndex(pack.wiki, { root });
    assert.equal(validation.ok, true, JSON.stringify(validation.issues));
    const realRoot = await fs.realpath(root);
    for (const row of pack.wiki.a) {
      const citation = row[8];
      assert.equal(typeof citation, 'string', `anchor ${row[0]} must keep a local hydration citation`);
      const realCitation = await fs.realpath(path.resolve(root, citation));
      const relative = path.relative(realRoot, realCitation);
      assert.ok(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)), `anchor ${row[0]} escaped the consumer root`);
      assert.doesNotMatch(citation, /^src[\\/]core[\\/]/, `anchor ${row[0]} must not require engine source in a consumer project`);
    }

    await writePack(root, pack);
    const context = await loadTriWikiRuntimeContext(root);
    assert.equal(context.present, true, context.warning || undefined);
    assert.equal(context.anchor_count, pack.wiki.a.length);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
