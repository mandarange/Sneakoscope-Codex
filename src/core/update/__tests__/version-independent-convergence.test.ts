import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION } from '../../fsx.js';
import { runUpdateMigrationStages } from '../update-migration-state.js';

async function fixture(t: test.TestContext) {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-update-convergence-'));
  const home = path.join(temp, 'home');
  const root = path.join(temp, 'project');
  const saved = { HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME, SKS_GLOBAL_ROOT: process.env.SKS_GLOBAL_ROOT };
  process.env.HOME = home;
  process.env.CODEX_HOME = path.join(home, '.codex');
  process.env.SKS_GLOBAL_ROOT = path.join(home, '.sneakoscope-global');
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fsp.rm(temp, { recursive: true, force: true });
  });
  const write = async (file: string, text: string) => {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, text);
  };
  // Mixed generations can coexist after interrupted installs. Ownership and
  // the current manifest, not the last recorded version, decide what survives.
  const obsoleteGlobal = path.join(home, '.agents', 'skills', 'sks-obsolete-generation', 'SKILL.md');
  const obsoleteProject = path.join(root, '.codex', 'skills', 'team', 'SKILL.md');
  const obsoleteNested = path.join(root, 'packages', 'web', '.agents', 'skills', 'sks-answer', 'SKILL.md');
  const cache = path.join(root, '.sneakoscope', 'codex-0138-capability.json');
  const managedSkill = (name: string) => `---\nname: ${name}\n---\n<!-- BEGIN SKS MANAGED SKILL v4.8.4 name=${name} -->\n`;
  await write(obsoleteGlobal, managedSkill('sks-obsolete-generation'));
  await write(obsoleteProject, managedSkill('team'));
  await write(obsoleteNested, managedSkill('sks-answer'));
  await write(cache, '{}\n');
  const config = path.join(root, '.codex', 'config.toml');
  await write(config, '# SKS-MANAGED-CODEX-CONFIG\nmodel = "customer/model"\n[mcp_servers.supabase_mad_db]\ncommand = "retired-sks-db-bridge"\n[mcp_servers.customer]\ncommand = "customer-server"\n[mcp_servers.customer.env]\nCUSTOMER_KEY = "fixture-secret"\n');
  const userSkill = path.join(root, '.agents', 'skills', 'customer-helper', 'SKILL.md');
  const userState = path.join(root, '.sneakoscope', 'customer-state.json');
  await write(userSkill, '---\nname: customer-helper\n---\nUser content\n');
  await write(userState, '{"keep":true}\n');
  return { home, root, cache, config, userSkill, userState, obsolete: [obsoleteGlobal, obsoleteProject, obsoleteNested, cache] };
}

// These are semantic boundaries, not a list of supported releases. Every
// value is diagnostic: prerelease, old, absent, damaged, and already current.
for (const fromVersion of ['0.0.0-alpha.1', '1.10.0', null, 'damaged-version', PACKAGE_VERSION]) {
  test(`update converges mixed legacy state with source version ${fromVersion ?? 'missing'}`, async (t) => {
    const f = await fixture(t);
    const only = new Set(['skills-reconcile']);
    const [first] = await runUpdateMigrationStages(f.root, { fromVersion, only });
    assert.equal(first?.status, 'ok', JSON.stringify(first));
    for (const file of f.obsolete) await assert.rejects(fsp.access(file), { code: 'ENOENT' });
    await fsp.access(path.join(f.home, '.agents', 'skills', 'sks-answer', 'SKILL.md'));
    const config = await fsp.readFile(f.config, 'utf8');
    assert.doesNotMatch(config, /supabase_mad_db/);
    assert.match(config, /model = "customer\/model"/);
    assert.match(config, /CUSTOMER_KEY = "fixture-secret"/);
    assert.equal(await fsp.readFile(f.userSkill, 'utf8'), '---\nname: customer-helper\n---\nUser content\n');
    assert.equal(await fsp.readFile(f.userState, 'utf8'), '{"keep":true}\n');
    const [second] = await runUpdateMigrationStages(f.root, { fromVersion: PACKAGE_VERSION, only });
    assert.equal(second?.status, 'ok', JSON.stringify(second));
    assert.equal(second?.detail?.global_removed_count, 0);
    assert.equal(second?.detail?.project_removed_count, 0);
    assert.equal(second?.detail?.residue_remaining_count, 0);
  });
}

test('a failed legacy cache removal blocks convergence and a later retry repairs it', async (t) => {
  const f = await fixture(t);
  const unlink = fsp.unlink.bind(fsp);
  const failure = t.mock.method(fsp, 'unlink', async (file: Parameters<typeof fsp.unlink>[0]) => {
    if (String(file) === f.cache) throw Object.assign(new Error('fixture deletion denied'), { code: 'EACCES' });
    return unlink(file);
  });
  const only = new Set(['skills-reconcile']);
  const [failed] = await runUpdateMigrationStages(f.root, { fromVersion: '7.6.0', only });
  assert.equal(failed?.ok, false, JSON.stringify(failed));
  assert.equal(failed?.status, 'failed');
  assert.ok(failed?.blockers.includes('legacy_runtime_data_reconcile_failed:1'));
  assert.equal(failed?.detail?.residue_remaining_count, 1);
  await fsp.access(f.cache);
  failure.mock.restore();
  const [repaired] = await runUpdateMigrationStages(f.root, { fromVersion: PACKAGE_VERSION, only });
  assert.equal(repaired?.ok, true, JSON.stringify(repaired));
  await assert.rejects(fsp.access(f.cache), { code: 'ENOENT' });
});

test('orphan cleanup preserves unmarked skills and quarantines user additions to managed skills', async (t) => {
  const f = await fixture(t);
  const orphanDir = path.dirname(f.obsolete[0]!);
  await fsp.writeFile(path.join(orphanDir, 'notes.txt'), 'user additions');
  const personal = path.join(f.home, '.agents', 'skills', 'sks-personal-helper');
  await fsp.mkdir(personal, { recursive: true });
  await fsp.writeFile(path.join(personal, 'SKILL.md'), '---\nname: sks-personal-helper\n---\nuser skill');
  const linked = path.join(f.home, '.agents', 'skills', 'sks-personal-link');
  await fsp.symlink(personal, linked);
  const [result] = await runUpdateMigrationStages(f.root, { only: new Set(['skills-reconcile']) });
  assert.equal(result?.ok, true, JSON.stringify(result));
  await assert.rejects(fsp.access(orphanDir), { code: 'ENOENT' });
  const quarantine = path.join(f.home, '.sneakoscope', 'quarantine', 'skills', 'sks-obsolete-generation');
  const entries = await fsp.readdir(quarantine);
  assert.equal(entries.length, 1);
  assert.equal(await fsp.readFile(path.join(quarantine, entries[0]!, 'sks-obsolete-generation', 'notes.txt'), 'utf8'), 'user additions');
  assert.equal(await fsp.readFile(path.join(personal, 'SKILL.md'), 'utf8'), '---\nname: sks-personal-helper\n---\nuser skill');
  assert.equal(await fsp.readlink(linked), personal);
});
