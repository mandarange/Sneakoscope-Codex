import { ISOLATED_TEST_CODEX_HOME } from '../../__tests__/helpers/isolated-test-home.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resetLatestModelTierCache } from '../model-tiers.js'
import {
  narutoCredentialConfigArgs,
  narutoCredentialPolicyReceipt,
  resolveNarutoCredentialPolicy
} from '../naruto-host-credentials.js'
import { buildOfficialSubagentChildEnv, buildOfficialSubagentCodexArgs } from '../official-subagent-runner.js'

// A fixed Codex models cache: the gpt-6 family is current; efforts per model
// are what Codex lists, which is all SKS validates against.
const levels = (...efforts: string[]) => efforts.map((effort) => ({ effort }))
fs.writeFileSync(path.join(ISOLATED_TEST_CODEX_HOME, 'models_cache.json'), JSON.stringify({ models: [
  { slug: 'gpt-6-astra', supported_reasoning_levels: levels('low', 'medium', 'high', 'xhigh', 'max', 'ultra') },
  { slug: 'gpt-6-sol', supported_reasoning_levels: levels('low', 'medium', 'high', 'xhigh', 'max', 'ultra') },
  { slug: 'gpt-6-luna', supported_reasoning_levels: levels('low', 'medium', 'max') },
  { slug: 'gpt-5.6-terra', supported_reasoning_levels: levels('low', 'medium') }
] }))
resetLatestModelTierCache()

const DEFAULTS = {
  defaultParentModel: 'gpt-6-astra',
  defaultParentEffort: 'max',
  defaultSubagentModel: 'gpt-6-astra',
  defaultSubagentEffort: 'low'
}

function policy(args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  return resolveNarutoCredentialPolicy({ args, env, ...DEFAULTS })
}

test('the default stays SKS-managed ChatGPT authentication', () => {
  const resolved = policy()
  assert.equal(resolved.authMode, 'managed')
  assert.equal(resolved.modelProvider, 'openai')
  assert.equal(resolved.forcedLoginMethod, 'chatgpt')
  assert.equal(resolved.providerEnvKey, null)
  assert.deepEqual(resolved.blockers, [])
  assert.deepEqual(narutoCredentialConfigArgs(resolved), [
    '-c', 'model_provider="openai"',
    '-c', 'forced_login_method="chatgpt"'
  ])
})

test('host auth mode injects neither the provider nor the login method', () => {
  const resolved = policy(['--auth-mode=host'])
  assert.equal(resolved.authMode, 'host')
  assert.equal(resolved.forcedLoginMethod, null)
  assert.equal(resolved.modelProvider, null)
  assert.deepEqual(narutoCredentialConfigArgs(resolved), [])
  assert.ok(resolved.warnings.includes('naruto_host_auth_mode_without_explicit_model_provider'))
})

test('host auth mode names an unmanaged provider block the host configured', () => {
  const resolved = policy(['--auth-mode', 'host', '--model-provider', 'customer-gateway'])
  assert.equal(resolved.modelProvider, 'customer-gateway')
  assert.deepEqual(narutoCredentialConfigArgs(resolved), ['-c', 'model_provider="customer-gateway"'])
  assert.equal(resolved.forcedLoginMethod, null)
  assert.deepEqual(resolved.blockers, [])
})

test('retired managed provider IDs are blocked and never emitted', () => {
  for (const provider of ['codex-lb', 'openrouter']) {
    const resolved = policy(['--auth-mode=host', `--model-provider=${provider}`])
    assert.equal(resolved.modelProvider, null, provider)
    assert.ok(resolved.blockers.includes('desktop_bridge_direct_provider_selection_retired'), provider)
    assert.equal(narutoCredentialConfigArgs(resolved).some((arg) => arg.includes(provider)), false, provider)
  }
})

test('the env contract rejects retired managed provider IDs', () => {
  const resolved = policy([], {
    SKS_NARUTO_AUTH_MODE: 'host',
    SKS_NARUTO_MODEL_PROVIDER: 'openrouter',
    CUSTOMER_API_KEY: 'not-read-by-sks',
    SKS_NARUTO_PROVIDER_ENV_KEY: 'CUSTOMER_API_KEY'
  })
  assert.equal(resolved.authMode, 'host')
  assert.equal(resolved.modelProvider, null)
  assert.equal(resolved.providerEnvKey, 'CUSTOMER_API_KEY')
  assert.equal(resolved.sources.authMode, 'env')
  assert.ok(resolved.blockers.includes('desktop_bridge_direct_provider_selection_retired'))
})

test('--no-forced-login-method releases the login without switching provider', () => {
  const resolved = policy(['--no-forced-login-method'])
  assert.equal(resolved.authMode, 'managed')
  assert.equal(resolved.modelProvider, 'openai')
  assert.equal(resolved.forcedLoginMethod, null)
  assert.ok(resolved.warnings.includes('naruto_forced_login_method_released_without_host_auth_mode'))
  assert.deepEqual(narutoCredentialConfigArgs(resolved), ['-c', 'model_provider="openai"'])
})

