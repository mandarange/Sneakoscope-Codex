import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';

test('managed Codex 0.144.1 agent roles contain only supported rendered policy keys', async () => {
  const manifest = await import('../../dist/core/managed-assets/managed-assets-manifest.js');

  assert.equal(manifest.MANAGED_ASSET_VERSION, '6.1.0');
  for (const role of manifest.MANAGED_AGENT_ROLES) {
    const text = manifest.managedAgentRoleContent(role);
    const parsed = parse(text);
    assert.equal(parsed.name, role.codex_name);
    assert.equal(parsed.sandbox_mode, role.sandbox);
    assert.equal(Object.hasOwn(parsed, 'permission_profile'), false);
    assert.equal(Object.hasOwn(parsed, 'legacy_sandbox_projection'), false);
  }
});

test('agent role repair replaces stale managed content with the exact 6.1.0 manifest', async () => {
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
  assert.ok(plan.stale.includes('analysis-scout.toml'));

  const repair = await roles.repairAgentRoleConfigs({ root, codexHome, apply: true });
  assert.ok(repair.repaired.includes('.codex/agents/analysis-scout.toml'));
  const repaired = await fs.readFile(roleFile, 'utf8');
  assert.equal(repaired, roles.managedAgentRoleConfigForFile('analysis-scout.toml'));
  assert.equal(Object.hasOwn(parse(repaired), 'permission_profile'), false);
  assert.equal(Object.hasOwn(parse(repaired), 'legacy_sandbox_projection'), false);
});
