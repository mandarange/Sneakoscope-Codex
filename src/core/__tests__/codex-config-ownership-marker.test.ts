import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { hasSksManagedCodexConfigMarker, isUnmanagedProjectCodexConfig } from '../codex/codex-config-guard.js'
import { splitCodexProjectConfigPolicy } from '../codex/codex-project-config-policy.js'

test('legacy SKS TOML shapes count as ownership markers without matching comments or near misses', () => {
  for (const text of [
    'model_provider = "codex-lb"\n',
    'default_profile = "sks-fast-high"\n',
    '[user.fast_mode]\nenabled = true\n',
    '[model_providers."codex-lb"]\nbase_url = "http://127.0.0.1"\n',
    '[profiles.sks-fast-high]\nservice_tier = "fast"\n',
    '# SKS managed\nfoo = 1\n'
  ]) assert.equal(hasSksManagedCodexConfigMarker(text), true, text)

  for (const text of [
    '# model_provider = "codex-lb"\nuser_config = true\n',
    'model_provider = "my-codex-lb"\n',
    'default_profile = "sks-fast-high-custom"\n',
    '[user.fast_mode_custom]\nenabled = true\n'
  ]) assert.equal(hasSksManagedCodexConfigMarker(text), false, text)
})

test('user-authored project configs without SKS artifacts remain unmanaged', () => {
  const root = '/repo'
  const configPath = path.join(root, '.codex', 'config.toml')
  assert.equal(isUnmanagedProjectCodexConfig(root, configPath, 'user_config = true\n'), true)
  assert.equal(isUnmanagedProjectCodexConfig(root, configPath, 'model_provider = "openai"\nsandbox_mode = "read-only"\n'), true)
  assert.equal(isUnmanagedProjectCodexConfig(root, configPath, 'model_provider = "codex-lb"\n'), false)
})

test('splitter migrates legacy SKS machine-local keys but blocks user-authored configs', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ownership-marker-'))
  try {
    const root = path.join(tmp, 'project')
    const codexHome = path.join(tmp, 'home', '.codex')
    const configPath = path.join(root, '.codex', 'config.toml')
    await fsp.mkdir(path.dirname(configPath), { recursive: true })

    await fsp.writeFile(configPath, 'model_provider = "codex-lb"\nsandbox_mode = "workspace-write"\n', 'utf8')
    const managed = await splitCodexProjectConfigPolicy(root, { apply: true, codexHome, writeReport: false })
    assert.equal(managed.ok, true, JSON.stringify(managed.blockers))
    assert.deepEqual(managed.moved_keys, ['model_provider'])
    const projectAfter = await fsp.readFile(configPath, 'utf8')
    assert.match(projectAfter, /sandbox_mode = "workspace-write"/)
    assert.doesNotMatch(projectAfter, /^\s*model_provider\s*=/m)

    await fsp.writeFile(configPath, 'model_provider = "openai"\nsandbox_mode = "read-only"\n', 'utf8')
    const blocked = await splitCodexProjectConfigPolicy(root, { apply: true, codexHome, writeReport: false })
    assert.equal((blocked as any).status, 'blocked_unmanaged_project_config')
    assert.equal(blocked.ok, false)
    assert.equal(await fsp.readFile(configPath, 'utf8'), 'model_provider = "openai"\nsandbox_mode = "read-only"\n')
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true })
  }
})