test('child model and effort overrides reach the codex arguments independently of the parent', () => {
  const resolved = policy([
    '--parent-model', 'gpt-5.6-terra', '--parent-effort', 'medium',
    '--subagent-model', 'gpt-6-astra', '--subagent-effort', 'low'
  ])
  assert.equal(resolved.parentModel, 'gpt-5.6-terra')
  assert.deepEqual(resolved.blockers, [])
  const args = buildOfficialSubagentCodexArgs({
    prompt: 'task', maxThreads: 2, parentSummaryFile: '/tmp/summary.txt', credentialPolicy: resolved
  })
  assert.ok(args.includes('gpt-5.6-terra'))
  assert.ok(args.includes('agents.default_subagent_model="gpt-6-astra"'))
  assert.ok(args.includes('agents.default_subagent_reasoning_effort="low"'))
})

test('child model flags accept any current tier model and move older or foreign models to the latest deep tier', () => {
  for (const model of ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra']) {
    const resolved = policy(['--subagent-model', model, '--subagent-effort', 'low'])
    assert.deepEqual(resolved.blockers, [], model)
    assert.equal(resolved.subagentModel, model)
  }
  for (const model of ['gpt-5.6-luna', 'gpt-5.6-sol', 'anthropic/claude-sonnet-4.5']) {
    for (const resolved of [policy(['--subagent-model', model]), policy([], { SKS_NARUTO_SUBAGENT_MODEL: model })]) {
      assert.ok(resolved.blockers.some((blocker) => blocker === 'naruto_subagent_model_must_be_current' || blocker.startsWith('naruto_subagentModel_invalid:')), model)
      assert.equal(resolved.subagentModel, 'gpt-6-astra')
    }
  }
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']) {
    assert.deepEqual(policy(['--subagent-model', 'gpt-6-astra', '--subagent-effort', effort]).blockers, [], effort)
  }
})

test('explicit efforts must be ones Codex lists for that model; nothing else is pinned', () => {
  assert.ok(policy(['--subagent-model', 'gpt-6-luna', '--subagent-effort', 'high']).blockers
    .includes('naruto_subagent_effort_unsupported:gpt-6-luna:high:allowed_low_or_medium_or_max'))
  assert.ok(policy(['--parent-model', 'gpt-5.6-terra', '--parent-effort', 'max']).blockers
    .includes('naruto_parent_effort_unsupported:gpt-5.6-terra:max:allowed_low_or_medium'))
  assert.deepEqual(policy(['--parent-model', 'gpt-5.6-terra', '--parent-effort', 'medium']).blockers, [])
  // A model the catalog does not list is not second-guessed.
  assert.deepEqual(policy(['--parent-model', 'future-model', '--parent-effort', 'high']).blockers, [])
})

test('a host-mode run carries no chatgpt login into the codex arguments', () => {
  const resolved = policy(['--auth-mode=host', '--model-provider=customer-gateway'])
  const args = buildOfficialSubagentCodexArgs({
    prompt: 'task',
    maxThreads: 2,
    parentSummaryFile: '/tmp/summary.txt',
    credentialPolicy: resolved
  })
  assert.ok(!args.some((arg) => arg.includes('forced_login_method')))
  assert.ok(args.includes('model_provider="customer-gateway"'))
})

test('the named provider key reaches the child, and nothing else does', () => {
  const resolved = policy(['--auth-mode=host', '--provider-env-key=CUSTOMER_API_KEY'], {
    CUSTOMER_API_KEY: 'value-under-test'
  })
  const childEnv = buildOfficialSubagentChildEnv({
    env: { CUSTOMER_API_KEY: 'value-under-test', OPENAI_API_KEY: 'unrelated', HOME: '/tmp/home' },
    credentialPolicy: resolved
  })
  assert.equal(childEnv.CUSTOMER_API_KEY, 'value-under-test')
  assert.equal(childEnv.OPENAI_API_KEY, undefined)
})

test('a malformed identifier blocks instead of falling back to the managed credential', () => {
  assert.ok(policy(['--auth-mode=nope']).blockers.some((b) => b.startsWith('naruto_auth_mode_invalid')))
  assert.ok(policy(['--auth-mode=host', '--model-provider=has space']).blockers.some((b) => b.startsWith('naruto_model_provider_invalid')))
  assert.ok(policy(['--auth-mode=host', '--parent-effort=turbo']).blockers.some((b) => b.startsWith('naruto_parentEffort_invalid')))
  assert.ok(policy(['--auth-mode=host', '--provider-env-key=lower_case']).blockers.some((b) => b.startsWith('naruto_provider_env_key_invalid')))
})

test('naming a provider without host auth mode is a blocker, not a silent mixed configuration', () => {
  const resolved = policy(['--model-provider=codex-lb'])
  assert.ok(resolved.blockers.includes('naruto_model_provider_requires_host_auth_mode'))
  assert.equal(resolved.modelProvider, 'openai')
})

test('a provider env key that is absent from the environment blocks before Codex sees it', () => {
  const resolved = policy(['--auth-mode=host', '--provider-env-key=MISSING_KEY'], {})
  assert.ok(resolved.blockers.includes('naruto_provider_env_key_absent:MISSING_KEY'))
})

test('the receipt records the decision and never the credential', () => {
  const resolved = policy(['--auth-mode=host', '--model-provider=customer-gateway', '--provider-env-key=CUSTOMER_API_KEY'], {
    CUSTOMER_API_KEY: 'super-secret-value'
  })
  const receipt = narutoCredentialPolicyReceipt(resolved)
  const serialized = JSON.stringify(receipt)
  assert.ok(!serialized.includes('super-secret-value'))
  assert.ok(serialized.includes('CUSTOMER_API_KEY'))
  assert.equal(receipt.credential_handled_by, 'host_config_toml_provider_block')
  assert.equal(receipt.auth_mode, 'host')
})
