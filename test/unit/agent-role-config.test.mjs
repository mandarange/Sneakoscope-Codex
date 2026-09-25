import '../../dist/core/__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_LATEST_TIER_MODELS as T } from '../../dist/core/subagents/model-tiers.js';

// Isolated HOME: no Codex models cache, so tiers resolve to the built-in latest family.
const CURRENT = new Set([T.fast, T.balanced, T.context, T.deep]);
const POLICY_MODEL = {
  luna_max_mechanical: T.fast,
  sol_high_implementation: T.balanced,
  terra_max_context_tools: T.context,
  sol_max_judgment: T.deep
};
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';

test('installed Codex agent catalog exposes only current official roles', async () => {
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');

  // Asserting the tracking relationship, not a pinned literal: a release bump must not
  // require editing this file.
  const packageVersion = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  assert.equal(manifest.MANAGED_ASSET_VERSION, packageVersion);
  assert.equal(Object.hasOwn(manifest, 'MANAGED_AGENT_ROLES'), false);

  for (const role of manifest.MANAGED_OFFICIAL_SUBAGENT_ROLES) {
    const text = manifest.managedOfficialSubagentRoleContent(role);
    const parsed = parse(text);
    assert.equal(parsed.name, role.codex_name);
    assert.equal(parsed.model, role.model);
    assert.equal(parsed.model, POLICY_MODEL[role.model_policy], role.codex_name);
    assert.equal(parsed.model_reasoning_effort, role.model_reasoning_effort);
    if (['implementation_specialist', 'ui_implementer', 'native_app_specialist'].includes(role.codex_name)) {
      assert.equal(parsed.model_reasoning_effort, 'low', role.codex_name);
    }
    assert.equal(Object.hasOwn(parsed, 'model_policy'), false);
    assert.equal(Object.hasOwn(parsed, 'sandbox_mode'), role.sandbox === 'read-only');
    assert.equal(parsed.sandbox_mode, role.sandbox);
    assert.equal(manifest.managedOfficialSubagentRoleOwnsText(text, role), true);
  }
});

test('official custom agent catalog has unique identities and broad specialist coverage without model-policy drift', async () => {
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');
  const roles = manifest.MANAGED_OFFICIAL_SUBAGENT_ROLES;
  const expectedSpecialists = new Map([
    ['implementation_specialist', { policy: 'sol_high_implementation', model: POLICY_MODEL.sol_high_implementation, effort: 'low', sandbox: undefined }],
    ['ui_implementer', { policy: 'sol_high_implementation', model: POLICY_MODEL.sol_high_implementation, effort: 'low', sandbox: undefined }],
    ['native_app_specialist', { policy: 'sol_high_implementation', model: POLICY_MODEL.sol_high_implementation, effort: 'low', sandbox: undefined }],
    ['toolchain_specialist', { policy: 'sol_max_judgment', model: POLICY_MODEL.sol_max_judgment, effort: 'max', sandbox: undefined }],
    ['protocol_reviewer', { policy: 'sol_max_judgment', model: POLICY_MODEL.sol_max_judgment, effort: 'max', sandbox: 'read-only' }],
    ['runtime_reliability_reviewer', { policy: 'sol_max_judgment', model: POLICY_MODEL.sol_max_judgment, effort: 'max', sandbox: 'read-only' }],
    ['triwiki_evidence_reviewer', { policy: 'sol_max_judgment', model: POLICY_MODEL.sol_max_judgment, effort: 'max', sandbox: 'read-only' }],
    ['long_context_analyst', { policy: 'terra_max_context_tools', model: POLICY_MODEL.terra_max_context_tools, effort: 'medium', sandbox: 'read-only' }],
    ['computer_use_operator', { policy: 'terra_max_context_tools', model: POLICY_MODEL.terra_max_context_tools, effort: 'medium', sandbox: 'read-only' }],
    ['browser_use_operator', { policy: 'terra_max_context_tools', model: POLICY_MODEL.terra_max_context_tools, effort: 'medium', sandbox: 'read-only' }],
    ['image_generation_operator', { policy: 'terra_max_context_tools', model: POLICY_MODEL.terra_max_context_tools, effort: 'medium', sandbox: undefined }]
  ]);

  assert.equal(roles.length, 25);
  assert.equal(new Set(roles.map((role) => role.id)).size, roles.length);
  assert.equal(new Set(roles.map((role) => role.filename)).size, roles.length);
  assert.equal(new Set(roles.map((role) => role.codex_name)).size, roles.length);
  assert.equal(new Set(roles.map((role) => role.description)).size, roles.length);

  for (const [name, expected] of expectedSpecialists) {
    const role = roles.find((candidate) => candidate.codex_name === name);
    assert.ok(role, `missing ${name}`);
    assert.equal(role.model_policy, expected.policy);
    assert.equal(role.model, expected.model);
    assert.equal(role.sandbox, expected.sandbox);
    assert.equal(role.model_reasoning_effort, expected.effort);
    assert.ok(role.selection_keywords.length >= 5);
  }

  const distribution = Object.fromEntries(['luna_max_mechanical', 'sol_high_implementation', 'sol_max_judgment', 'terra_max_context_tools']
    .map((policy) => [policy, roles.filter((role) => role.model_policy === policy).length]));
  assert.deepEqual(distribution, {
    luna_max_mechanical: 1,
    sol_high_implementation: 3,
    sol_max_judgment: 15,
    terra_max_context_tools: 6
  });
});

