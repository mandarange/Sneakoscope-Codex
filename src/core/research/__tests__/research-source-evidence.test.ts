import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readJson, sha256 } from '../../fsx.js'
import { mergeResearchSourceShards } from '../research-source-ledger-merge.js'
import { eligibleResearchSourceIdSet, validateResearchSourceProvenance } from '../research-source-evidence.js'
import { writeVerifiedSuperSearchFixture } from './research-source-evidence-fixture.js'

test('real Research source eligibility requires correlated Super Search proof, ledger, and hydrated content', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-source-evidence-'))
  const sources = await writeVerifiedSuperSearchFixture(dir, ['source-1'], 'valid')
  const eligible = await eligibleResearchSourceIdSet(dir, { sources, counterevidence_sources: [] }, 'real')
  assert.deepEqual([...eligible], ['source-1'])
})

test('real Research rejects a self-declared verified row without linked Super Search artifacts', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-source-forged-'))
  const forged = {
    id: 'forged-source',
    acquisition_verdict: 'verified_content',
    credibility: 'verified_content:1.00',
    content_artifact: 'verified-content/forged.txt',
    content_sha256: 'a'.repeat(64),
    content_length: 100
  }
  const eligible = await eligibleResearchSourceIdSet(dir, { sources: [forged], counterevidence_sources: [] }, 'real')
  assert.equal(eligible.size, 0)
})

test('real Research rejects blocked proof and source/hash mismatches even when provenance says validated', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-source-tamper-'))
  const source = (await writeVerifiedSuperSearchFixture(dir, ['source-1'], 'tamper'))[0]!
  const proofPath = path.join(dir, source.super_search_provenance.proof_artifact)
  const blockedProof = JSON.stringify({ schema: 'sks.super-search-proof.v1', ok: false, blockers: ['provider_independence_missing'] })
  await fsp.writeFile(proofPath, blockedProof)
  source.super_search_provenance.proof_sha256 = sha256(blockedProof)
  const blocked = await validateResearchSourceProvenance(dir, source)
  assert.equal(blocked.ok, false)
  assert.ok(blocked.blockers.includes('research_source_proof_blocked:source-1'))

  const mismatched = (await writeVerifiedSuperSearchFixture(dir, ['source-2'], 'mismatch'))[0]!
  mismatched.content_sha256 = 'f'.repeat(64)
  const mismatch = await validateResearchSourceProvenance(dir, mismatched)
  assert.equal(mismatch.ok, false)
  assert.ok(mismatch.blockers.includes('research_source_content_sha_mismatch:source-2'))
})

test('source shard merge persists per-run digests and source-specific validated provenance', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-source-merge-'))
  const verified = (await writeVerifiedSuperSearchFixture(dir, ['source-1'], 'merge'))[0]!
  const shardDir = path.join(dir, 'research', 'cycle-1', 'source-shards')
  await fsp.mkdir(shardDir, { recursive: true })
  await fsp.writeFile(path.join(shardDir, 'academic_literature.json'), JSON.stringify({
    schema: 'sks.research-source-shard-output.v1',
    mission_id: 'M-source-merge',
    cycle: 1,
    layer_id: 'academic_literature',
    queries: [{ query: 'bounded query', rationale: 'fixture' }],
    sources: [{
      id: verified.id,
      layer: 'academic_literature',
      kind: 'known_url',
      title: 'Verified source',
      locator: 'https://example.com/source-1',
      publisher_or_author: 'Example',
      accessed_at: '2026-07-14T00:00:00.000Z',
      reliability: 'high',
      credibility: verified.credibility,
      stance: 'context',
      claim_ids: ['source-claim-1'],
      notes: 'Hydrated evidence.',
      content_artifact: verified.content_artifact,
      content_sha256: verified.content_sha256,
      content_length: verified.content_length,
      acquisition_verdict: verified.acquisition_verdict
    }],
    blockers: [],
    super_search: {
      schema: 'sks.research-super-search-link.v1',
      result_artifact: 'unused.json',
      proof_artifact: verified.super_search_provenance.proof_artifact,
      source_ledger_artifact: verified.super_search_provenance.source_ledger_artifact,
      claim_ledger_artifact: 'unused.json',
      proof_ok: true,
      verified_sources: 1,
      provider_independent: false,
      verified_provider_families: ['web'],
      verified_independence_clusters: ['example.com'],
      query_execution: {}
    }
  }))
  await mergeResearchSourceShards({ dir, cycle: 1, plan: { mission_id: 'M-source-merge' } })
  const ledger = await readJson<any>(path.join(dir, 'source-ledger.json'), null)
  assert.equal(ledger.sources[0]?.super_search_provenance?.validated, true)
  assert.match(ledger.sources[0]?.super_search_provenance?.proof_sha256 || '', /^[a-f0-9]{64}$/)
  assert.equal(ledger.super_search_runs[0]?.validated, true)
})
