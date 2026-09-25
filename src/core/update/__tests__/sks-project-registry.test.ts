import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  knownSksProjects,
  recordSksProject,
  sksProjectRegistryPath,
  spawnProjectMigrationFanout
} from '../sks-project-registry.js'

function fixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sks-project-registry-')))
  const home = path.join(base, 'home')
  const env: NodeJS.ProcessEnv = { HOME: home, CODEX_HOME: path.join(home, '.codex'), SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global') }
  const project = (name: string, marker: string | null) => {
    const root = path.join(base, name)
    fs.mkdirSync(root, { recursive: true })
    if (marker) {
      fs.mkdirSync(path.join(root, path.dirname(marker)), { recursive: true })
      fs.writeFileSync(path.join(root, marker), '{}')
    }
    return root
  }
  return { base, home, env, project, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) }
}

test('known projects merge the registry with Codex-trusted folders and keep only real SKS projects', async () => {
  const f = fixture()
  try {
    const hookOnly = f.project('hook-only', '.codex/SNEAKOSCOPE.md')
    const initialized = f.project('initialized', '.sneakoscope/manifest.json')
    const plain = f.project('plain', null)
    const korean = f.project(`무제 "폴더"`, '.codex/SNEAKOSCOPE.md')
    const missionAgents = f.project('hook-only/.sneakoscope/missions/M-1/agents', '.codex/SNEAKOSCOPE.md')
    fs.mkdirSync(f.env.CODEX_HOME!, { recursive: true })
    fs.writeFileSync(path.join(f.env.CODEX_HOME!, 'config.toml'), [
      'model = "gpt-6-astra"',
      `[projects.${JSON.stringify(hookOnly)}]`, 'trust_level = "trusted"',
      `[projects.${JSON.stringify(plain)}]`, 'trust_level = "trusted"',
      `[projects.${JSON.stringify(korean)}]`, 'trust_level = "trusted"',
      `[projects.${JSON.stringify(missionAgents)}]`, 'trust_level = "trusted"',
      `[projects.${JSON.stringify(f.home)}]`, 'trust_level = "trusted"',
      ''
    ].join('\n'))
    assert.equal(await recordSksProject(initialized, { env: f.env, ephemeralRoots: [] }), true)
    assert.equal(await recordSksProject(plain, { env: f.env, ephemeralRoots: [] }), false, 'a folder without an SKS marker is not recorded')

    const known = await knownSksProjects({ env: f.env, ephemeralRoots: [] })
    assert.deepEqual(known, [hookOnly, initialized, korean].sort())
    assert.deepEqual(await knownSksProjects({ env: f.env, ephemeralRoots: [], exclude: [initialized] }), [hookOnly, korean].sort())
    assert.deepEqual(await knownSksProjects({ env: f.env }), [], 'temporary folders are never projects')
  } finally {
    f.cleanup()
  }
})

test('recording a project writes at most once a day, and tests never start the background runner', async () => {
  const f = fixture()
  try {
    const root = f.project('app', '.codex/SNEAKOSCOPE.md')
    assert.equal(await recordSksProject(root, { env: f.env, ephemeralRoots: [] }), true)
    const registry = sksProjectRegistryPath(f.env)
    const first = fs.readFileSync(registry, 'utf8')
    assert.equal(await recordSksProject(root, { env: f.env, ephemeralRoots: [] }), true)
    assert.equal(fs.readFileSync(registry, 'utf8'), first)
    assert.equal(JSON.parse(first).projects[0].root, root)

    const spawn = await spawnProjectMigrationFanout([root], f.env)
    assert.deepEqual(spawn, { spawned: false, count: 1, reason: 'disabled', pid: null })
  } finally {
    f.cleanup()
  }
})
