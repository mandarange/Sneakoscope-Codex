import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fixture, runtime, run, serviceStatus, store } from './openrouter-only-controller-fixture.js'
import { readNativeSubagentModelStore, subagentModelListsPath } from '../../subagents/child-model-allowlist.js'
import { readActiveCombinedBridgeCatalog, combinedBridgeCatalogPath, bridgeRouteIndexPath } from '../combined-catalog.js'

const OAUTH_MODEL = 'gpt-6.1-sol'
async function oauthCache(home: string) {
  await fs.writeFile(path.join(home, '.codex', 'models_cache.json'), JSON.stringify({ models: [{
    slug: OAUTH_MODEL, display_name: 'OAuth Sol', visibility: 'list',
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'ultra' }]
  }] }))
}

test('OAuth lists work with no gateway configuration or running Desktop Bridge', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-oauth-child-list-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  await fs.mkdir(path.join(home, '.codex'), { recursive: true })
  await oauthCache(home)
  const options = {
    home,
    env: { HOME: home, SKS_HOME: path.join(home, '.sneakoscope'), CODEX_HOME: undefined, CODEX_LB_API_KEY: '', CODEX_LB_BASE_URL: '', OPENROUTER_API_KEY: '', SKS_OPENROUTER_API_KEY: '', SKS_SKIP_CODEX_APP_RESTART: '1' },
    serviceStatusImpl: async () => serviceStatus(home, false)
  }
  const list = await run({ operation: 'subagent-models.list' }, options)
  assert.equal((list.result.subagent_model_settings as any).profile, 'openai')
  assert.equal((list.result.subagent_model_settings as any).editable, true)
  const saved = await run({ operation: 'subagent-models.set', profile: 'openai', no_restart: true, subagent_models: [{ model: OAUTH_MODEL, reasoning_effort: 'ultra' }] }, options)
  assert.equal(saved.ok, true, JSON.stringify(saved.execution))
  assert.equal(readNativeSubagentModelStore({ home }).store.profiles.openai[0]?.model, OAUTH_MODEL)
  await assert.rejects(fs.access(path.join(home, '.codex', 'sks', 'desktop-bridge-settings.json')))
  await assert.rejects(fs.access(path.join(home, '.codex', 'auth.json')))
})

test('Center can list and save Codex-LB and OAuth models without enabling OpenRouter Only or changing the parent', async t => {
  const setup = await fixture(t)
  const rt = runtime(setup)
  await oauthCache(setup.home)
  const catalog = await readActiveCombinedBridgeCatalog(combinedBridgeCatalogPath(setup.codexHome), bridgeRouteIndexPath(setup.codexHome))
  assert.ok(catalog.ok && catalog.catalog_path)
  await fs.appendFile(setup.configPath, `model_catalog_json = ${JSON.stringify(catalog.catalog_path)}\n`)
  assert.equal((await run({ operation: 'auth-priority.set', enabled: true }, rt.options)).ok, true)
  const before = await fs.readFile(setup.configPath, 'utf8')
  const list = await run({ operation: 'subagent-models.list' }, rt.options)
  const lb = list.result.subagent_model_settings as any
  assert.equal(lb.profile, 'codex_lb')
  assert.equal(lb.editable, true)
  assert.ok(lb.available.some((row: any) => row.public_id === 'gpt-6-astra'))
  assert.deepEqual(lb.available.find((row: any) => row.public_id === 'gpt-6-astra').reasoning_efforts, [], 'a provider that lists no efforts offers only Default')
  assert.ok(lb.available.every((row: any) => !row.public_id.startsWith('vendor-')))
  const savedLb = await run({ operation: 'subagent-models.set', profile: 'codex_lb', subagent_models: [{ model: 'gpt-6-astra', criteria: 'deep reviews', reasoning_effort: null, default: true }] }, rt.options)
  assert.equal(savedLb.ok, true, JSON.stringify(savedLb.execution))
  assert.equal((savedLb.result.subagent_model_settings as any).subagent_models[0].routable, true)
  assert.equal(await fs.readFile(setup.configPath, 'utf8'), before, 'editing children does not write the main model or authentication')
  assert.equal(store(setup).enabled, false)

  assert.equal((await run({ operation: 'auth-priority.set', enabled: false }, rt.options)).ok, true)
  const oauthBefore = await fs.readFile(setup.configPath, 'utf8')
  const oauth = await run({ operation: 'subagent-models.list' }, rt.options)
  const settings = oauth.result.subagent_model_settings as any
  assert.equal(settings.profile, 'openai')
  assert.deepEqual(settings.available.map((row: any) => row.public_id), [OAUTH_MODEL])
  assert.deepEqual(settings.subagent_models, [], 'new connection starts with its own list')
  const savedOauth = await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: [{ model: OAUTH_MODEL, criteria: 'implementation', reasoning_effort: 'ultra' }] }, rt.options)
  assert.equal(savedOauth.ok, true, JSON.stringify(savedOauth.execution))
  assert.equal(await fs.readFile(setup.configPath, 'utf8'), oauthBefore)
  const lists = readNativeSubagentModelStore({ home: setup.home }).store.profiles
  assert.equal(lists.codex_lb[0]?.model, 'gpt-6-astra')
  assert.equal(lists.openai[0]?.model, OAUTH_MODEL)
  assert.equal(store(setup).enabled, false)
  assert.equal((await run({ operation: 'auth-priority.set', enabled: true }, rt.options)).ok, true)
  const restored = await run({ operation: 'subagent-models.list' }, rt.options)
  assert.equal((restored.result.subagent_model_settings as any).subagent_models[0].criteria, 'deep reviews')
})

