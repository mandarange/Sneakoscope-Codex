import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  buildNarutoProofProjection,
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

type FixtureStatus = 'completed' | 'blocked' | 'incomplete'

const MISSION_ID = 'M-proof-projection-fixture'
const RUN_ID = 'naruto-proof-projection-fixture-1'

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
    assert.equal('blockers' in first, false)
    assert.deepEqual(validateNarutoProofStatus(first), [])

    await fsp.appendFile(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME), '\n')
    const byteChanged = await buildNarutoProofProjection({ artifactDir: dir, missionId: MISSION_ID })
    assert.equal(byteChanged.status, 'completed')
    assert.notEqual(byteChanged.proof_fingerprint, first.proof_fingerprint)
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
  overrides: { changedFiles?: string[]; verification?: unknown[] } = {}
): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `sks-proof-${status}-`))
  const threadId = 'thread-a'
  const parentStatus = status === 'blocked' ? 'failed' : 'completed'
  const parentSummary = {
    schema: 'sks.subagent-parent-summary.v1',
    status: parentStatus,
    summary: status === 'blocked' ? 'fixture blocked' : 'fixture complete',
    thread_outcomes: [{
      thread_id: threadId,
      status: parentStatus,
      summary: status === 'blocked' ? 'thread failed' : 'thread complete'
    }],
    changed_files: overrides.changedFiles ?? ['./src//example.ts'],
    verification: overrides.verification ?? [{ name: 'test', status: 'passed' }],
    blockers: status === 'blocked' ? ['fixture_blocker'] : [],
    run_id: RUN_ID
  }
  const events = [
    event('SubagentStart', threadId, 'started'),
    ...(status === 'incomplete' ? [] : [event('SubagentStop', threadId, status === 'blocked' ? 'failed' : 'stopped')])
  ]
  const evidence = buildSubagentEvidence({
    requestedSubagents: 1,
    events,
    parentSummary,
    parentSummaryPresent: true,
    workflowStatus: status,
    runId: RUN_ID
  })
  const plan = {
    schema: 'sks.subagent-plan.v1',
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    requested_subagents: 1
  }
  const summary = {
    schema: NARUTO_RESULT_SCHEMA,
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    status,
    ok: status === 'completed',
    completion_evidence: status === 'completed'
  }
  const gate = {
    schema: 'sks.naruto-gate.v1',
    mission_id: MISSION_ID,
    workflow: 'official_codex_subagent',
    workflow_run_id: RUN_ID,
    passed: status === 'completed',
    terminal: status !== 'incomplete',
    terminal_state: status,
    blockers: status === 'completed' ? [] : evidence.blockers
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

function event(eventName: 'SubagentStart' | 'SubagentStop', threadId: string, outcome: 'started' | 'stopped' | 'failed') {
  return {
    schema: 'sks.subagent-event.v1',
    event_name: eventName,
    thread_id: threadId,
    run_id: RUN_ID,
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
