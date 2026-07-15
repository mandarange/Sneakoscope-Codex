import fs from 'node:fs'
import path from 'node:path'
import {
  HEAD_BINDING_MODE,
  RELEASE_630_MISSION_ID,
  RELEASE_CLOSURE_MANIFEST_SCHEMA,
  RELEASE_CLOSURE_SCHEMA,
  WORK_ORDER_SHA256,
  type ReleaseClosureInput,
  type ReleaseClosureManifestInput
} from './release-closure-contract.js'
import {
  attachmentTruth,
  deletionTruth,
  fileLineCount,
  fileSha256,
  flattenFindingProofs,
  flattenWorkOrderEvidence,
  positiveLineCount,
  readJson,
  readJsonl,
  relative,
  requiredArtifactPaths,
  sameSet,
  sha40,
  sha256,
  sourceCommitBound,
  trackedBlobMatches,
  unique,
  validatePostSourceCommitDiff
} from './release-closure-helpers.js'
import {
  validateDeletion,
  validateFindings,
  validateMission,
  validateOfficialThreads,
  validateReleaseLedger
} from './release-closure-validation.js'

export {
  RELEASE_630_MISSION_ID,
  RELEASE_CLOSURE_MANIFEST_SCHEMA,
  RELEASE_CLOSURE_SCHEMA
} from './release-closure-contract.js'
export type { ReleaseClosureInput, ReleaseClosureManifestInput } from './release-closure-contract.js'

export function releaseClosureManifestPath(root: string, version: string) {
  return path.join(root, '.sneakoscope', 'release', version, 'release-closure.json')
}

export function inspectReleaseClosure(input: ReleaseClosureInput) {
  const blockers: string[] = []
  const expectedMissionId = input.expectedMissionId || RELEASE_630_MISSION_ID
  const manifestFile = releaseClosureManifestPath(input.root, input.version)
  const manifestRel = relative(input.root, manifestFile)
  const manifest = readJson(manifestFile)
  const expectedWorkOrderSha256 = input.expectedWorkOrderSha256 || WORK_ORDER_SHA256

  if (input.version !== '6.3.0') blockers.push(`contract_unsupported:${input.version || 'missing'}`)
  if (!sha40(input.expectedBaseline)) blockers.push('expected_baseline_invalid')
  if (!sha40(input.expectedHead)) blockers.push('expected_head_invalid')
  if (!manifest || manifest.schema !== RELEASE_CLOSURE_MANIFEST_SCHEMA) blockers.push('closure_manifest_missing_or_invalid')
  if (manifest?.version !== input.version) blockers.push('closure_manifest_version_mismatch')
  if (manifest?.baseline !== input.expectedBaseline) blockers.push('closure_manifest_baseline_mismatch')
  if (manifest?.mission_id !== expectedMissionId) blockers.push(`mission_id_mismatch:${String(manifest?.mission_id || 'missing')}`)
  if (manifest?.head_binding !== HEAD_BINDING_MODE) blockers.push('closure_manifest_head_binding_invalid')
  const sourceCommit = String(manifest?.source_commit || '')
  if (!sourceCommitBound(input.root, sourceCommit, input.expectedBaseline, input.expectedHead)) blockers.push('closure_source_commit_unbound')
  validatePostSourceCommitDiff(input.root, sourceCommit, input.expectedHead, input.version, blockers)

  const manifestHash = fileSha256(manifestFile)
  if (!manifestHash) blockers.push('closure_manifest_hash_unavailable')
  if (!trackedBlobMatches(input.root, input.expectedHead, manifestRel, manifestHash)) blockers.push('closure_manifest_not_exact_head_blob')

  const paths = requiredArtifactPaths(input.version, expectedMissionId)
  for (const [key, spec] of Object.entries(paths)) {
    const entry = manifest?.artifacts?.[key]
    if (!entry || entry.path !== spec.path || !sha256(entry.sha256) || !positiveLineCount(entry.line_count)) {
      blockers.push(`closure_artifact_manifest_invalid:${key}`)
      continue
    }
    const artifactFile = path.join(input.root, spec.path)
    const actual = fileSha256(artifactFile)
    const actualLineCount = fileLineCount(artifactFile)
    if (!actual || actual !== entry.sha256) blockers.push(`closure_artifact_hash_mismatch:${key}`)
    if (actualLineCount !== entry.line_count) blockers.push(`closure_artifact_line_count_mismatch:${key}`)
    if (entry.schema !== spec.schema) blockers.push(`closure_artifact_schema_contract_mismatch:${key}`)
    if (spec.schema && key !== 'events') {
      const artifact = readJson(artifactFile)
      if (artifact?.schema !== spec.schema) blockers.push(`closure_artifact_schema_invalid:${key}`)
    }
    if ((key === 'findings' || key === 'deletion')
      && !trackedBlobMatches(input.root, input.expectedHead, spec.path, actual)) blockers.push(`closure_artifact_not_exact_head_blob:${key}`)
  }
  if (!sameSet(Object.keys(manifest?.artifacts || {}), Object.keys(paths))) blockers.push('closure_artifact_set_invalid')

  const findings = readJson(path.join(input.root, paths.findings.path))
  validateFindings(input.root, findings, manifest, sourceCommit, expectedMissionId, input.expectedBaseline, blockers)

  const mission = readJson(path.join(input.root, paths.mission.path))
  validateMission(mission, sourceCommit, expectedMissionId, blockers)
  const plan = readJson(path.join(input.root, paths.plan.path))
  const rawEvents = readJsonl(path.join(input.root, paths.events.path))
  const parent = readJson(path.join(input.root, paths.parent_summary.path))
  const evidence = readJson(path.join(input.root, paths.evidence.path))
  const summary = readJson(path.join(input.root, paths.summary.path))
  const gate = readJson(path.join(input.root, paths.gate.path))
  const ssot = readJson(path.join(input.root, paths.ssot.path))
  validateOfficialThreads(input.root, { plan, rawEvents, parent, evidence, summary, gate, ssot, missionId: expectedMissionId }, blockers)

  const ledger = readJson(path.join(input.root, paths.ledger.path))
  validateReleaseLedger(input.root, ledger, manifest, sourceCommit, expectedMissionId, expectedWorkOrderSha256, blockers)

  const deletion = readJson(path.join(input.root, paths.deletion.path))
  validateDeletion(input.root, deletion, manifest, sourceCommit, input.expectedBaseline, blockers)

  return {
    schema: RELEASE_CLOSURE_SCHEMA,
    ok: blockers.length === 0,
    version: input.version,
    head: sha40(input.expectedHead) ? input.expectedHead : null,
    source_commit: sha40(sourceCommit) ? sourceCommit : null,
    mission_id: expectedMissionId,
    manifest_path: manifestRel,
    manifest_sha256: manifestHash,
    blockers: unique(blockers)
  }
}