test('fresh agent role repair requires the complete official custom agent catalog', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-official-default-'));
  const codexHome = path.join(root, 'codex-home');
  const roles = await import('../../dist/core/agents/agent-role-config.js');
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');
  const expected = manifest.MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename).sort();

  const plan = await roles.repairAgentRoleConfigs({ root, codexHome, apply: false });
  assert.deepEqual(plan.missing.sort(), expected);
  assert.equal(plan.missing.includes('analysis-scout.toml'), false);

  const repair = await roles.repairAgentRoleConfigs({ root, codexHome, apply: true });
  assert.equal(repair.ok, true);
  const files = (await fs.readdir(path.join(root, '.codex', 'agents'))).sort();
  assert.deepEqual(files, expected);
});

test('agent role repair removes SKS-owned retired roles and quarantines user collisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-exact-repair-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');
  const managedRole = manifest.RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[0];
  const userRole = manifest.RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[1];
  const managedFile = path.join(root, '.codex', 'agents', managedRole.filename);
  const userFile = path.join(codexHome, 'agents', userRole.filename);
  await fs.mkdir(path.dirname(managedFile), { recursive: true });
  await fs.mkdir(path.dirname(userFile), { recursive: true });
  await fs.writeFile(managedFile, manifest.managedAgentRoleContent(managedRole), 'utf8');
  await fs.writeFile(userFile, 'name = "customer_role"\ndescription = "keep me"\n', 'utf8');

  const roles = await import('../../dist/core/agents/agent-role-config.js');
  const plan = await roles.repairAgentRoleConfigs({ root, codexHome, apply: false });
  assert.equal(plan.retired_role_cleanup.detected_count, 2);
  assert.equal(plan.retired_role_cleanup.remaining_count, 2);

  const repair = await roles.repairAgentRoleConfigs({ root, codexHome, apply: true });
  assert.equal(repair.ok, true);
  assert.equal(repair.retired_role_cleanup.removed_count, 1);
  assert.equal(repair.retired_role_cleanup.quarantined_user_collision_count, 1);
  assert.equal(repair.retired_role_cleanup.remaining_count, 0);
  await assert.rejects(fs.access(managedFile));
  await assert.rejects(fs.access(userFile));
  const quarantined = await findFile(home, userRole.filename);
  assert.ok(quarantined?.includes(path.join('.sneakoscope', 'quarantine', 'retired-agent-roles')));
  assert.match(await fs.readFile(quarantined, 'utf8'), /keep me/);
  assert.equal(Object.hasOwn(repair, 'legacy_compatibility_role_ids'), false);
});

async function findFile(root, name) {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const row of rows) {
    const file = path.join(root, row.name);
    if (row.isDirectory()) {
      const nested = await findFile(file, name);
      if (nested) return nested;
    } else if (row.name === name) return file;
  }
  return null;
}

test('persisted older-family role models resolve to their tier models without mutating the stored preferences', async () => {
  const preferences = await import('../../dist/core/subagents/role-model-preferences.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-astra-preferences-'));
  const filePath = path.join(root, 'role-models.json');
  const original = JSON.stringify({
    schema: 'sks.role-model-preferences.v2', version: 2, updated_at: '2026-09-08',
    roles: {
      worker: { provider: 'openai', model: 'gpt-5.6-luna', reasoning_effort: 'max' },
      implementation_specialist: { provider: 'openai', model: 'gpt-5.6-sol', reasoning_effort: 'high' },
      explorer: { provider: 'openai', model: 'gpt-5.6-terra', reasoning_effort: 'max' },
      expert: { provider: 'anthropic', model: 'anthropic/claude-sonnet-4.5', reasoning_effort: 'high' },
      debugger: { provider: 'openai', model: 'gpt-6-astra', reasoning_effort: 'high' }
    }
  });
  await fs.writeFile(filePath, original);
  const read = await preferences.readRoleModelPreferences({ filePath });
  assert.deepEqual(read.blockers, []);
  assert.deepEqual(Object.fromEntries(Object.entries(read.store.roles).map(([name, role]) => [name, role.model])), {
    worker: T.fast, implementation_specialist: T.balanced, explorer: T.context, expert: T.deep, debugger: T.deep
  });
  assert.ok(Object.values(read.store.roles).every((role) => role.provider === 'openai'));
  assert.deepEqual(Object.fromEntries(Object.entries(read.store.roles).map(([name, role]) => [name, role.reasoning_effort])), {
    worker: 'low', implementation_specialist: 'low', explorer: 'medium', expert: 'max', debugger: 'high'
  });
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
});

