import '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  effectiveChildModelAllowlist, nativeSubagentModelProfile, readNativeSubagentModelStore,
  subagentModelListsPath, writeNativeSubagentModels, writeOpenRouterOnlyState
} from '../child-model-allowlist.js'
import { selectableChildModels } from '../model-tiers.js'
import { applyListRoleModels, readChildModelPlanContext } from '../child-model-plan.js'
import { buildOfficialSubagentPrompt } from '../official-subagent-prompt.js'
import { resolveNarutoCredentialPolicy } from '../naruto-host-credentials.js'
import { jevSpawnRouting } from '../../hooks-runtime/jev-spawn-routing.js'
import { subagentSpawnPolicyBlockReason } from '../../hooks-runtime/subagent-spawn-policy.js'
import { resolveWorkerModelRouting } from '../../agents/native-worker-backend-router.js'
import { setDecisionTestOverrides } from '../../decisions/integration.js'
import { defaultDecisionConfig } from '../../decisions/config.js'
import { resetDecisionTransportState } from '../../decisions/openrouter.js'
import { ensureUserReadOnlyListRole, READ_ONLY_LIST_ROLE } from '../read-only-list-role.js'

const FAST = 'gpt-6-luna'
const DEEP = 'gpt-6-astra'
const rows = [
  { slug: FAST, display_name: 'Fast', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'max' }] },
  { slug: DEEP, display_name: 'Deep', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'max' }, { effort: 'ultra' }] },
  { slug: 'gpt-5.6-luna', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }] },
  { slug: 'gpt-reserve', visibility: 'hide' },
  { slug: 'codex-no-children', visibility: 'list', multi_agent_version: 'disabled' }
]
const entries = [
  { model: FAST, criteria: 'quick edits', reasoning_effort: 'low', default: false },
  { model: DEEP, criteria: 'deep review', reasoning_effort: 'ultra', default: true }
]

async function fixture(t: test.TestContext) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-child-list-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const codex = path.join(home, '.codex')
  await fs.mkdir(path.join(codex, 'sks'), { recursive: true })
  const catalog = path.join(codex, 'catalog.json')
  await fs.writeFile(catalog, JSON.stringify({ models: [
    ...rows.map(row => ({ ...row, provider_id: 'codex-lb' })),
    { slug: 'vendor/router', provider_id: 'openrouter', visibility: 'list' }
  ] }))
  await fs.writeFile(path.join(codex, 'models_cache.json'), JSON.stringify({ models: [
    ...rows,
    { slug: 'google/gemini-flash', visibility: 'list' },
    { slug: 'openai/gpt-forwarded', visibility: 'list' }
  ] }))
  await fs.writeFile(path.join(codex, 'config.toml'), `model = "${DEEP}"\nmodel_catalog_json = ${JSON.stringify(catalog)}\n`)
  const settings = path.join(codex, 'sks', 'desktop-bridge-settings.json')
  const setProfile = (profile: 'openai' | 'codex_lb') => fs.writeFile(settings, JSON.stringify({ auth_priority_enabled: profile === 'codex_lb' }))
  await setProfile('openai')
  return { home, catalog, setProfile, env: { HOME: home, SKS_HOME: path.join(home, '.sneakoscope') } as NodeJS.ProcessEnv }
}

test('connection lists are independent, retain OpenRouter state, and clearing native lists restores tiers', async t => {
  const f = await fixture(t)
  assert.deepEqual(selectableChildModels('openai', f).map(row => row.public_id), [FAST, DEEP])
  assert.deepEqual(selectableChildModels('codex_lb', f).map(row => row.public_id), [FAST, DEEP])
  assert.equal(effectiveChildModelAllowlist(f).mode, 'tiers')
  // Concurrent writes must merge the other connection's stored list.
  await Promise.all([
    writeNativeSubagentModels('openai', entries, f),
    writeNativeSubagentModels('codex_lb', [{ model: FAST, reasoning_effort: 'max' }], f)
  ])
  assert.equal(nativeSubagentModelProfile(f), 'openai')
  assert.equal(effectiveChildModelAllowlist(f).default_model, DEEP)
  await f.setProfile('codex_lb')
  assert.equal(effectiveChildModelAllowlist(f).default_model, FAST)
  await writeOpenRouterOnlyState({ enabled: true, subagent_models: [{ model: 'vendor/router', criteria: '', reasoning_effort: 'high', default: true }] }, f)
  assert.deepEqual(effectiveChildModelAllowlist(f).models, ['vendor/router'])
  await writeOpenRouterOnlyState({ enabled: false }, f)
  assert.deepEqual(effectiveChildModelAllowlist(f).models, [FAST])
  await writeNativeSubagentModels('codex_lb', [], f)
  assert.equal(effectiveChildModelAllowlist(f).mode, 'tiers')
  await f.setProfile('openai')
  assert.deepEqual(effectiveChildModelAllowlist(f).models, [FAST, DEEP])
  assert.equal((await fs.stat(subagentModelListsPath(f))).mode & 0o777, 0o600)
})

