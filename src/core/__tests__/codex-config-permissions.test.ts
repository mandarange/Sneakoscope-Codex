import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeCodexConfigGuarded } from '../codex/codex-config-guard.js'
import { ensureGlobalCodexFastModeDuringInstall } from '../codex-runtime/codex-desktop-config-policy.js'
import { writeTextAtomic } from '../fsx.js'

test('guarded Codex config rewrites keep config and backups owner-only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-mode-root-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-config-mode-home-'))
  const configPath = path.join(home, '.codex', 'config.toml')
  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, 'service_tier = "standard"\n', { mode: 0o600 })
    const result = await writeCodexConfigGuarded({
      root,
      configPath,
      cause: 'permission-test',
      mutate: () => 'service_tier = "fast"\n'
    })
    assert.equal(result.ok, true)
    assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600)
    assert.ok(result.backup_path)
    assert.equal((await fs.stat(String(result.backup_path))).mode & 0o777, 0o600)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  }
})

test('atomic same-content writes still enforce an explicit owner-only mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-same-content-mode-'))
  const file = path.join(root, 'config.toml')
  try {
    await fs.writeFile(file, 'service_tier = "fast"\n', { mode: 0o644 })
    await writeTextAtomic(file, 'service_tier = "fast"\n', { mode: 0o600 })
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('unchanged guarded and install-time Codex configs are hardened to owner-only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-present-config-mode-root-'))
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-present-config-mode-home-'))
  const configPath = path.join(home, '.codex', 'config.toml')
  try {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, 'service_tier = "fast"\n', { mode: 0o644 })
    const guarded = await writeCodexConfigGuarded({ root, configPath, mutate: (text) => text })
    assert.equal(guarded.status, 'present')
    assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600)

    await ensureGlobalCodexFastModeDuringInstall({ home, configPath, forceFastMode: true })
    await fs.chmod(configPath, 0o644)
    const present = await ensureGlobalCodexFastModeDuringInstall({ home, configPath, forceFastMode: true })
    assert.equal(present.status, 'present')
    assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(home, { recursive: true, force: true })
  }
})
