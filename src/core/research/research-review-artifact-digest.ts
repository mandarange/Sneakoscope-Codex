import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, sha256 } from '../fsx.js'

export const RESEARCH_REVIEW_DIGEST_SCHEMA = 'sks.research-review-artifact-digest.v1' as const

export interface ResearchReviewArtifactDigest {
  schema: typeof RESEARCH_REVIEW_DIGEST_SCHEMA
  generated_at: string
  artifacts: Array<{
    artifact: string
    sha256: string | null
    bytes: number
  }>
  bundle_sha256: string
  blockers: string[]
}

export async function buildResearchReviewArtifactDigest(dir: string, plan: any): Promise<ResearchReviewArtifactDigest> {
  const artifacts = researchReviewArtifactNames(plan)
  const blockers: string[] = []
  const rows = await Promise.all(artifacts.map(async (artifact) => {
    const file = path.join(dir, artifact)
    const content = await fsp.readFile(file).catch(() => null)
    if (!content) {
      blockers.push(`research_review_artifact_missing:${artifact}`)
      return { artifact, sha256: null, bytes: 0 }
    }
    if (content.length === 0) blockers.push(`research_review_artifact_empty:${artifact}`)
    return {
      artifact,
      sha256: sha256(content),
      bytes: content.length
    }
  }))
  return {
    schema: RESEARCH_REVIEW_DIGEST_SCHEMA,
    generated_at: nowIso(),
    artifacts: rows,
    bundle_sha256: sha256(JSON.stringify(rows.map(({ artifact, sha256: digest, bytes }) => ({ artifact, sha256: digest, bytes })))),
    blockers: [...new Set(blockers)]
  }
}

export function validateResearchReviewArtifactDigest(recorded: any, current: ResearchReviewArtifactDigest): string[] {
  const blockers: string[] = []
  if (recorded?.schema !== RESEARCH_REVIEW_DIGEST_SCHEMA) blockers.push('research_review_artifact_digest_schema_invalid')
  if (!String(recorded?.bundle_sha256 || '').trim()) blockers.push('research_review_artifact_bundle_sha256_missing')
  if (String(recorded?.bundle_sha256 || '') !== current.bundle_sha256) blockers.push('research_review_artifact_bundle_sha256_mismatch')
  const recordedRows = new Map((Array.isArray(recorded?.artifacts) ? recorded.artifacts : [])
    .map((row: any) => [String(row?.artifact || ''), row]))
  for (const currentRow of current.artifacts) {
    const recordedRow: any = recordedRows.get(currentRow.artifact)
    if (!recordedRow) {
      blockers.push(`research_review_artifact_digest_entry_missing:${currentRow.artifact}`)
      continue
    }
    if (String(recordedRow?.sha256 || '') !== String(currentRow.sha256 || '')) {
      blockers.push(`research_review_artifact_sha256_mismatch:${currentRow.artifact}`)
    }
    if (Number(recordedRow?.bytes || 0) !== currentRow.bytes) {
      blockers.push(`research_review_artifact_size_mismatch:${currentRow.artifact}`)
    }
  }
  blockers.push(...current.blockers)
  return [...new Set(blockers)]
}

export function researchReviewArtifactNames(plan: any): string[] {
  const configuredPaper = plan?.artifacts?.research_paper || plan?.paper_artifact || 'research-paper.md'
  return [
    'research-report.md',
    path.basename(String(configuredPaper)),
    'source-ledger.json',
    'claim-evidence-matrix.json'
  ]
}