test('missing catalog and unsupported saved effort cannot silently fall back to unrestricted tiers', async t => {
  const f = await fixture(t)
  await writeNativeSubagentModels('openai', [{ model: FAST, reasoning_effort: 'ultra' }], f)
  const unsupported = effectiveChildModelAllowlist(f)
  assert.equal(unsupported.mode, 'configured')
  assert.deepEqual(unsupported.models, [])
  await writeNativeSubagentModels('openai', entries, f)
  await fs.rm(path.join(f.home, '.codex', 'models_cache.json'))
  assert.deepEqual(selectableChildModels('openai', f), [])
  assert.deepEqual(effectiveChildModelAllowlist(f).models, [])
  assert.equal(effectiveChildModelAllowlist(f).mode, 'configured')
})

test('malformed and symlinked list files are preserved and writes fail closed', async t => {
  const f = await fixture(t)
  const file = subagentModelListsPath(f)
  await fs.writeFile(file, '{invalid')
  assert.deepEqual(readNativeSubagentModelStore(f).blockers, ['subagent_model_lists_unreadable'])
  assert.deepEqual(effectiveChildModelAllowlist(f).models, [])
  await assert.rejects(writeNativeSubagentModels('openai', entries, f), /subagent_model_lists_unreadable/)
  assert.equal(await fs.readFile(file, 'utf8'), '{invalid')
  await fs.rm(file)
  const outside = path.join(f.home, 'outside.json')
  await fs.writeFile(outside, 'keep this file')
  await fs.symlink(outside, file)
  await assert.rejects(writeNativeSubagentModels('openai', entries, f), /subagent_model_lists_unsafe_path/)
  assert.equal(await fs.readFile(outside, 'utf8'), 'keep this file')
})

test('plans, prompts and standalone defaults retain native list models and max/ultra efforts', async t => {
  const f = await fixture(t)
  for (const profile of ['openai', 'codex_lb'] as const) {
    await writeNativeSubagentModels(profile, entries, f)
    await f.setProfile(profile)
    const ctx = readChildModelPlanContext(f)
    assert.ok(ctx.list)
    const applied = applyListRoleModels({ explorer: { model_reasoning_effort: 'low' } }, null, ctx.list, true)
    assert.equal(applied.agents.explorer.routed_model, DEEP)
    assert.equal(applied.agents.explorer.routed_model_reasoning_effort, 'ultra')
    assert.equal(applied.agents.explorer.routed_provider, profile === 'codex_lb' ? 'codex-lb' : 'openai')
    assert.equal(applied.evidence.profile, profile)
    const prompt = buildOfficialSubagentPrompt({ goal: 'Review the parser', slices: [{ id: 'review', title: 'Review', description: 'Read the parser', agent: 'explorer', readOnly: true }], childModels: ctx.allowlist, agentRouting: applied.agents } as any)
    assert.match(prompt, new RegExp(`${DEEP}.*ultra`))
    assert.match(prompt, /read_only_list_child/)
    assert.doesNotMatch(prompt, /OpenRouter Only Mode|OpenRouter list/)
    const policy = resolveNarutoCredentialPolicy({ env: f.env, args: [], openRouterOnly: null, childModels: ctx.allowlist, defaultParentModel: DEEP, defaultParentEffort: 'max', defaultSubagentModel: FAST, defaultSubagentEffort: 'low' })
    assert.deepEqual(policy.blockers, [])
    assert.equal(policy.childModelMode, 'configured')
    assert.equal(policy.subagentModel, DEEP)
    assert.equal(policy.subagentEffort, 'ultra')
    assert.equal(policy.parentModel, DEEP)
    assert.equal(policy.parentEffort, 'max')
    assert.equal(policy.forcedLoginMethod, 'chatgpt')
    const worker = await resolveWorkerModelRouting({ agent: applied.agents.explorer, slice: { title: 'Review' }, intake: { route: '$Naruto' }, fastModePolicy: { fast_mode: true, service_tier: 'fast' } }, { env: f.env, consultJev: false })
    assert.deepEqual(worker.blockers, [])
    assert.equal(worker.choice.model, DEEP)
    assert.equal(worker.choice.reasoning, 'ultra')
  }
})

