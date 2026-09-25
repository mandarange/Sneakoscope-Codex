import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { repairManagedPermissions, type ElevationChannel } from '../managed-permission-repair.js'

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-perm-repair-'))
  const home = path.join(base, 'home')
  const root = path.join(base, 'project')
  const write = (p: string, text = 'x') => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
  }
  write(path.join(root, '.sneakoscope', 'missions', 'm1', 'state.json'))
  write(path.join(home, '.agents', 'skills', 'sks-demo', 'SKILL.md'))
  write(path.join(home, '.agents', 'skills', 'my-skill', 'SKILL.md'))
  write(path.join(home, '.codex', 'config.toml'), 'model = "m"\n')
  write(path.join(home, '.codex', 'sessions', 's.jsonl'))
  const cleanup = () => {
    spawnSync('chmod', ['-R', 'u+rwX', base])
    if (process.platform === 'darwin') spawnSync('chflags', ['-R', 'nouchg', base])
    fs.rmSync(base, { recursive: true, force: true })
  }
  return { base, home, root, globalRoot: path.join(home, '.sneakoscope-global'), write, cleanup }
}

test('owned read-only folders and user flags are fixed without elevation, so update can delete them', async () => {
  const f = fixture()
  try {
    const mission = path.join(f.root, '.sneakoscope', 'missions', 'm1')
    const skill = path.join(f.home, '.agents', 'skills', 'sks-demo')
    const userSkill = path.join(f.home, '.agents', 'skills', 'my-skill')
    fs.chmodSync(mission, 0o500)
    fs.chmodSync(skill, 0o500)
    fs.chmodSync(userSkill, 0o500)
    const locked = path.join(f.home, '.sneakoscope', 'state', 'locked.json')
    f.write(locked)
    if (process.platform === 'darwin') assert.equal(spawnSync('chflags', ['uchg', locked]).status, 0)

    const report = await repairManagedPermissions({ root: f.root, home: f.home, globalRoot: f.globalRoot, reportPath: null })
    assert.equal(report.ok, true, JSON.stringify(report.remaining))
    assert.equal(report.elevation.needed, false)
    assert.ok(report.user_fixed >= (process.platform === 'darwin' ? 3 : 2), String(report.user_fixed))
    fs.rmSync(mission, { recursive: true })
    fs.rmSync(skill, { recursive: true })
    fs.rmSync(locked)
    assert.equal(fs.statSync(userSkill).mode & 0o777, 0o500, 'a user-authored skill is not SKS-managed and stays untouched')
  } finally {
    f.cleanup()
  }
})

test('foreign-owned managed paths ask for elevation once, confined to SKS paths; a decline is not repeated', async () => {
  const f = fixture()
  try {
    const quoted = path.join(f.home, '.agents', 'skills', "sks-o'brien")
    f.write(path.join(quoted, 'SKILL.md'))
    const scripts: string[] = []
    const runElevated = async (script: string, channel: ElevationChannel) => {
      assert.equal(channel, 'macos_admin_dialog')
      scripts.push(script)
      return { ok: false, declined: true, error: 'User canceled. (-128)' }
    }
    // Another uid makes every managed entry look root-owned.
    const common = { root: f.root, home: f.home, globalRoot: f.globalRoot, uid: process.getuid!() + 1, gid: process.getgid!(), channel: 'macos_admin_dialog' as const, runElevated, reportPath: null }

    const report = await repairManagedPermissions({ ...common, explicit: true })
    assert.equal(scripts.length, 1)
    const script = scripts[0]!
    const recursiveLines = script.split('\n').filter((line) => / -R /.test(line)).join('\n')
    const singleLines = script.split('\n').filter((line) => !/ -R /.test(line)).join('\n')
    assert.ok(recursiveLines.includes(`'${path.join(f.root, '.sneakoscope')}'`), script)
    assert.ok(recursiveLines.includes(`'${path.join(f.home, '.agents', 'skills', 'sks-demo')}'`), script)
    assert.ok(recursiveLines.includes(`'\\''brien'`), 'a quote in a path is shell-escaped')
    assert.ok(singleLines.includes(`'${path.join(f.home, '.codex')}'`), 'the ~/.codex container is fixed without recursion')
    assert.ok(!script.includes('my-skill') && !script.includes('sessions'), 'user skills and Codex sessions are never elevated')
    assert.equal(report.elevation.declined, true)
    assert.ok(report.warnings.includes('managed_permission_elevation_declined'), report.warnings.join(','))
    assert.match(report.operator_actions[0] || '', /^SKS could not repair permissions on .*\nsudo \/bin\/sh -c /)

    const gate = await repairManagedPermissions({ ...common, explicit: false })
    assert.equal(scripts.length, 1, 'the first-command gate does not repeat a declined prompt')
    assert.equal(gate.elevation.channel, 'cooldown')
  } finally {
    f.cleanup()
  }
})

test('tests and CI never elevate, even with foreign-owned paths', async () => {
  const f = fixture()
  try {
    const report = await repairManagedPermissions({
      root: f.root,
      home: f.home,
      globalRoot: f.globalRoot,
      uid: process.getuid!() + 1,
      explicit: true,
      reportPath: null,
      runElevated: async () => assert.fail('must not elevate under node --test')
    })
    assert.equal(report.elevation.channel, 'disabled')
    assert.equal(report.ok, false)
    assert.ok(report.operator_actions.length > 0)
  } finally {
    f.cleanup()
  }
})
