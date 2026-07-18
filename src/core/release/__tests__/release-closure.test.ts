import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectReleaseClosure } from '../main-push-guard.js'
import { readFixtureJson, RELEASE_MISSION_ID, writeFixtureJson, writeReleaseClosureFixture } from './release-closure-fixture.js'

test('release closure binds exact findings, three official Naruto threads, 28 work orders, attachment slices, and deletion truth', () => {
  const fixture = createRepo()
  try {
    const result = inspect(fixture)
    assert.equal(result.ok, true, result.blockers.join(','))
    assert.equal(result.mission_id, RELEASE_MISSION_ID)
    assert.equal(result.source_commit, fixture.sourceCommit)
    assert.equal(result.head, fixture.head)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure accepts legacy exact-three artifacts without count fields under the same sealed plan', () => {
  const fixture = createRepo({ legacySubagentCountFields: true })
  try {
    const result = inspect(fixture)
    assert.equal(result.ok, true, result.blockers.join(','))
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure rejects legacy count artifacts when the exact plan drifts from three', () => {
  const fixture = createRepo({ legacySubagentCountFields: true, planRequestedSubagents: 2 })
  try {
    const result = inspect(fixture)
    assert.equal(result.ok, false)
    assert.equal(result.blockers.includes('subagent_plan_invalid'), true, result.blockers.join(','))
    assert.equal(result.blockers.includes('naruto:official_subagent_requested_subagents_mismatch'), true, result.blockers.join(','))
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure fails closed for finding terminal-state and structured proof drift', () => {
  const fixture = createRepo()
  try {
    const findingsFile = path.join(fixture.audit, 'findings.json')
    const findings = readFixtureJson(findingsFile)
    findings.findings[27].status = 'open'
    findings.findings[0].status = 'accepted_risk_with_expiry'
    findings.findings[0].accepted_risk = {
      owner: 'release', expires_version: '6.4.0', reproduction: 'steps', user_impact: 'impact',
      why_safe_for_6_3_0: 'reason', removal_plan: 'remove'
    }
    findings.findings[1].closure.commit = fixture.preBaseline
    findings.findings[2].closure.proof = ['../outside.json']
    writeFixtureJson(findingsFile, findings)
    const result = inspect(fixture)
    assert.equal(result.ok, false)
    assert.equal(result.blockers.includes('closure_artifact_not_exact_head_blob:findings'), true)
    assert.equal(result.blockers.includes('finding_not_terminal:F-028'), true)
    assert.equal(result.blockers.includes('p0_terminal_status_forbidden:F-001'), true)
    assert.equal(result.blockers.includes('finding_commit_unbound:F-002'), true)
    assert.equal(result.blockers.includes('finding_proof:F-003:reference_invalid'), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure fails closed for lifecycle, parent, gate, and SSOT drift', () => {
  const fixture = createRepo()
  try {
    fs.rmSync(path.join(fixture.mission, 'subagent-parent-summary.json'))
    fs.writeFileSync(path.join(fixture.mission, 'subagent-events.jsonl'), '')
    const gateFile = path.join(fixture.mission, 'naruto-gate.json')
    const gate = readFixtureJson(gateFile)
    gate.ssot_guard = false
    writeFixtureJson(gateFile, gate)
    const ssotFile = path.join(fixture.mission, 'ssot-guard.json')
    const ssot = readFixtureJson(ssotFile)
    ssot.ok = false
    writeFixtureJson(ssotFile, ssot)
    const result = inspect(fixture)
    assert.equal(result.ok, false)
    assert.equal(result.blockers.includes('subagent_event_count_invalid:0/6'), true)
    assert.equal(result.blockers.includes('subagent_evidence_recompute_mismatch'), true)
    assert.equal(result.blockers.includes('parent_summary_invalid'), true)
    assert.equal(result.blockers.includes('naruto_gate_inconsistent'), true)
    assert.equal(result.blockers.includes('ssot_guard_invalid'), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure fails closed for ledger inventory and post-main blocker drift', () => {
  const fixture = createRepo()
  try {
    const ledgerFile = path.join(fixture.mission, 'work-order-ledger.json')
    const ledger = readFixtureJson(ledgerFile)
    ledger.items.pop()
    ledger.all_work_items_verified = false
    writeFixtureJson(ledgerFile, ledger)
    let result = inspect(fixture)
    assert.equal(result.blockers.includes('work_order_header_invalid'), true)
    assert.equal(result.blockers.includes('work_order_count_mismatch:27/28'), true)
    assert.equal(result.blockers.includes('work_order_ids_invalid'), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }

  const blockedFixture = createRepo()
  try {
    const ledgerFile = path.join(blockedFixture.mission, 'work-order-ledger.json')
    const ledger = readFixtureJson(ledgerFile)
    const validBlocker = {
      blocked: true,
      kind: 'external_authority',
      phase: 'post_main',
      reason: 'requires main push and maintainer authority',
      needed_to_unblock: 'push verified main, then obtain maintainer approval'
    }
    ledger.items[19] = { ...ledger.items[19], status: 'blocked', blocker: validBlocker }
    ledger.items[24] = { ...ledger.items[24], status: 'blocked', blocker: validBlocker }
    ledger.items[5] = { ...ledger.items[5], status: 'blocked', blocker: validBlocker }
    ledger.all_work_items_verified = false
    writeFixtureJson(ledgerFile, ledger)
    const result = inspect(blockedFixture)
    assert.equal(result.blockers.includes('work_order_item_invalid:WO-019'), false)
    assert.equal(result.blockers.includes('work_order_item_invalid:WO-024'), false)
    assert.equal(result.blockers.includes('work_order_item_invalid:WO-005'), true)
  } finally {
    fs.rmSync(blockedFixture.root, { recursive: true, force: true })
  }
})

test('release closure fails closed for deletion evidence drift', () => {
  const fixture = createRepo()
  try {
    const deletionFile = path.join(fixture.audit, 'overengineering-deletions.json')
    const deletion = readFixtureJson(deletionFile)
    deletion.removed_modules = []
    deletion.removed_file_count = 0
    deletion.removed_lines = 0
    writeFixtureJson(deletionFile, deletion)
    const result = inspect(fixture)
    assert.equal(result.blockers.includes('closure_artifact_not_exact_head_blob:deletion'), true)
    assert.equal(result.blockers.includes('removed_modules_mismatch'), true)
    assert.equal(result.blockers.includes('removed_file_count_mismatch'), true)
    assert.equal(result.blockers.includes('removed_lines_mismatch'), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('release closure rejects an unrelated mission and product changes after source commit', () => {
  const fixture = createRepo()
  try {
    const wrongMission = inspectReleaseClosure({
      root: fixture.root,
      version: '6.3.0',
      expectedBaseline: fixture.baseline,
      expectedHead: fixture.head,
      expectedMissionId: 'M-newer-unrelated',
      expectedWorkOrderSha256: fixture.workOrderSha256
    })
    assert.equal(wrongMission.ok, false)
    assert.equal(wrongMission.blockers.includes(`mission_id_mismatch:${RELEASE_MISSION_ID}`), true)

    fs.writeFileSync(path.join(fixture.root, 'post-closure-product-change.txt'), 'forbidden\n')
    git(fixture.root, ['add', 'post-closure-product-change.txt'])
    git(fixture.root, ['commit', '-m', 'forbidden post-closure product change'])
    const changedHead = gitText(fixture.root, ['rev-parse', 'HEAD'])
    const changed = inspectReleaseClosure({
      root: fixture.root,
      version: '6.3.0',
      expectedBaseline: fixture.baseline,
      expectedHead: changedHead,
      expectedWorkOrderSha256: fixture.workOrderSha256
    })
    assert.equal(changed.ok, false)
    assert.equal(changed.blockers.includes('closure_post_source_change_forbidden:post-closure-product-change.txt'), true)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('post-6.3 releases do not inherit the version-scoped 6.3 audit closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-closure-scope-'))
  try {
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'fixture@example.test'])
    git(root, ['config', 'user.name', 'Release Fixture'])
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.7.0' }))
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'baseline'])
    const baseline = gitText(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, 'release.txt'), 'release\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'release'])
    const head = gitText(root, ['rev-parse', 'HEAD'])
    const result = inspectReleaseClosure({
      root,
      version: '6.7.0',
      expectedBaseline: baseline,
      expectedHead: head,
      expectedMissionId: 'M-release-670'
    })
    assert.equal(result.ok, true, result.blockers.join(','))
    assert.equal(result.applicable, false)
    assert.equal(result.source_commit, head)
    assert.equal(result.mission_id, 'M-release-670')
    assert.equal(result.manifest_path, null)
    assert.equal(result.manifest_sha256, null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function inspect(fixture: ReturnType<typeof createRepo>) {
  return inspectReleaseClosure({
    root: fixture.root,
    version: '6.3.0',
    expectedBaseline: fixture.baseline,
    expectedHead: fixture.head,
    expectedWorkOrderSha256: fixture.workOrderSha256
  })
}

function createRepo(options: { legacySubagentCountFields?: boolean; planRequestedSubagents?: number } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-release-closure-'))
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'fixture@example.test'])
  git(root, ['config', 'user.name', 'Release Fixture'])
  fs.writeFileSync(path.join(root, '.gitignore'), '.sneakoscope/missions/\n.sneakoscope/reports/\n.codex/sessions/\ndist/\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'pre-baseline'])
  const preBaseline = gitText(root, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(root, 'legacy.txt'), 'one\ntwo\nthree\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'baseline'])
  const baseline = gitText(root, ['rev-parse', 'HEAD'])
  fs.rmSync(path.join(root, 'legacy.txt'))
  fs.writeFileSync(path.join(root, 'release.txt'), 'release\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-m', 'release source'])
  const sourceCommit = gitText(root, ['rev-parse', 'HEAD'])
  const written = writeReleaseClosureFixture({
    root,
    baseline,
    sourceCommit,
    removedModules: ['legacy.txt'],
    removedLines: 3,
    ...options
  })
  return { root, preBaseline, baseline, ...written }
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function gitText(root: string, args: string[]) {
  return String(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout || '').trim()
}
