import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { launchZellijLayout } from '../zellij-launcher.js'

test('Zellij session creation receives the same viewport and refresh environment', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-launch-env-'))
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    status: process.env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS
  }
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1'
  process.env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS = 'ok'
  try {
    const report = await launchZellijLayout({
      root,
      missionId: 'M-launch-env',
      kind: 'naruto',
      attach: false,
      launchEnv: {
        SKS_ZELLIJ_FAKE_ADAPTER: '1',
        SKS_ZELLIJ_FAKE_ROOT: root,
        SKS_ZELLIJ_VIEWPORTS: '3',
        SKS_ZELLIJ_REFRESH_MS: '725'
      }
    })
    assert.equal(report.ok, true)
    const calls = (await fsp.readFile(path.join(root, '.sneakoscope', 'fake-zellij-calls.jsonl'), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const create = calls.find((row) => row.args?.[0] === 'attach' && row.args?.[1] === '--create-background')
    assert.ok(create)
    assert.equal(create.sks_zellij_viewports, '3')
    assert.equal(create.sks_zellij_refresh_ms, '725')
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter)
    restoreEnv('SKS_ZELLIJ_CAPABILITY_FAKE_STATUS', previous.status)
    await fsp.rm(root, { recursive: true, force: true })
  }
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