export function buildReleaseClosureManifest(input: ReleaseClosureManifestInput) {
  const missionId = input.missionId || RELEASE_630_MISSION_ID
  const paths = requiredArtifactPaths(input.version, missionId)
  const artifacts: Record<string, { path: string; sha256: string | null; line_count: number | null; schema: string | null }> = {}
  for (const [key, spec] of Object.entries(paths)) {
    const artifactFile = path.join(input.root, spec.path)
    artifacts[key] = {
      path: spec.path,
      sha256: fileSha256(artifactFile),
      line_count: fileLineCount(artifactFile),
      schema: spec.schema
    }
  }
  const findings = readJson(path.join(input.root, paths.findings.path))
  const ledger = readJson(path.join(input.root, paths.ledger.path))
  const attachment = attachmentTruth(ledger)
  const deletion = deletionTruth(input.root, input.baseline, input.sourceCommit)
  return {
    schema: RELEASE_CLOSURE_MANIFEST_SCHEMA,
    version: input.version,
    baseline: input.baseline,
    source_commit: input.sourceCommit,
    mission_id: missionId,
    head_binding: HEAD_BINDING_MODE,
    artifacts,
    finding_proofs: flattenFindingProofs(findings),
    work_order_evidence: flattenWorkOrderEvidence(ledger),
    source_attachment: attachment.ok ? attachment.manifest : null,
    deletion_truth: deletion.ok ? deletion.manifest : null,
    generated_at: new Date().toISOString()
  }
}

export function writeReleaseClosureManifest(input: ReleaseClosureManifestInput) {
  const output = releaseClosureManifestPath(input.root, input.version)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(buildReleaseClosureManifest(input), null, 2)}\n`)
  return output
}
