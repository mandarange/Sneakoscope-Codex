import test from 'node:test'
import assert from 'node:assert/strict'
import { maybePromptZellijUpdateForLaunch } from '../zellij-update.js'

test('MAD launch can defer the remote Zellij update lookup after a healthy local capability check', async () => {
  const result = await maybePromptZellijUpdateForLaunch([], {
    deferUpdateCheck: true,
    env: {
      ...process.env,
      SKS_ZELLIJ_CAPABILITY_FAKE_STATUS: 'ok',
      SKS_ZELLIJ_CAPABILITY_FAKE_VERSION: '0.43.1',
      SKS_ZELLIJ_LATEST_VERSION: '99.0.0'
    }
  })

  assert.equal(result.status, 'current')
  assert.equal(result.current, '0.43.1')
  assert.equal(result.latest, null)
  assert.equal(result.deferred, true)
  assert.equal(result.capability?.status, 'ok')
})

test('explicit --yes keeps the pre-launch Zellij update decision instead of deferring it', async () => {
  const result = await maybePromptZellijUpdateForLaunch(['--yes'], {
    deferUpdateCheck: true,
    env: {
      ...process.env,
      SKS_ZELLIJ_CAPABILITY_FAKE_STATUS: 'ok',
      SKS_ZELLIJ_CAPABILITY_FAKE_VERSION: '0.43.1',
      SKS_ZELLIJ_LATEST_VERSION: '0.43.1'
    }
  })

  assert.equal(result.status, 'current')
  assert.equal(result.current, '0.43.1')
  assert.equal(result.latest, '0.43.1')
  assert.equal(result.deferred, undefined)
})
