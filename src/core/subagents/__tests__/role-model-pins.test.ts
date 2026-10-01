import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { subagentSpawnPolicyBlockReason } from '../../hooks-runtime/subagent-spawn-policy.js'
import {
  managedOfficialSubagentFileContent,
  managedOfficialSubagentRoleBody,
  managedOfficialSubagentRoleByName,
  managedOfficialSubagentRoleContent
} from '../../managed-assets/managed-assets-manifest.js'
import { installOfficialSubagentAgentConfigs } from '../official-subagent-config.js'
import {
  pinnedModelOfRoleFile,
  refreshStaleManagedRolePins,
  stalePinForAgentType,
  staleManagedRolePins
} from '../role-model-pins.js'

const role = managedOfficialSubagentRoleByName('implementation_specialist')!

// The tier resolver reads process.env, so each case points CODEX_HOME at a
// temp home holding (or lacking) a models cache and restores it afterwards.
async function withProject(
  models: Array<{ slug: string }> | null,
  pin: string | null,
  run: (ctx: { root: string; env: NodeJS.ProcessEnv; file: string; cache: string }) => Promise<void>
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-role-pins-'))
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-role-pins-home-'))
  const previous = process.env.CODEX_HOME
  process.env.CODEX_HOME = codexHome
  const cache = path.join(codexHome, 'models_cache.json')
  if (models) await fs.writeFile(cache, JSON.stringify({ fetched_at: 'x', models }))
  const file = path.join(root, '.codex', 'agents', role.filename)
  if (pin) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, managedOfficialSubagentFileContent(role.id, role.schema_version, managedOfficialSubagentRoleBody({ ...role, model: pin })))
  }
  try {
    await run({ root, env: { ...process.env, CODEX_HOME: codexHome }, file, cache })
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previous
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(codexHome, { recursive: true, force: true })
  }
}

const NEWEST = [{ slug: 'gpt-6-sol' }, { slug: 'gpt-6.1-sol' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }]

test('a role file pinned to an older sol is stale, refused at spawn, and refreshed to the newest sol', async () => {
  await withProject(NEWEST, 'gpt-6-sol', async ({ root, env, file }) => {
    assert.equal(role.model, 'gpt-6.1-sol')
    assert.equal(pinnedModelOfRoleFile(await fs.readFile(file, 'utf8')), 'gpt-6-sol')
    const stale = stalePinForAgentType('implementation_specialist', { root, env })
    assert.equal(stale?.pinned, 'gpt-6-sol')
    assert.equal(stale?.current, 'gpt-6.1-sol')
    assert.deepEqual(staleManagedRolePins({ root, env }).map((entry) => entry.role), ['implementation_specialist'])

    const spawn = { tool_name: 'spawn_agent', tool_input: { agent_type: 'implementation_specialist', model: 'gpt-6.1-sol', fork_turns: 'none', message: 'Do the slice.' } }
    const reason = subagentSpawnPolicyBlockReason(spawn, { root })
    assert.match(String(reason), /pins gpt-6-sol/)
    assert.match(String(reason), /sks doctor --fix/)
    // Without a root the gate cannot read role files and keeps its model-only check.
    assert.equal(subagentSpawnPolicyBlockReason(spawn), null)

    const refreshed = await refreshStaleManagedRolePins({ root, env })
    assert.equal(refreshed.stale, 1)
    assert.deepEqual(refreshed.updated, ['.codex/agents/implementation-specialist.toml'])
    assert.equal(refreshed.remaining, 0)
    // Only the stale file is rewritten: missing role files are not created by a refresh.
    assert.deepEqual(await fs.readdir(path.dirname(file)), [role.filename])
    assert.equal(await fs.readFile(file, 'utf8'), managedOfficialSubagentRoleContent(role))
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    assert.equal(subagentSpawnPolicyBlockReason(spawn, { root }), null)
    assert.deepEqual(await refreshStaleManagedRolePins({ root, env }), { stale: 0, updated: [], remaining: 0 })
  })
})

test('a user-owned role file and a role with a current pin are never judged stale', async () => {
  await withProject(NEWEST, 'gpt-6.1-sol', async ({ root, env, file }) => {
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    await fs.writeFile(file, 'name = "implementation_specialist"\nmodel = "gpt-6-sol"\ndeveloper_instructions = """mine"""\n')
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    assert.deepEqual(staleManagedRolePins({ root, env }), [])
    assert.equal(stalePinForAgentType('not-a-managed-role', { root, env }), null)
  })
})

