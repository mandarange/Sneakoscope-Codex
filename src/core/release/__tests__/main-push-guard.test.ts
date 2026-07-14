import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectMainPushGuard } from '../main-push-guard.js'
import { normalizeReleaseOrigin } from '../release-origin.js'
import { writeCompleteReleaseProofs } from './release-proof-fixture.js'

test('main push guard requires clean, source-bound release proofs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-main-push-guard-'))
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.3.0' }))
    fs.writeFileSync(path.join(root, '.gitignore'), '.sneakoscope/reports/\ndist/\n')
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'fixture@example.test'])
    git(root, ['config', 'user.name', 'Release Fixture'])
    const originUrl = path.join(root, 'origin.git')
    git(root, ['remote', 'add', 'origin', originUrl])
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'release source'])
    const head = gitText(root, ['rev-parse', 'HEAD'])
    git(root, ['update-ref', 'refs/remotes/origin/main', head])
    const expectedOriginIdentity = normalizeReleaseOrigin(originUrl)
    writeCompleteReleaseProofs(root, head, head, expectedOriginIdentity)

    const passing = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: head,
      expectedOriginIdentity,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true
    })
    assert.equal(passing.ok, true, passing.blockers.join(','))

    const missingRequirements = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: head,
      expectedOriginIdentity
    })
    assert.equal(missingRequirements.ok, false)
    assert.equal(missingRequirements.blockers.includes('release_stamp_requirement_missing'), true)
    assert.equal(missingRequirements.blockers.includes('pack_proof_requirement_missing'), true)
    assert.equal(missingRequirements.blockers.includes('macos_proof_requirement_missing'), true)
    assert.equal(missingRequirements.blockers.includes('clean_tree_requirement_missing'), true)

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.3.1' }))
    const blocked = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: head,
      expectedOriginIdentity,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.blockers.includes('package_version_mismatch:6.3.1'), true)
    assert.equal(blocked.blockers.includes('worktree_not_clean'), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function gitText(root: string, args: string[]): string {
  return String(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout || '').trim()
}
