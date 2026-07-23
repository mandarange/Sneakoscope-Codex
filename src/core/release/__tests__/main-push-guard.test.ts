import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectMainPushGuard, RELEASE_630_MISSION_ID } from '../main-push-guard.js'
import { normalizeReleaseOrigin } from '../release-origin.js'
import { writeReleaseClosureFixture } from './release-closure-fixture.js'
import { writeCompleteReleaseProofs } from './release-proof-fixture.js'

test('main push guard requires clean, source-bound release proofs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-main-push-guard-'))
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.3.0' }))
    fs.writeFileSync(path.join(root, '.gitignore'), '.sneakoscope/\ndist/\n')
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'fixture@example.test'])
    git(root, ['config', 'user.name', 'Release Fixture'])
    const originUrl = path.join(root, 'origin.git')
    git(root, ['remote', 'add', 'origin', originUrl])
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'baseline'])
    const baseline = gitText(root, ['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(root, 'release.txt'), 'release\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'release source'])
    const sourceCommit = gitText(root, ['rev-parse', 'HEAD'])
    git(root, ['update-ref', 'refs/remotes/origin/main', baseline])
    const expectedOriginIdentity = normalizeReleaseOrigin(originUrl)
    const closure = writeReleaseClosureFixture({ root, baseline, sourceCommit })
    writeCompleteReleaseProofs(root, closure.head, baseline, expectedOriginIdentity)

    const passing = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true,
      expectedWorkOrderSha256: closure.workOrderSha256
    })
    assert.equal(passing.ok, true, passing.blockers.join(','))
    assert.equal(passing.release_closure.mission_id, RELEASE_630_MISSION_ID)

    const upgradeProof = path.join(root, '.sneakoscope', 'reports', 'release', '6.3.0', 'upgrade-6.2-to-6.3.0.json')
    const upgrade = JSON.parse(fs.readFileSync(upgradeProof, 'utf8'))
    upgrade.target.tarball_sha256 = '0'.repeat(64)
    fs.writeFileSync(upgradeProof, JSON.stringify(upgrade))
    const staleUpgrade = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true,
      expectedWorkOrderSha256: closure.workOrderSha256
    })
    assert.equal(staleUpgrade.ok, false)
    assert.equal(staleUpgrade.blockers.includes('upgrade_proof:target_tarball_sha256_mismatch'), true)
    upgrade.target.tarball_sha256 = JSON.parse(fs.readFileSync(
      path.join(root, '.sneakoscope', 'reports', 'release', '6.3.0', 'pack-receipt.json'),
      'utf8'
    )).sha256
    fs.writeFileSync(upgradeProof, JSON.stringify(upgrade))

    const assertUpgradeBlocked = (mutate: (value: any) => void, expected: string) => {
      const original = JSON.parse(fs.readFileSync(upgradeProof, 'utf8'))
      const changed = structuredClone(original)
      mutate(changed)
      fs.writeFileSync(upgradeProof, JSON.stringify(changed))
      const result = inspectMainPushGuard({
        root,
        expectedVersion: '6.3.0',
        expectedOriginMain: baseline,
        expectedOriginIdentity,
        requireReleaseStamp: true,
        requirePackProof: true,
        requireMacosProof: true,
        requireCleanTree: true,
        expectedWorkOrderSha256: closure.workOrderSha256
      })
      assert.equal(result.ok, false)
      assert.equal(result.blockers.includes(`upgrade_proof:${expected}`), true, result.blockers.join(','))
      fs.writeFileSync(upgradeProof, JSON.stringify(original))
    }
    assertUpgradeBlocked((value) => { value.isolation.host_home_reused = true }, 'host_isolation_reused')
    assertUpgradeBlocked((value) => { value.isolation.retained = true }, 'sandbox_cleanup_incomplete')
    assertUpgradeBlocked((value) => { value.commands.pop() }, 'command_inventory_incomplete')
    assertUpgradeBlocked((value) => { value.commands[1].timed_out = true }, 'command_receipt_invalid:baseline_install')
    assertUpgradeBlocked((value) => { value.target.receipt_sha256 = '0'.repeat(64) }, 'target_receipt_sha256_mismatch')

    const wrongMission = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      expectedReleaseMissionId: 'M-unrelated',
      expectedWorkOrderSha256: closure.workOrderSha256,
      requireReleaseStamp: true,
      requirePackProof: true,
      requireMacosProof: true,
      requireCleanTree: true
    })
    assert.equal(wrongMission.ok, false)
    assert.equal(wrongMission.blockers.includes(`release_closure:mission_id_mismatch:${RELEASE_630_MISSION_ID}`), true)

    const missingRequirements = inspectMainPushGuard({
      root,
      expectedVersion: '6.3.0',
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      expectedWorkOrderSha256: closure.workOrderSha256
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
      expectedOriginMain: baseline,
      expectedOriginIdentity,
      expectedWorkOrderSha256: closure.workOrderSha256,
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