test('role choices offer the current tier models and preserve the parent selection', async () => {
  const preferences = await import('../../dist/core/subagents/role-model-preferences.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-astra-status-'));
  const configPath = path.join(root, 'config.toml');
  const filePath = path.join(root, 'role-models.json');
  const parentConfig = 'model = "gpt-5.6-sol"\nmodel_provider = "openai"\nmodel_reasoning_effort = "max"\n';
  await fs.writeFile(configPath, parentConfig);
  const status = await preferences.roleModelPreferencesStatus({ filePath, configPath });
  assert.equal(status.routing.selected_model, 'gpt-5.6-sol');
  assert.equal(status.routing.active_main_model_inherited, false);
  assert.ok(status.roles.every((role) => CURRENT.has(role.effective_model)));
  assert.ok(status.supported_profiles.every((profile) => CURRENT.has(profile.model)));
  for (const model of CURRENT) {
    assert.deepEqual(status.supported_profiles.filter((profile) => profile.model === model).map((profile) => profile.reasoning_effort).sort(), ['high', 'low', 'max', 'medium']);
  }
  const rejected = await preferences.setRoleModelPreference({ filePath, configPath, role: 'worker', model: 'gpt-5.6-luna', reasoning: 'max' });
  assert.deepEqual(rejected.blockers, ['role_model_current_model_required']);
  await assert.rejects(fs.access(filePath));
  const saved = await preferences.setRoleModelPreference({ filePath, configPath, role: 'worker', model: T.fast, reasoning: 'low' });
  assert.equal(saved.ok, true);
  assert.equal((await preferences.readRoleModelPreferences({ filePath })).store.roles.worker.reasoning_effort, 'low');
  assert.equal(await fs.readFile(configPath, 'utf8'), parentConfig);
});

test('official child defaults override stale local and inherited models while leaving parent and effort intact', async () => {
  const config = await import('../../dist/core/subagents/official-subagent-config.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-astra-default-'));
  const projectConfigPath = path.join(root, 'config.toml');
  const parent = 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "max"\n';
  const original = parent + '[agents]\ndefault_subagent_model = "gpt-5.6-luna"\ndefault_subagent_reasoning_effort = "medium"\n';
  const merged = parse(config.mergeOfficialSubagentConfig(original));
  assert.equal(merged.model, 'gpt-5.6-sol');
  assert.equal(merged.model_reasoning_effort, 'max');
  assert.equal(merged.agents.default_subagent_model, T.deep);
  assert.equal(merged.agents.default_subagent_reasoning_effort, 'medium');
  assert.equal(parse(config.mergeOfficialSubagentConfig(parent, { inheritedText: '[agents]\ndefault_subagent_model = "gpt-5.6-terra"\n' })).agents.default_subagent_model, T.deep);
  await fs.writeFile(projectConfigPath, original);
  const read = await config.readOfficialSubagentConfig(root, { projectConfigPath, codexHome: path.join(root, 'codex-home') });
  assert.equal(read.defaultSubagentModel, T.deep);
  assert.equal(read.defaultSubagentReasoningEffort, 'medium');
  assert.ok(read.warnings.some((warning) => warning.startsWith('official_subagent_model_coerced_to_latest:')));
  assert.equal(await fs.readFile(projectConfigPath, 'utf8'), original);
});

test('managed installed worker and implementation roles refresh to their tier models at low', async (t) => {
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');
  const config = await import('../../dist/core/subagents/official-subagent-config.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-astra-refresh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const roles = manifest.MANAGED_OFFICIAL_SUBAGENT_ROLES.filter((role) =>
    ['worker', 'implementation_specialist', 'ui_implementer', 'native_app_specialist'].includes(role.codex_name));
  await fs.mkdir(path.join(root, '.codex', 'agents'), { recursive: true });
  for (const role of roles) {
    const old = manifest.managedOfficialSubagentRoleContent({
      ...role,
      model: role.codex_name === 'worker' ? 'gpt-5.6-luna' : 'gpt-5.6-sol',
      model_reasoning_effort: role.codex_name === 'worker' ? 'max' : 'high'
    });
    await fs.writeFile(path.join(root, '.codex', 'agents', role.filename), old);
  }
  const result = await config.installOfficialSubagentAgentConfigs(root, { apply: true });
  assert.equal(result.ok, true);
  for (const role of roles) {
    assert.ok(result.updated.includes(`.codex/agents/${role.filename}`), role.codex_name);
    const current = parse(await fs.readFile(path.join(root, '.codex', 'agents', role.filename), 'utf8'));
    assert.equal(current.model, POLICY_MODEL[role.model_policy], role.codex_name);
    assert.equal(current.model_reasoning_effort, 'low', role.codex_name);
  }
});
