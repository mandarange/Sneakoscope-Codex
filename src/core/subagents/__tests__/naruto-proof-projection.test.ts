import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  buildNarutoProofProjection,
  projectNarutoProofSnapshot,
  readNarutoProofArtifactSnapshot,
  validateNarutoProofStatus
} from '../naruto-proof-projection.js'
import {
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  buildSubagentEvidence
} from '../subagent-evidence.js'
import {
  NARUTO_GATE_FILENAME,
  NARUTO_RESULT_SCHEMA,
  NARUTO_SUMMARY_FILENAME,
  SUBAGENT_PLAN_FILENAME
} from '../official-subagent-preparation.js'
import { createSubagentWaveLifecycle } from '../wave-lifecycle.js'
import { sha256 } from '../../fsx.js'
import { HOST_CAPABILITY_DESCRIPTORS, hostCapabilityDigest } from '../../agent-bridge/agent-manifest.js'

type FixtureStatus = 'completed' | 'blocked' | 'incomplete'

const MISSION_ID = 'M-proof-projection-fixture'
const RUN_ID = 'naruto-proof-projection-fixture-1'
const SHA256_A = `sha256:${'a'.repeat(64)}`
const SHA256_B = `sha256:${'b'.repeat(64)}`

test('completed fixture projects validated parent result and a deterministic byte-bound fingerprint', async () => {
  const dir = await writeProofFixture('completed')
  try {
    const first = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    const second = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(first.status, 'completed')
    assert.equal(first.ok, true)
    assert.equal(first.workflow_run_id, RUN_ID)
    assert.equal(first.result.summary, 'fixture complete')
    assert.deepEqual(first.result.changed_files, ['src/example.ts'])
    assert.deepEqual(first.result.verification, [{ name: 'test', status: 'passed' }])
    assert.match(first.proof_fingerprint, /^sha256:[a-f0-9]{64}$/)
    assert.equal(first.proof_fingerprint, second.proof_fingerprint)
    assert.ok(Array.isArray(first.blockers))
    assert.deepEqual(first.blockers, [])
    assert.deepEqual(validateNarutoProofStatus(first), [])

    await fsp.appendFile(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME), '\n')
    const byteChanged = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(byteChanged.status, 'completed')
    assert.notEqual(byteChanged.proof_fingerprint, first.proof_fingerprint)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('dynamic automatic projection binds initial request, policy, and effective four-thread target', async () => {
  const dir = await writeProofFixture('completed', { dynamicThreadCount: 4 })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'completed')
    assert.equal((proof.evidence as any).requested_subagents, 2)
    assert.equal((proof.evidence as any).count_policy, 'dynamic_automatic')
    assert.equal((proof.evidence as any).target_subagents, 4)
    assert.equal((proof.gate as any).target_subagents, 4)
    assert.equal((proof.summary as any).target_subagents, 4)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('dynamic automatic projection ignores stale-run starts when computing its effective target', async () => {
  const dir = await writeProofFixture('completed', {
    dynamicThreadCount: 2,
    staleRunThreadCount: 2
  })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'completed')
    assert.equal((proof.evidence as any).requested_subagents, 2)
    assert.equal((proof.evidence as any).target_subagents, 2)
    assert.equal((proof.evidence as any).started_threads, 2)
    assert.equal((proof.evidence as any).rejected_stale_events, 4)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('legacy automatic artifacts without count fields inherit the plan lifecycle contract', async () => {
  const dir = await writeProofFixture('completed', { dynamicThreadCount: 4 })
  try {
    for (const filename of [SUBAGENT_EVIDENCE_FILENAME, NARUTO_SUMMARY_FILENAME, NARUTO_GATE_FILENAME]) {
      const artifact = JSON.parse(await fsp.readFile(path.join(dir, filename), 'utf8'))
      delete artifact.count_policy
      delete artifact.target_subagents
      await writeJson(path.join(dir, filename), artifact)
    }

    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'completed')
    assert.equal(proof.ok, true)
    assert.equal((proof.evidence as any).count_policy, 'dynamic_automatic')
    assert.equal((proof.evidence as any).target_subagents, 4)
    assert.equal((proof.summary as any).count_policy, 'dynamic_automatic')
    assert.equal((proof.gate as any).target_subagents, 4)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('blocked and incomplete source fixtures preserve the three-state proof contract', async () => {
  const blockedDir = await writeProofFixture('blocked')
  const incompleteDir = await writeProofFixture('incomplete')
  try {
    const blocked = await buildNarutoProofProjection({ artifactDir: blockedDir, missionId: MISSION_ID })
    const incomplete = await buildNarutoProofProjection({ artifactDir: incompleteDir, missionId: MISSION_ID })
    assert.equal(blocked.status, 'blocked')
    assert.equal(blocked.ok, false)
    assert.equal(incomplete.status, 'incomplete')
    assert.equal(incomplete.ok, false)
    assert.ok(Array.isArray(blocked.blockers))
    assert.ok(Array.isArray(incomplete.blockers))
    assert.match(blocked.proof_fingerprint, /^sha256:[a-f0-9]{64}$/)
    assert.match(incomplete.proof_fingerprint, /^sha256:[a-f0-9]{64}$/)
    assert.deepEqual(validateNarutoProofStatus(blocked), [])
    assert.deepEqual(validateNarutoProofStatus(incomplete), [])
  } finally {
    await Promise.all([
      fsp.rm(blockedDir, { recursive: true, force: true }),
      fsp.rm(incompleteDir, { recursive: true, force: true })
    ])
  }
})

test('contract fixtures match projected completed/blocked/incomplete envelopes exactly', async () => {
  const cases = [
    ['completed', 'completed.json'],
    ['blocked', 'blocked.json'],
    ['incomplete', 'incomplete.json']
  ] as const
  const fixtureRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../fixtures/contracts/naruto-proof-v1'
  )
  for (const [status, filename] of cases) {
    const dir = await writeProofFixture(status, { dynamicThreadCount: 2 })
    try {
      const projected = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
      const second = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
      const expected = JSON.parse(await fsp.readFile(path.join(fixtureRoot, filename), 'utf8'))
      assert.deepEqual(projected, expected)
      assert.equal(projected.proof_fingerprint, second.proof_fingerprint)
      assert.ok(Array.isArray(projected.blockers))
      assert.deepEqual(projected.result.changed_files, expected.result.changed_files)
      assert.deepEqual(projected.result.verification, expected.result.verification)
      if (status === 'completed') {
        assert.ok(String(projected.result.summary || '').trim().length > 0)
      }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  }
})

test('changed file escapes, normalized duplicates, and sensitive verification text fail closed without leaking', async () => {
  const dir = await writeProofFixture('completed', {
    changedFiles: ['/tmp/secret.ts', '../escape.ts', 'src/a.ts', './src/a.ts', ''],
    verification: ['test passed', 'env_dump: TOKEN=do-not-project', 'stderr: full process output']
  })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.equal(proof.ok, false)
    assert.deepEqual(proof.result.changed_files, ['src/a.ts'])
    assert.deepEqual(proof.result.verification, [{ name: 'test passed', status: 'passed' }])
    assert.ok(proof.blockers?.includes('proof_changed_file_absolute'))
    assert.ok(proof.blockers?.includes('proof_changed_file_escape'))
    assert.ok(proof.blockers?.includes('proof_changed_file_duplicate'))
    assert.ok(proof.blockers?.includes('proof_verification_row_invalid'))
    assert.doesNotMatch(JSON.stringify(proof.result), /do-not-project|full process output/)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('additive artifact and capability receipts preserve core proof fields and nested evidence', async () => {
  const artifacts = [{
    path: 'reports/monthly-finance.xlsx',
    kind: 'spreadsheet',
    media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: SHA256_A,
    bytes: 48_211,
    role: 'deliverable'
  }]
  const capabilitiesUsed = [{
    id: 'host.spreadsheet.workbook.v1',
    status: 'passed',
    tool_names: ['spreadsheet_create', 'spreadsheet_inspect'],
    receipt_sha256: SHA256_B
  }, {
    id: 'host.artifact.receipt.v1',
    status: 'passed',
    tool_names: ['spreadsheet_create'],
    receipt_sha256: SHA256_A
  }]
  const dir = await writeProofFixture('completed', { artifacts, capabilitiesUsed })
  try {
    const snapshot = await readNarutoProofArtifactSnapshot(dir)
    const proof = projectNarutoProofSnapshot({ snapshot, missionId: MISSION_ID })
    assert.equal(proof.status, 'completed')
    assert.equal(proof.ok, true)
    assert.equal(proof.result.summary, 'fixture complete')
    assert.deepEqual(proof.result.changed_files, ['src/example.ts'])
    assert.deepEqual(proof.result.verification, [{ name: 'test', status: 'passed' }])
    assert.deepEqual(proof.result.artifacts, artifacts)
    assert.deepEqual(proof.result.capabilities_used, capabilitiesUsed)
    assert.equal((proof.evidence as any).parent_summary_trustworthy, true)
    assert.equal(Object.hasOwn(proof.evidence as object, 'artifacts'), false)
    assert.equal(Object.hasOwn(proof.evidence as object, 'capabilities_used'), false)
    assert.deepEqual((proof.evidence as any).host_capability_evidence.artifacts, artifacts)

    const changedParent = JSON.parse(snapshot.bytes[SUBAGENT_PARENT_SUMMARY_FILENAME]!.toString('utf8'))
    changedParent.artifacts[0].bytes += 1
    const resultChanged = projectNarutoProofSnapshot({
      snapshot: {
        ...snapshot,
        bytes: {
          ...snapshot.bytes,
          [SUBAGENT_PARENT_SUMMARY_FILENAME]: Buffer.from(`${JSON.stringify(changedParent)}\n`)
        }
      },
      missionId: MISSION_ID
    })
    assert.notEqual(resultChanged.proof_fingerprint, proof.proof_fingerprint)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('real proof build re-stats and re-hashes workspace artifact files without following symlinks', async () => {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-proof-workspace-'))
  const outsideDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-proof-outside-'))
  const artifactBytes = Buffer.from('%PDF-1.7\nverified artifact bytes\n')
  const artifactPath = 'reports/monthly-finance.pdf'
  const artifactFile = path.join(workspaceRoot, artifactPath)
  const outsideFile = path.join(outsideDir, 'outside.pdf')
  await fsp.mkdir(path.dirname(artifactFile), { recursive: true })
  await fsp.writeFile(artifactFile, artifactBytes)
  await fsp.writeFile(outsideFile, artifactBytes)
  const dir = await writeProofFixture('completed', {
    workspaceRoot,
    artifacts: [{
      path: artifactPath,
      kind: 'document',
      media_type: 'application/pdf',
      sha256: `sha256:${sha256(artifactBytes)}`,
      bytes: artifactBytes.length,
      role: 'deliverable'
    }]
  })
  try {
    const verified = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(verified.status, 'completed')

    await fsp.writeFile(artifactFile, Buffer.from('tampered artifact bytes\n'))
    const mismatched = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(mismatched.status, 'blocked')
    assert.ok(mismatched.blockers.includes('proof_artifact_file_sha256_mismatch'))

    await fsp.appendFile(artifactFile, 'extra')
    const wrongSize = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.ok(wrongSize.blockers.includes('proof_artifact_file_bytes_mismatch'))

    await fsp.rm(artifactFile)
    const missing = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.ok(missing.blockers.includes('proof_artifact_file_missing'))

    if (process.platform !== 'win32') {
      await fsp.symlink(outsideFile, artifactFile)
      const symlinked = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
      assert.ok(symlinked.blockers.includes('proof_artifact_file_symlink'))
    }
  } finally {
    await Promise.all([
      fsp.rm(workspaceRoot, { recursive: true, force: true }),
      fsp.rm(outsideDir, { recursive: true, force: true })
    ])
  }
})

test('real proof build rejects matching-hash files with invalid PDF signatures', async () => {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-proof-signature-'))
  const artifactPath = 'reports/not-really.pdf'
  const artifactBytes = Buffer.from('not a pdf despite the extension\n')
  await fsp.mkdir(path.join(workspaceRoot, 'reports'), { recursive: true })
  await fsp.writeFile(path.join(workspaceRoot, artifactPath), artifactBytes)
  const dir = await writeProofFixture('completed', {
    workspaceRoot,
    artifacts: [{
      path: artifactPath,
      kind: 'document',
      media_type: 'application/pdf',
      sha256: `sha256:${sha256(artifactBytes)}`,
      bytes: artifactBytes.length,
      role: 'deliverable'
    }]
  })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.ok(proof.blockers.includes('proof_artifact_pdf_signature_invalid'))
    assert.equal(proof.blockers.includes('proof_artifact_file_sha256_mismatch'), false)
  } finally {
    await fsp.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('artifact projection enforces media-extension and per-file byte caps before file access', async () => {
  const artifacts = [{
    path: 'reports/mismatched.png',
    kind: 'document',
    media_type: 'application/pdf',
    sha256: SHA256_A,
    bytes: 128 * 1024 * 1024 + 1,
    role: 'deliverable'
  }]
  const dir = await writeProofFixture('completed', { artifacts })
  try {
    const snapshot = await readNarutoProofArtifactSnapshot(dir)
    const proof = projectNarutoProofSnapshot({ snapshot, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.ok(proof.blockers.includes('proof_artifact_bytes_too_large'))
    assert.ok(proof.blockers.includes('proof_artifact_media_extension_mismatch'))
    assert.ok(proof.blockers.includes('proof_artifact_extension_media_mismatch'))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('artifact receipts enforce path, hash, size, count, and deliverable-role bounds without leaking', async () => {
  const receipt = (pathValue: string, overrides: Record<string, unknown> = {}) => ({
    path: pathValue,
    kind: 'document',
    media_type: 'application/pdf',
    sha256: SHA256_A,
    bytes: 10,
    role: 'deliverable',
    ...overrides
  })
  const artifacts = [
    receipt('reports/valid.pdf'),
    receipt('/tmp/secret.pdf'),
    receipt('../escape.pdf'),
    receipt('reports\\windows.pdf'),
    receipt(`${'a'.repeat(513)}.pdf`),
    receipt('reports/bad-hash.pdf', { sha256: 'sha256:not-a-hash' }),
    receipt('reports/empty.pdf', { bytes: 0 }),
    receipt('logs/runtime.txt'),
    receipt('reports/run.log'),
    receipt('reports/safe.pdf', { arguments: { token: 'do-not-project' } }),
    ...Array.from({ length: 55 }, (_, index) => receipt(`reports/extra-${index}.pdf`))
  ]
  const dir = await writeProofFixture('completed', { artifacts })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.ok(proof.blockers.includes('proof_artifacts_too_many'))
    assert.ok(proof.blockers.includes('proof_artifact_path_absolute'))
    assert.ok(proof.blockers.includes('proof_artifact_path_escape'))
    assert.ok(proof.blockers.includes('proof_artifact_path_not_posix'))
    assert.ok(proof.blockers.includes('proof_artifact_path_invalid'))
    assert.ok(proof.blockers.includes('proof_artifact_sha256_invalid'))
    assert.ok(proof.blockers.includes('proof_artifact_bytes_invalid'))
    assert.ok(proof.blockers.includes('proof_artifact_deliverable_role_invalid'))
    assert.ok(proof.blockers.includes('proof_artifact_unknown_field'))
    assert.ok((proof.result.artifacts?.length || 0) <= 64)
    assert.doesNotMatch(JSON.stringify(proof.result), /do-not-project|arguments/)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('capability receipts are bounded to identifiers, statuses, tool names, and receipt hashes', async () => {
  const capability = (index: number, overrides: Record<string, unknown> = {}) => ({
    id: HOST_CAPABILITY_DESCRIPTORS[index % HOST_CAPABILITY_DESCRIPTORS.length]!.id,
    status: 'passed',
    tool_names: [HOST_CAPABILITY_DESCRIPTORS[index % HOST_CAPABILITY_DESCRIPTORS.length]!.tool_names[0]],
    receipt_sha256: SHA256_B,
    ...overrides
  })
  const capabilitiesUsed = [
    capability(0),
    capability(1, { arguments: { access_token: 'do-not-project' }, rows: ['private-data'] }),
    capability(2, { tool_names: [] }),
    capability(3, { receipt_sha256: 'sha256:bad' }),
    capability(4, { id: 'host.unknown.v1', tool_names: ['unknown_tool'] }),
    ...Array.from({ length: 61 }, (_, index) => capability(index + 5))
  ]
  const dir = await writeProofFixture('completed', { capabilitiesUsed })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.ok(proof.blockers.includes('proof_capabilities_used_too_many'))
    assert.ok(proof.blockers.includes('proof_capability_use_unknown_field'))
    assert.ok(proof.blockers.includes('proof_capability_use_unknown_id'))
    assert.ok(proof.blockers.includes('proof_capability_use_tool_names_invalid'))
    assert.ok(proof.blockers.includes('proof_capability_use_receipt_sha256_invalid'))
    assert.ok((proof.result.capabilities_used?.length || 0) <= 64)
    assert.doesNotMatch(JSON.stringify(proof.result), /do-not-project|private-data|arguments|rows/)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('a trusted non-passed host capability receipt blocks completion', async () => {
  const capabilitiesUsed = [{
    id: 'host.datasource.query.readonly.v1',
    status: 'failed',
    tool_names: [],
    receipt_sha256: SHA256_B
  }]
  const dir = await writeProofFixture('completed', { capabilitiesUsed })
  try {
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.equal(proof.ok, false)
    assert.ok(proof.blockers.includes('proof_capability_use_not_passed:host.datasource.query.readonly.v1'))
    assert.ok(proof.blockers.includes('parent_summary_capability_not_passed:host.datasource.query.readonly.v1'))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('malformed JSONL returns only bounded blocker codes and cannot complete', async () => {
  const dir = await writeProofFixture('completed')
  try {
    await fsp.appendFile(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME), '{not-json}\n')
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.ok(proof.blockers?.some((blocker) => /^proof_event_malformed:\d+$/.test(blocker)))
    assert.doesNotMatch(JSON.stringify(proof), /Unexpected token|not valid JSON/)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('parent thread outcomes that do not match event identity cannot complete', async () => {
  const dir = await writeProofFixture('completed')
  try {
    const file = path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME)
    const parent = JSON.parse(await fsp.readFile(file, 'utf8'))
    parent.thread_outcomes[0].thread_id = 'thread-other'
    await writeJson(file, parent)
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'blocked')
    assert.equal(proof.ok, false)
    assert.ok(proof.blockers?.includes('proof_evidence_rebuild_mismatch:parent_summary_trustworthy'))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('missing canonical terminal artifacts remain incomplete rather than becoming a fabricated blocker', async () => {
  const dir = await writeProofFixture('incomplete')
  try {
    await fsp.rm(path.join(dir, NARUTO_GATE_FILENAME))
    const proof = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(proof.status, 'incomplete')
    assert.ok(proof.blockers?.includes(`proof_artifact_missing:${NARUTO_GATE_FILENAME}`))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('all six canonical artifacts are raw-byte hashed, including JSONL', async () => {
  const dir = await writeProofFixture('completed')
  try {
    const snapshot = await readNarutoProofArtifactSnapshot(dir)
    assert.equal(Object.keys(snapshot.byte_hashes).length, 6)
    assert.match(snapshot.byte_hashes[SUBAGENT_EVENT_LOG_FILENAME] || '', /^sha256:[a-f0-9]{64}$/)
    assert.equal(snapshot.read_blockers.length, 0)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('killing an active proof reader leaves all six terminal artifacts byte-for-byte immutable', { timeout: 10_000 }, async () => {
  const dir = await writeProofFixture('completed')
  const marker = path.join(dir, 'proof-reader-active')
  const moduleUrl = new URL('../naruto-proof-projection.js', import.meta.url).href
  const script = [
    'import fs from "node:fs/promises"',
    `const mod = await import(${JSON.stringify(moduleUrl)})`,
    `const input = { artifactDir: ${JSON.stringify(dir)}, missionId: ${JSON.stringify(MISSION_ID)} }`,
    'await mod.buildNarutoProofProjection(input)',
    `await fs.writeFile(${JSON.stringify(marker)}, 'active\\n')`,
    'while (true) await mod.buildNarutoProofProjection(input)'
  ].join('\n')
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' })
  try {
    const before = await proofArtifactMetadata(dir)
    await waitForFile(marker, 5_000)
    await new Promise((resolve) => setTimeout(resolve, 25))
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => child.once('close', () => resolve()))
    assert.deepEqual(await proofArtifactMetadata(dir), before)
  } finally {
    child.kill('SIGKILL')
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

async function writeProofFixture(
  status: FixtureStatus,
  overrides: {
    changedFiles?: string[]
    verification?: unknown[]
    artifacts?: unknown[]
    capabilitiesUsed?: unknown[]
    workspaceRoot?: string
    dynamicThreadCount?: number
    staleRunThreadCount?: number
  } = {}
): Promise<string> {
  const fixtureParent = overrides.workspaceRoot
    ? path.join(overrides.workspaceRoot, '.sneakoscope', 'missions')
    : os.tmpdir()
  await fsp.mkdir(fixtureParent, { recursive: true })
  const dir = await fsp.mkdtemp(path.join(fixtureParent, `sks-proof-${status}-`))
  const threadIds = Array.from({ length: overrides.dynamicThreadCount || 1 }, (_, index) => `thread-${index + 1}`)
  const staleThreadIds = Array.from({ length: overrides.staleRunThreadCount || 0 }, (_, index) => `stale-thread-${index + 1}`)
  const parentStatus = status === 'blocked' ? 'failed' : 'completed'
  const baseParentSummary = {
    schema: 'sks.subagent-parent-summary.v1',
    status: parentStatus,
    summary: status === 'blocked' ? 'fixture blocked' : 'fixture complete',
    thread_outcomes: threadIds.map((threadId) => ({
      thread_id: threadId,
      status: parentStatus,
      summary: status === 'blocked' ? 'thread failed' : 'thread complete'
    })),
    changed_files: overrides.changedFiles ?? ['./src//example.ts'],
    verification: overrides.verification ?? [{ name: 'test', status: 'passed' }],
    blockers: status === 'blocked' ? ['fixture_blocker'] : [],
    run_id: RUN_ID
  }
  const hostCapabilityEvidence = fixtureHostCapabilityEvidence(overrides.artifacts, overrides.capabilitiesUsed)
  const parentSummary = {
    ...baseParentSummary,
    ...(overrides.artifacts === undefined ? {} : { artifacts: overrides.artifacts }),
    ...(hostCapabilityEvidence ? { capabilities_used: hostCapabilityEvidence.capabilities_used } : {})
  }
  const events = [
    ...threadIds.flatMap((threadId) => [
      event('SubagentStart', threadId, 'started'),
      ...(status === 'incomplete' ? [] : [event('SubagentStop', threadId, status === 'blocked' ? 'failed' : 'stopped')])
    ]),
    ...staleThreadIds.flatMap((threadId) => [
      event('SubagentStart', threadId, 'started', 'stale-run'),
      event('SubagentStop', threadId, 'stopped', 'stale-run')
    ])
  ]
  const dynamic = Boolean(overrides.dynamicThreadCount)
  const evidence = buildSubagentEvidence({
    requestedSubagents: dynamic ? 2 : 1,
    countPolicy: dynamic ? 'dynamic_automatic' : 'exact',
    targetSubagents: threadIds.length,
    events,
    parentSummary,
    parentSummaryPresent: true,
    workflowStatus: status,
    runId: RUN_ID,
    ...(hostCapabilityEvidence ? { hostCapabilityEvidence: hostCapabilityEvidence as any } : {})
  })
  const plan = {
    schema: 'sks.subagent-plan.v1',
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    requested_subagents: dynamic ? 2 : 1,
    requested_subagents_source: dynamic ? 'automatic' : 'operator',
    wave_lifecycle: {
      ...createSubagentWaveLifecycle({
        workflowRunId: RUN_ID,
        targetSubagents: threadIds.length,
        countPolicy: dynamic ? 'dynamic_automatic' : 'exact'
      }),
      updated_at: '2026-07-17T00:00:00.000Z'
    }
  }
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    status,
    ok: status === 'completed',
    completion_evidence: status === 'completed',
    requested_subagents: evidence.requested_subagents,
    count_policy: evidence.count_policy,
    target_subagents: evidence.target_subagents
  }
  const gate = {
    schema: 'sks.naruto-gate.v1',
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    passed: status === 'completed',
    terminal: status !== 'incomplete',
    terminal_state: status,
    blockers: status === 'completed' ? [] : evidence.blockers,
    requested_subagents: evidence.requested_subagents,
    count_policy: evidence.count_policy,
    target_subagents: evidence.target_subagents
  }
  await Promise.all([
    writeJson(path.join(dir, SUBAGENT_PLAN_FILENAME), plan),
    fsp.writeFile(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME), events.map((row) => JSON.stringify(row)).join('\n') + '\n'),
    writeJson(path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME), parentSummary),
    writeJson(path.join(dir, SUBAGENT_EVIDENCE_FILENAME), evidence),
    writeJson(path.join(dir, NARUTO_SUMMARY_FILENAME), summary),
    writeJson(path.join(dir, NARUTO_GATE_FILENAME), gate)
  ])
  return dir
}

function fixtureHostCapabilityEvidence(artifacts: unknown[] | undefined, capabilitiesUsed: unknown[] | undefined) {
  if (artifacts === undefined && capabilitiesUsed === undefined) return undefined
  const inferredArtifactTool = Array.isArray(artifacts)
    && artifacts.some((artifact: any) => artifact?.media_type === 'application/pdf')
    ? 'html_to_pdf'
    : Array.isArray(artifacts)
      && artifacts.some((artifact: any) => artifact?.media_type === 'image/png')
      ? 'html_to_screenshot'
      : 'spreadsheet_create'
  const receipts = capabilitiesUsed === undefined
    ? [{
        id: 'host.artifact.receipt.v1',
        status: 'passed',
        tool_names: [inferredArtifactTool],
        receipt_sha256: SHA256_B
      }]
    : capabilitiesUsed
  const requestedIds = Array.isArray(receipts)
    ? receipts.map((row: any) => String(row?.id || '')).filter(Boolean)
    : []
  const toolCalls = Array.isArray(receipts)
    ? receipts.flatMap((row: any, receiptIndex) => Array.isArray(row?.tool_names)
      ? row.tool_names.map((tool: unknown, toolIndex: number) => ({
          server: 'acas-tools',
          tool,
          status: row?.status === 'failed' ? 'failed' : 'passed',
          event_sha256: `sha256:${((receiptIndex * 17 + toolIndex + 1) % 16).toString(16).repeat(64)}`
        }))
      : [])
    : []
  const failed = Array.isArray(receipts) && receipts.some((row: any) => row?.status === 'failed')
  return {
    schema: 'sks.host-capability-evidence.v1' as const,
    ok: !failed,
    runtime: {
      schema: 'sks.host-capability-runtime.v1' as const,
      ok: true,
      server: 'acas-tools' as const,
      server_present: true,
      server_enabled: true,
      server_scope: 'project' as const,
      inventory_source: 'fixture',
      health_status: 'healthy',
      requested_capability_ids: requestedIds,
      task_workflows: [],
      observed_tool_names: toolCalls.map((row: any) => row.tool),
      allowed_tool_names: toolCalls.map((row: any) => row.tool),
      denied_tool_names: [],
      explicit_denied_tool_names: [],
      allowlist_digest: SHA256_A,
      capability_digest: hostCapabilityDigest(HOST_CAPABILITY_DESCRIPTORS),
      capabilities: [],
      blockers: []
    },
    tool_calls: toolCalls,
    capabilities_used: receipts,
    artifacts: artifacts || [],
    blockers: failed ? ['host_capability_fixture_failed'] : []
  }
}

function event(
  eventName: 'SubagentStart' | 'SubagentStop',
  threadId: string,
  outcome: 'started' | 'stopped' | 'failed',
  runId = RUN_ID
) {
  return {
    schema: 'sks.subagent-event.v1',
    event_name: eventName,
    thread_id: threadId,
    run_id: runId,
    outcome,
    occurred_at: '2026-07-17T00:00:00.000Z'
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function proofArtifactMetadata(dir: string): Promise<Record<string, { bytes: string; mtimeMs: number }>> {
  const names = [
    SUBAGENT_PLAN_FILENAME,
    SUBAGENT_EVENT_LOG_FILENAME,
    SUBAGENT_PARENT_SUMMARY_FILENAME,
    SUBAGENT_EVIDENCE_FILENAME,
    NARUTO_SUMMARY_FILENAME,
    NARUTO_GATE_FILENAME
  ]
  return Object.fromEntries(await Promise.all(names.map(async (name) => {
    const [bytes, stat] = await Promise.all([
      fsp.readFile(path.join(dir, name)),
      fsp.stat(path.join(dir, name))
    ])
    return [name, { bytes: bytes.toString('base64'), mtimeMs: stat.mtimeMs }] as const
  })))
}

async function waitForFile(file: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fsp.access(file).then(() => true, () => false)) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('proof_reader_marker_timeout')
}
