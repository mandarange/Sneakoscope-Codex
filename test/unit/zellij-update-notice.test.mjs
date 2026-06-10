import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkZellijUpdateNotice,
  fetchLatestZellijVersion,
  maybePromptZellijUpdateForLaunch,
  zellijUpgradeCommandHint
} from '../../dist/core/zellij/zellij-update.js'

test('SKS_ZELLIJ_LATEST_VERSION pins the latest version without network', async () => {
  const latest = await fetchLatestZellijVersion({ env: { SKS_ZELLIJ_LATEST_VERSION: 'v9.9.9' } })
  assert.equal(latest.version, '9.9.9')
  assert.equal(latest.source, 'env')
})

test('notice is disabled by SKS_SKIP_ZELLIJ_UPDATE=1', async () => {
  const notice = await checkZellijUpdateNotice({ env: { SKS_SKIP_ZELLIJ_UPDATE: '1' } })
  assert.equal(notice.source, 'disabled')
  assert.equal(notice.update_available, false)
})

test('launch prompt skips on --json / --skip-zellij-update', async () => {
  for (const flags of [['--json'], ['--skip-zellij-update'], ['--skip-cli-tools']]) {
    const result = await maybePromptZellijUpdateForLaunch(flags, { env: { SKS_ZELLIJ_LATEST_VERSION: '9.9.9' } })
    assert.equal(result.status, 'skipped')
  }
})

test('update_available true when pinned latest exceeds installed version', async (t) => {
  const env = { SKS_ZELLIJ_LATEST_VERSION: '99.0.0' }
  const notice = await checkZellijUpdateNotice({ env })
  if (notice.zellij_missing) {
    t.skip('zellij binary not on PATH in this environment')
    return
  }
  assert.equal(notice.update_available, true)
  assert.match(String(notice.current_version), /^\d+\.\d+\.\d+$/)
})

test('current when pinned latest is older than installed version', async (t) => {
  const env = { SKS_ZELLIJ_LATEST_VERSION: '0.0.1' }
  const notice = await checkZellijUpdateNotice({ env })
  if (notice.zellij_missing) {
    t.skip('zellij binary not on PATH in this environment')
    return
  }
  assert.equal(notice.update_available, false)
})

test('non-TTY prompt with update available reports status=available with command (no mutation)', async (t) => {
  const env = { SKS_ZELLIJ_LATEST_VERSION: '99.0.0', CI: 'true' }
  const result = await maybePromptZellijUpdateForLaunch([], { env, label: 'unit test' })
  if (result.status === 'missing') {
    t.skip('zellij binary not on PATH in this environment')
    return
  }
  assert.equal(result.status, 'available')
  assert.equal(result.latest, '99.0.0')
  assert.ok(result.command)
})

test('upgrade command hint matches platform', () => {
  const hint = zellijUpgradeCommandHint()
  assert.ok(hint.length > 0)
  if (process.platform === 'darwin') assert.equal(hint, 'brew upgrade zellij')
})