test('Jev and the real spawn gate enforce native lists while keeping read-only roles and bounded forks', async t => {
  const f = await fixture(t)
  const keys = ['HOME', 'SKS_HOME', 'CODEX_HOME', 'OPENROUTER_API_KEY', 'SKS_JEV_DECISION_TEST_OVERRIDES'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, f.env, { OPENROUTER_API_KEY: 'sk-or-test-nativechildlistaaaa', SKS_JEV_DECISION_TEST_OVERRIDES: '1' })
  delete process.env.CODEX_HOME
  t.after(() => {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key] }
    setDecisionTestOverrides(null)
    resetDecisionTransportState()
  })
  for (const profile of ['openai', 'codex_lb'] as const) {
    await f.setProfile(profile)
    await writeNativeSubagentModels(profile, entries, f)
    resetDecisionTransportState()
    setDecisionTestOverrides({ config: defaultDecisionConfig(), fetchImpl: async () => { throw new Error('Jev is off') } })
    const payload = { tool_name: 'spawn_agent', tool_input: { agent_type: 'explorer', model: 'unlisted-model', reasoning_effort: 'low', message: 'Read the parser.', fork_turns: 'none' } }
    const routed = await jevSpawnRouting(f.home, { mode: 'NARUTO' }, payload)
    assert.equal(routed.route?.mode, 'configured')
    assert.equal(routed.route?.profile, profile)
    assert.equal(routed.input?.model, DEEP)
    assert.equal(routed.input?.reasoning_effort, 'ultra')
    assert.equal(routed.input?.agent_type, 'read_only_list_child')
    await ensureUserReadOnlyListRole(f.home)
    assert.equal(subagentSpawnPolicyBlockReason({ ...payload, tool_input: routed.input }, { root: f.home, narutoParent: false }), null)
    assert.equal(subagentSpawnPolicyBlockReason({ ...payload, tool_input: routed.input }, { narutoParent: false }), null)
    assert.match(String(subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...routed.input, agent_type: 'custom_pinned_role' } }, { root: f.home })), /may pin its own model/)
    assert.match(String(subagentSpawnPolicyBlockReason(payload)), /subagent list/)
    assert.match(String(subagentSpawnPolicyBlockReason({ ...payload, tool_input: { ...routed.input, fork_turns: 'all' } })), /full-history/)
    setDecisionTestOverrides({
      config: { ...defaultDecisionConfig(), mode: 'jev', consentCloud: true },
      fetchImpl: async () => new Response(JSON.stringify({ model: 'typesafe/jev-1.13', answers: { option_child_model_spawn: { type: 'choice', choice: 'm1', confidence: 0.99, probabilities: { m1: 0.98, m2: 0.01, keep_baseline: 0.01 } } }, usage: { input_tokens: 10, output_tokens: 2 } }), { status: 200 })
    })
    resetDecisionTransportState()
    const chosen = await jevSpawnRouting(f.home, { mode: 'NARUTO' }, payload)
    assert.equal(chosen.route?.source, 'jev')
    assert.equal(chosen.input?.model, FAST)
    assert.equal(chosen.input?.reasoning_effort, 'low')
  }
  const project = path.join(f.home, 'project')
  const agents = path.join(project, '.codex', 'agents')
  await fs.mkdir(agents, { recursive: true })
  const shadow = path.join(agents, READ_ONLY_LIST_ROLE.filename)
  await fs.writeFile(shadow, 'model = "unlisted-model"\nsandbox_mode = "workspace-write"\n')
  const readonlySpawn = { tool_name: 'spawn_agent', tool_input: { agent_type: READ_ONLY_LIST_ROLE.codex_name, model: DEEP, fork_turns: 'none' } }
  assert.match(String(subagentSpawnPolicyBlockReason(readonlySpawn, { root: project })), /could not verify the model-less read-only role/)
  assert.match(await fs.readFile(shadow, 'utf8'), /unlisted-model/)
  await fs.rm(shadow)
  await fs.writeFile(path.join(project, '.codex', 'config.toml'), '[agents.read_only_list_child]\nconfig_file = "custom-role.toml"\n')
  assert.match(String(subagentSpawnPolicyBlockReason(readonlySpawn, { root: project })), /could not verify the model-less read-only role/)
})
