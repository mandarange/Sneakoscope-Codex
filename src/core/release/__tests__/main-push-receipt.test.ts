import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { inspectMainPushReceipt } from '../main-push-receipt.js'
import { normalizeReleaseOrigin } from '../release-origin.js'
import { writeCompleteReleaseProofs } from './release-proof-fixture.js'

test('main push receipt requires the actual remote main SHA and complete proof set', () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-main-push-receipt-'))
  const root = path.join(container, 'work')
  const remote = path.join(container, 'origin.git')
  try {
    fs.mkdirSync(root, { recursive: true })
    git(container, ['init', '--bare', remote])
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: '6.3.0' }))
    fs.writeFileSync(path.join(root, '.gitignore'), '.sneakoscope/reports/\ndist/\n')
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'fixture@example.test'])
    git(root, ['config', 'user.name', 'Release Fixture'])
    git(root, ['remote', 'add', 'origin', remote])
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'release source'])
    const head = gitText(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-u', 'origin', 'main'])
    const expectedOriginIdentity = normalizeReleaseOrigin(remote)
    writeCompleteReleaseProofs(root, head, head, expectedOriginIdentity)
    const passing = inspectMainPushReceipt({
      root, version: '6.3.0', baseline: head, method: 'fast-forward', expectedOriginIdentity
    })
    assert.equal(passing.ok, true, passing.blockers.join(','))
    assert.equal(passing.main_sha, head)
    assert.equal(passing.remote_main_sha, head)

    fs.writeFileSync(path.join(root, 'unpushed.txt'), 'not on remote\n')
    git(root, ['add', 'unpushed.txt'])
    git(root, ['commit', '-m', 'unpushed source'])
    const blocked = inspectMainPushReceipt({
      root, version: '6.3.0', baseline: head, method: 'fast-forward', expectedOriginIdentity
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.blockers.includes('remote_main_does_not_match_head'), true)
  } finally {
    fs.rmSync(container, { recursive: true, force: true })
  }
})

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function gitText(root: string, args: string[]): string {
  return String(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout || '').trim()
}