test('native saves reject unavailable models, unsupported effort, stale connection bindings and damaged stores', async t => {
  const setup = await fixture(t)
  const rt = runtime(setup)
  await oauthCache(setup.home)
  const valid = [{ model: OAUTH_MODEL, reasoning_effort: 'high' }]
  assert.equal((await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: valid }, rt.options)).ok, true)
  const file = subagentModelListsPath({ home: setup.home })
  const before = await fs.readFile(file, 'utf8')
  for (const [models, blocker] of [
    [[{ model: 'vendor/not-oauth' }], 'subagent_model_not_available:0'],
    [[{ model: OAUTH_MODEL, reasoning_effort: 'max' }], 'subagent_model_effort_unsupported:0']
  ] as const) {
    const rejected = await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: models }, rt.options)
    assert.equal(rejected.ok, false)
    assert.ok(rejected.execution.blockers.includes(blocker))
    assert.equal(await fs.readFile(file, 'utf8'), before)
  }
  const stale = await run({ operation: 'subagent-models.set', profile: 'codex_lb', subagent_models: valid }, rt.options)
  assert.equal(stale.ok, false)
  assert.ok(stale.execution.blockers.includes('subagent_model_profile_changed'))
  assert.equal(await fs.readFile(file, 'utf8'), before)
  await fs.writeFile(file, '{broken')
  const unavailable = await run({ operation: 'subagent-models.list' }, rt.options)
  assert.equal((unavailable.result.subagent_model_settings as any).editable, false)
  const invalid = await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: valid }, rt.options)
  assert.equal(invalid.ok, false)
  assert.equal(await fs.readFile(file, 'utf8'), '{broken')
})

test('clearing an OAuth list returns to automatic tiers while legacy OpenRouter staging still works', async t => {
  const setup = await fixture(t)
  const rt = runtime(setup)
  await oauthCache(setup.home)
  const legacy = await run({ operation: 'subagent-models.set', subagent_models: [{ model: 'vendor-a/model-one', criteria: 'router' }] }, rt.options)
  assert.equal(legacy.ok, true)
  assert.equal(store(setup).subagent_models[0]?.criteria, 'router')
  assert.equal((await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: [{ model: OAUTH_MODEL }] }, rt.options)).ok, true)
  const cleared = await run({ operation: 'subagent-models.set', profile: 'openai', subagent_models: [] }, rt.options)
  assert.equal(cleared.ok, true)
  assert.equal((cleared.result.subagent_model_settings as any).configured, false)
  assert.deepEqual((cleared.result.subagent_model_settings as any).subagent_models, [])
  assert.equal(store(setup).subagent_models[0]?.criteria, 'router')
})
