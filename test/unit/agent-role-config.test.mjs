import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';

test('managed Codex 0.144.1 agent roles contain only supported rendered policy keys', async () => {
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');

  assert.equal(manifest.MANAGED_ASSET_VERSION, '6.1.2');
  for (const role of manifest.MANAGED_AGENT_ROLES) {
    const text = manifest.managedAgentRoleContent(role);
    const parsed = parse(text);
    assert.equal(parsed.name, role.codex_name);
    assert.equal(parsed.sandbox_mode, role.sandbox);
    assert.equal(Object.hasOwn(parsed, 'permission_profile'), false);
    assert.equal(Object.hasOwn(parsed, 'legacy_sandbox_projection'), false);
  }

  for (const role of manifest.MANAGED_OFFICIAL_SUBAGENT_ROLES) {
    const text = manifest.managedOfficialSubagentRoleContent(role);
    const parsed = parse(text);
    assert.equal(parsed.name, role.codex_name);
    assert.equal(parsed.model, role.model);
    assert.equal(parsed.model_reasoning_effort, 'max');
    assert.equal(Object.hasOwn(parsed, 'sandbox_mode'), role.sandbox === 'read-only');
    assert.equal(parsed.sandbox_mode, role.sandbox);
    assert.equal(manifest.managedOfficialSubagentRoleOwnsText(text, role), true);
  }
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

test('agent role repair preserves legacy role TOMLs without creating or overwriting them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-role-exact-repair-'));
  const codexHome = path.join(root, 'codex-home');
  const roleFile = path.join(root, '.codex', 'agents', 'analysis-scout.toml');
  await fs.mkdir(path.dirname(roleFile), { recursive: true });
  await fs.writeFile(roleFile, [
    '# SKS-MANAGED-ASSET',
    '# sks_managed_schema = 1',
    '# sks_managed_id = "sks-explorer"',
    '# sks_managed_version = "4.8.1"',
    'name = "analysis_scout"',
    'description = "stale managed content"',
    'sandbox_mode = "workspace-write"',
    'permission_profile = "sks-workspace-write"',
    'legacy_sandbox_projection = "workspace-write"',
    'developer_instructions = """',
    'stale',
    '"""',
    ''
  ].join('\n'), 'utf8');

  const roles = await import('../../dist/core/agents/agent-role-config.js');
  const plan = await roles.repairAgentRoleConfigs({ root, codexHome, apply: false });
  assert.equal(plan.stale.includes('analysis-scout.toml'), false);
  assert.ok(plan.existing.includes('.codex/agents/analysis-scout.toml'));

  const repair = await roles.repairAgentRoleConfigs({ root, codexHome, apply: true });
  assert.equal(repair.repaired.includes('.codex/agents/analysis-scout.toml'), false);
  const preserved = await fs.readFile(roleFile, 'utf8');
  assert.match(preserved, /permission_profile = "sks-workspace-write"/);
  assert.match(preserved, /legacy_sandbox_projection = "workspace-write"/);
});
