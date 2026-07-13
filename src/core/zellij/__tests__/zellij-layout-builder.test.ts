import test from 'node:test'
import assert from 'node:assert/strict'
import { buildZellijLayoutKdl } from '../zellij-layout-builder.js'

test('Zellij layout consumes viewport and refresh CLI settings from launchEnv', () => {
  const built = buildZellijLayoutKdl({
    missionId: 'M-layout-launch-env',
    ledgerRoot: '/tmp/sks-layout-launch-env',
    cwd: '/tmp',
    kind: 'mad',
    launchEnv: {
      SKS_ZELLIJ_VIEWPORTS: '3',
      SKS_ZELLIJ_REFRESH_MS: '750'
    }
  })

  assert.equal(built.viewport_count, 3)
  assert.equal((built.layout_kdl.match(/zellij-viewport-pane/g) || []).length, 3)
  assert.equal((built.layout_kdl.match(/"--interval-ms" "750"/g) || []).length, 4)
})