test('without the Codex models cache nothing is judged stale, a newer pin survives the built-in ids, and a provably older one does not', async () => {
  await withProject(null, 'gpt-99-sol', async ({ root, env, file }) => {
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    assert.deepEqual(staleManagedRolePins({ root, env }), [])
    const before = await fs.readFile(file, 'utf8')
    const result = await installOfficialSubagentAgentConfigs(root, { apply: true })
    assert.equal(await fs.readFile(file, 'utf8'), before)
    assert.ok(result.existing.includes('.codex/agents/implementation-specialist.toml'))
    assert.deepEqual(result.updated, [])
  })
  await withProject(null, 'gpt-5.6-sol', async ({ root, file }) => {
    const result = await installOfficialSubagentAgentConfigs(root, { apply: true })
    assert.deepEqual(result.updated, ['.codex/agents/implementation-specialist.toml'])
    assert.equal(await fs.readFile(file, 'utf8'), managedOfficialSubagentRoleContent(role))
  })
})

test('a newer pin than the current model is never stale, so a briefly shrunken cache cannot downgrade role files', async () => {
  await withProject([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }], 'gpt-6.1-sol', async ({ root, env }) => {
    assert.equal(role.model, 'gpt-6-sol')
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    assert.deepEqual(staleManagedRolePins({ root, env }), [])
    assert.deepEqual(await refreshStaleManagedRolePins({ root, env }), { stale: 0, updated: [], remaining: 0 })
  })
})

test('the project role file is the layer that applies: a user-owned or current project file shields a stale home file', async () => {
  const writeHome = async (env: NodeJS.ProcessEnv, pin: string) => {
    const home = path.join(String(env.CODEX_HOME), 'agents', role.filename)
    await fs.mkdir(path.dirname(home), { recursive: true })
    await fs.writeFile(home, managedOfficialSubagentFileContent(role.id, role.schema_version, managedOfficialSubagentRoleBody({ ...role, model: pin })))
    return home
  }
  await withProject(NEWEST, null, async ({ root, env }) => {
    const home = await writeHome(env, 'gpt-6-sol')
    // no project file: the stale home file applies
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env })?.file, home)
    // a user-owned project file wins and is never judged
    const project = path.join(root, '.codex', 'agents', role.filename)
    await fs.mkdir(path.dirname(project), { recursive: true })
    await fs.writeFile(project, 'name = "implementation_specialist"\nmodel = "gpt-6-sol"\ndeveloper_instructions = """mine"""\n')
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    // an SKS-owned current project file wins too
    await fs.writeFile(project, managedOfficialSubagentRoleContent(role))
    assert.equal(stalePinForAgentType('implementation_specialist', { root, env }), null)
    // but a refresh still heals the stale home file
    assert.deepEqual((await refreshStaleManagedRolePins({ root, env })).remaining, 0)
  })
})

test('without the cache, a newer role pin survives an SKS body update instead of being downgraded to the built-in id', async () => {
  await withProject(null, null, async ({ root, file }) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const olderBody = { ...role, model: 'gpt-99-sol', developer_instructions: `${role.developer_instructions}\nAn older SKS wrote this line.` }
    await fs.writeFile(file, managedOfficialSubagentFileContent(role.id, role.schema_version, managedOfficialSubagentRoleBody(olderBody)))
    const result = await installOfficialSubagentAgentConfigs(root, { apply: true })
    assert.deepEqual(result.updated, ['.codex/agents/implementation-specialist.toml'])
    assert.equal(await fs.readFile(file, 'utf8'), managedOfficialSubagentRoleContent({ ...role, model: 'gpt-99-sol' }))
  })
})

test('the managed role catalog follows the models cache after its first read instead of keeping an import-time snapshot', async () => {
  await withProject([{ slug: 'gpt-6-sol' }, { slug: 'gpt-6-luna' }, { slug: 'gpt-6-astra' }], null, async ({ cache }) => {
    assert.equal(role.model, 'gpt-6-sol')
    await fs.writeFile(cache, JSON.stringify({ fetched_at: 'x', models: NEWEST }))
    assert.equal(role.model, 'gpt-6.1-sol')
    assert.match(managedOfficialSubagentRoleContent(role), /model = "gpt-6\.1-sol"/)
  })
})
