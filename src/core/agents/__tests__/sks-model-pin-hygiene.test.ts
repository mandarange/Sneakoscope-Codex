import '../../__tests__/helpers/isolated-test-home.js'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { activateCombinedBridgeCatalog, bridgeRouteIndexPath, buildCombinedBridgeCatalog, combinedBridgeCatalogPath } from '../../codex-lb/combined-catalog.js'
import { resolveAllProviderCredentials } from '../../codex-lb/provider-credentials.js'
import { resolveBridgeProviderRegistry } from '../../codex-lb/provider-registry.js'
import { reconcileStaleSksModelPins } from '../sks-model-pin-hygiene.js'

// What SKS 4.6.3 wrote into ~/.codex/agents (observed on a team member's Mac):
// Codex runs this pin over every spawn's model, and gpt-5.5 at service tier
// priority has no Codex-LB account behind it.
const LEGACY_PLANNER = [
  'name = "sks-planner"',
  'description = "SKS managed 4.6.3 directive role: sks-planner"',
  'model = "gpt-5.5"',
  'model_provider = "codex-lb"',
  'model_reasoning_effort = "medium"',
  'sandbox_mode = "read-only"',
  'developer_instructions = """',
  'model = "not-a-pin: this line is instruction text"',
  '"""',
  ''
].join('\n')
const CURRENT_MANAGED = '# SKS-MANAGED-OFFICIAL-SUBAGENT\n# sks_managed_body_sha256 = "abc"\nname = "worker"\nmodel = "gpt-5.5"\n'
const USER_ROLE = 'name = "my-reviewer"\ndescription = "Mine"\nmodel = "gpt-5.5"\n'
const PROJECT_CONFIG = '# SKS-MANAGED-CODEX-CONFIG\nmodel = "gpt-5.5"\nmodel_provider = "codex-lb"\napproval_policy = "never"\n\n[features]\nhooks = true\n'

async function activeCatalog(codexHome: string): Promise<void> {
  const credentials = await resolveAllProviderCredentials({
    codexLb: {
      loadCodexLbEnvImpl: async () => ({
        schema: 'sks.codex-lb-env.v1', configured: true, missing: [], source: 'env-file', source_priority: ['env-file'],
        base_url: 'https://lb.example.test/backend-api/codex',
        api_key: { present: true, usable: true, source: 'env-file', redacted: true, fingerprint: 'aaaaaaaaaaaaaaaa' },
        secret_api_key: 'lb-catalog-secret',
        credential_binding: { checked: true, present: true, valid: true, status: 'matched', metadata_path: '/fixture', api_key_matches: true, base_url_matches: true, blockers: [] },
        env_paths: ['/fixture'], keychain: { checked: false, available: false, status: 'not_used' }
      }),
      validation: { state: 'ready', checked_at: '2026-10-22T00:00:00.000Z' }
    },
    openrouter: {
      resolveOpenRouterApiKeyImpl: async () => ({ key: 'or-catalog-secret', source: 'user-secret-store', key_preview: 'or-...', blockers: [], warnings: [] }),
      validation: { state: 'ready', checked_at: '2026-10-22T00:00:00.000Z' }
    }
  })
  const registry = await resolveBridgeProviderRegistry({ registryPath: '/missing/provider-registry.json', credentials })
  const build = buildCombinedBridgeCatalog(registry, {
    catalogs: {
      'codex-lb': {
        provider_id: 'codex-lb', state: 'verified', generation: 'lb-generation',
        // As Codex-LB serves OpenAI's rows: gpt-5.5 is listed, but retiring.
        models: { models: [
          { slug: 'gpt-5.5', display_name: 'GPT-5.5', priority: 10, upgrade: { model: 'gpt-6-sol', migration_markdown: 'Switch.' } },
          { slug: 'gpt-6-sol', display_name: 'GPT-6 Sol', priority: 2 },
          { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', priority: 1 }
        ] }
      },
      openrouter: { provider_id: 'openrouter', state: 'verified', generation: 'or-generation', models: [{ id: 'vendor/model', name: 'Vendor' }] }
    },
    created_at: '2026-10-22T00:00:00.000Z'
  })
  const activation = await activateCombinedBridgeCatalog({ build, catalogPath: combinedBridgeCatalogPath(codexHome), routeIndexPath: bridgeRouteIndexPath(codexHome) })
  assert.equal(activation.activated, true, JSON.stringify(activation.blockers))
}

async function fixture(t: test.TestContext, withCatalog: boolean) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-model-pin-hygiene-'))
  t.after(() => fs.rm(base, { recursive: true, force: true }))
  const codexHome = path.join(base, 'home', '.codex')
  const root = path.join(base, 'project')
  await fs.mkdir(path.join(codexHome, 'agents'), { recursive: true })
  await fs.mkdir(path.join(root, '.codex', 'agents'), { recursive: true })
  await fs.writeFile(path.join(codexHome, 'agents', 'sks-planner.toml'), LEGACY_PLANNER)
  await fs.writeFile(path.join(codexHome, 'agents', 'worker.toml'), CURRENT_MANAGED)
  await fs.writeFile(path.join(codexHome, 'agents', 'my-reviewer.toml'), USER_ROLE)
  await fs.writeFile(path.join(root, '.codex', 'agents', 'sks-implementer.toml'), LEGACY_PLANNER.replace(/sks-planner/g, 'sks-implementer'))
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), PROJECT_CONFIG)
  if (withCatalog) await activeCatalog(codexHome)
  return { root, codexHome, read: (file: string) => fs.readFile(file, 'utf8') }
}

