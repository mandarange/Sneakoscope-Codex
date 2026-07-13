import fsp from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from '../../fsx.js'

export async function writeVerifiedSuperSearchFixture(dir: string, ids: string[], name = 'verified-fixture') {
  const artifactDir = path.join(dir, 'research-test-super-search', name)
  await fsp.mkdir(path.join(artifactDir, 'url-content'), { recursive: true })
  const linkedSources = []
  for (const id of ids) {
    const content = `verified evidence for ${id}`
    const contentSha256 = sha256(content)
    const contentArtifact = `url-content/${contentSha256.slice(0, 16)}.txt`
    await fsp.writeFile(path.join(artifactDir, contentArtifact), content)
    linkedSources.push({
      source_id: id,
      acquisition_verdict: 'verified_content',
      content_artifact: contentArtifact,
      content_sha256: contentSha256,
      content_length: content.length
    })
  }
  const sourceLedgerArtifact = path.relative(dir, path.join(artifactDir, 'source-ledger.json'))
  const proofArtifact = path.relative(dir, path.join(artifactDir, 'super-search-proof.json'))
  const sourceLedgerText = JSON.stringify({ schema: 'sks.super-search-source-ledger.v1', sources: linkedSources })
  const proofText = JSON.stringify({
    schema: 'sks.super-search-proof.v1',
    ok: true,
    verified_source_count: linkedSources.length,
    blockers: []
  })
  await fsp.writeFile(path.join(dir, sourceLedgerArtifact), sourceLedgerText)
  await fsp.writeFile(path.join(dir, proofArtifact), proofText)
  const proofSha256 = sha256(proofText)
  const sourceLedgerSha256 = sha256(sourceLedgerText)
  return linkedSources.map((source) => ({
    id: source.source_id,
    acquisition_verdict: 'verified_content',
    credibility: 'verified_content:1.00',
    content_artifact: source.content_artifact,
    content_sha256: source.content_sha256,
    content_length: source.content_length,
    super_search_provenance: {
      schema: 'sks.research-super-search-source-provenance.v1',
      source_id: source.source_id,
      layer_id: 'test',
      proof_artifact: proofArtifact,
      proof_sha256: proofSha256,
      source_ledger_artifact: sourceLedgerArtifact,
      source_ledger_sha256: sourceLedgerSha256,
      validated: true,
      blockers: []
    }
  }))
}
