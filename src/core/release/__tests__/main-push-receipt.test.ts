import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectMainPushGuard } from '../main-push-guard.js'
import { inspectMainPushReceipt } from '../main-push-receipt.js'
import { normalizeReleaseOrigin } from '../release-origin.js'
import { releaseProofDir } from '../release-pack-receipt.js'
import { writeReleaseClosureFixture } from './release-closure-fixture.js'
import { writeCompleteReleaseProofs } from './release-proof-fixture.js'

test('main push receipt independently revalidates remote main and the exact pre-push release closure', () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-main-push-receipt-'))
  const root = path.join(container, 'work')
  const remote = path.join(container, 'origin.git')
  try {
    fs.mkdirSync(root, { recursive: true })
    git(container, ['init', '--bare', remote])
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.3.0' }))
    fs.writeFileSync(path.join(root, '.gitignore'), '.sneakoscope/missions/\n.sneakoscope/reports/\n.codex/sessions/\ndist/\n')
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'fixture@example.test'])
    git(root, ['config', 'user.name', 'Release Fixture'])
    git(root, ['remote', 'add', 'origin', remote])
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'baseline'])
    const baseline = gitText(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-u', 'origin', 'main'])

    fs.writeFileSync(path.join(root, 'release.txt'), 'release\n')
    git(root, ['add', 'release.txt'])
    git(root, ['commit', '-m', 'release source'])
    const sourceCommit = gitText(root, ['rev-parse', 'HEAD'])
    const closure = writeReleaseClosureFixture({ root, baseline, sourceCommit })
    const expectedOriginIdentity = normalizeReleaseOrigin(remote)
    writeCompleteReleaseProofs(root, closure.head, baseline, expectedOriginIdentity)
    const guard = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      expectedWorkOrderSha256: closure.workOrderSha256,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true
    })
    assert.equal(guard.ok, true, guard.blockers.join(','))
    const guardFile = path.join(releaseProofDir(root, '6.3.0'), 'main-push-guard.json')
    writeJson(guardFile, guard)
    git(root, ['push', 'origin', 'HEAD:refs/heads/main'])

    const inspect = () => inspectMainPushReceipt({
      root,
      version: '6.3.0',
      baseline,
      method: 'fast-forward',
      expectedOriginIdentity,
      expectedWorkOrderSha256: closure.workOrderSha256
    })
    const passing = inspect()
    assert.equal(passing.ok, true, passing.blockers.join(','))
    assert.equal(passing.main_sha, closure.head)
    assert.equal(passing.remote_main_sha, closure.head)
    assert.equal(passing.release_closure.manifest_sha256, guard.release_closure.manifest_sha256)

    const ignoredProof = path.join(root, closure.findingProofs[0]?.path || '')
    const originalProof = fs.readFileSync(ignoredProof)
    fs.writeFileSync(ignoredProof, '{"tampered":true}\n')
    assert.equal(gitText(root, ['status', '--porcelain=v1']), '')
    const tampered = inspect()
    assert.equal(tampered.ok, false)
    assert.equal(tampered.release_closure.ok, false)
    assert.equal(tampered.blockers.includes('release_closure:finding_proof:F-001:hash_mismatch'), true)
    fs.writeFileSync(ignoredProof, originalProof)

    const originalGuard = JSON.parse(fs.readFileSync(guardFile, 'utf8'))
    const driftedGuard = structuredClone(originalGuard)
    driftedGuard.release_closure.manifest_sha256 = '0'.repeat(64)
    writeJson(guardFile, driftedGuard)
    const mismatchedGuard = inspect()
    assert.equal(mismatchedGuard.ok, false)
    assert.equal(mismatchedGuard.blockers.includes('pre_push_guard_release_closure_manifest_mismatch'), true)
    writeJson(guardFile, originalGuard)

    fs.writeFileSync(path.join(root, 'unpushed.txt'), 'not on remote\n')
    git(root, ['add', 'unpushed.txt'])
    git(root, ['commit', '-m', 'unpushed source'])
    const blocked = inspect()
    assert.equal(blocked.ok, false)
    assert.equal(blocked.blockers.includes('remote_main_does_not_match_head'), true)
    assert.equal(blocked.blockers.includes('release_closure:closure_post_source_change_forbidden:unpushed.txt'), true)
  } finally {
    fs.rmSync(container, { recursive: true, force: true })
  }
})

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function gitText(root: string, args: string[]): string {
  return String(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout || '').trim()
}