test('stale SKS model pins leave legacy roles and SKS project configs; current roles and user files are untouched', async (t) => {
  const f = await fixture(t, true)
  const planner = path.join(f.codexHome, 'agents', 'sks-planner.toml')
  const projectConfig = path.join(f.root, '.codex', 'config.toml')

  const dryRun = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: false })
  assert.equal(dryRun.changes.length, 0)
  assert.deepEqual(dryRun.remaining.map((row) => path.basename(row.file)).sort(), ['config.toml', 'sks-implementer.toml', 'sks-planner.toml'])
  assert.equal(await f.read(planner), LEGACY_PLANNER, 'a report-only run writes nothing')

  const fixed = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.deepEqual(fixed.errors, [])
  assert.equal(fixed.catalog_available, true)
  const byFile = new Map(fixed.changes.map((row) => [path.basename(row.file), row]))
  assert.deepEqual(byFile.get('sks-planner.toml')?.removed, ['model = "gpt-5.5"', 'model_provider = "codex-lb"'])
  assert.deepEqual(byFile.get('config.toml')?.removed, ['model = "gpt-5.5"', 'model_provider = "codex-lb"'])
  const plannerAfter = await f.read(planner)
  assert.doesNotMatch(plannerAfter, /^model\s*=\s*"gpt-5\.5"$/m)
  assert.doesNotMatch(plannerAfter, /^model_provider/m)
  assert.match(plannerAfter, /^model = "not-a-pin: this line is instruction text"$/m, 'instruction text is not a pin')
  assert.equal(await f.read(byFile.get('sks-planner.toml')!.backup_path!), LEGACY_PLANNER, 'the original is backed up')
  assert.doesNotMatch(await f.read(path.join(f.root, '.codex', 'agents', 'sks-implementer.toml')), /^model\s*=\s*"gpt-5\.5"$/m)
  const projectAfter = await f.read(projectConfig)
  assert.doesNotMatch(projectAfter, /^model(?:_provider)?\s*=/m)
  assert.match(projectAfter, /^approval_policy = "never"$/m)
  assert.equal(await f.read(path.join(f.codexHome, 'agents', 'worker.toml')), CURRENT_MANAGED, 'a current managed role is its own refresh\'s')
  assert.equal(await f.read(path.join(f.codexHome, 'agents', 'my-reviewer.toml')), USER_ROLE, 'a user role is never touched')

  const again = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.deepEqual([again.changes, again.remaining, again.errors], [[], [], []], 'idempotent')
})

test('without an active catalog only the codex-lb provider pin goes; a model pin cannot be judged', async (t) => {
  const f = await fixture(t, false)
  const fixed = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.equal(fixed.catalog_available, false)
  assert.deepEqual(fixed.changes.find((row) => path.basename(row.file) === 'sks-planner.toml')?.removed, ['model_provider = "codex-lb"'])
  assert.match(await f.read(path.join(f.codexHome, 'agents', 'sks-planner.toml')), /^model = "gpt-5\.5"$/m)
})

// The ownership predicate also accepts the codex-lb selection itself, so a
// user's own direct setup would read as SKS-owned and lose its provider.
const DIRECT_TABLE = '\n[model_providers.codex-lb]\nname = "codex-lb"\nbase_url = "https://lb.example.test/backend-api/codex"\nenv_key = "CODEX_LB_API_KEY"\n'

test('a direct Codex-LB setup backed by a provider table is never treated as an SKS pin', async (t) => {
  const f = await fixture(t, true)
  const projectConfig = path.join(f.root, '.codex', 'config.toml')
  const userOwned = `model_provider = "codex-lb"\nmodel = "gpt-5.5"\n${DIRECT_TABLE}`
  await fs.writeFile(projectConfig, userOwned)
  let fixed = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.equal(await f.read(projectConfig), userOwned, 'no SKS evidence beyond the selection: not ours')
  assert.equal(fixed.changes.some((row) => row.file === projectConfig), false)

  // SKS-owned on its own evidence: the stale model goes, the defined provider stays.
  await fs.writeFile(projectConfig, `# SKS-MANAGED-CODEX-CONFIG\n${userOwned}`)
  fixed = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.deepEqual(fixed.changes.find((row) => row.file === projectConfig)?.removed, ['model = "gpt-5.5"'])
  assert.match(await f.read(projectConfig), /^model_provider = "codex-lb"$/m)
})

test('a legacy role keeps model_provider = "codex-lb" when the user config defines that provider', async (t) => {
  const f = await fixture(t, true)
  await fs.writeFile(path.join(f.codexHome, 'config.toml'), `model = "gpt-6.1-sol"\n${DIRECT_TABLE}`)
  const fixed = await reconcileStaleSksModelPins({ root: f.root, codexHome: f.codexHome, fix: true })
  assert.deepEqual(fixed.changes.find((row) => path.basename(row.file) === 'sks-planner.toml')?.removed, ['model = "gpt-5.5"'])
  assert.match(await f.read(path.join(f.codexHome, 'agents', 'sks-planner.toml')), /^model_provider = "codex-lb"$/m)
})
