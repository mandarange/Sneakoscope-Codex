import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMAND_CATALOG, routePrompt } from '../../dist/core/routes.js';
import { COMMANDS, LEGACY_COMMAND_ALIASES, commandNames } from '../../dist/cli/command-registry.js';
import { normalizeCommand } from '../../dist/cli/router.js';
import { runDoctorCommandAliasCleanup } from '../../dist/core/doctor/command-alias-cleanup.js';
import { REMOVED_PUBLIC_COMMANDS } from '../../dist/core/doctor/retired-managed-residue-private.js';

test('legacy command aliases are dispatch aliases, not duplicate command rows', () => {
  const names = commandNames();
  const catalogNames = COMMAND_CATALOG.map((entry) => entry.name);
  for (const [alias, canonical] of Object.entries(LEGACY_COMMAND_ALIASES)) {
    assert.equal(Object.prototype.hasOwnProperty.call(COMMANDS, alias), false, alias);
    assert.equal(names.includes(alias), false, alias);
    assert.equal(catalogNames.includes(alias), false, alias);
    assert.equal(names.includes(canonical), true, `${alias}->${canonical}`);
    const normalized = normalizeCommand([alias, 'status', '--json']);
    assert.equal(normalized.command, canonical, alias);
    assert.equal(normalized.rawCommand, alias, alias);
    assert.equal(normalized.aliasTarget, canonical, alias);
    assert.deepEqual(normalized.args, ['status', '--json']);
  }
});

test('removed public commands and dollar aliases are unknown instead of redirecting', () => {
  const names = commandNames();
  const catalogNames = COMMAND_CATALOG.map((entry) => entry.name);
  for (const name of REMOVED_PUBLIC_COMMANDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(COMMANDS, name), false, name);
    assert.equal(Object.prototype.hasOwnProperty.call(LEGACY_COMMAND_ALIASES, name), false, name);
    assert.equal(names.includes(name), false, name);
    assert.equal(catalogNames.includes(name), false, name);
    const normalized = normalizeCommand([name, '--json']);
    assert.equal(normalized.command, null, name);
    assert.equal(normalized.aliasTarget, null, name);
  }
  for (const command of ['$Agent', '$Team', '$MAD-DB', '$Tmux', '$XAI', '$Swarm', '$ShadowClone', '$Kagebunshin', '$Ralph']) {
    assert.equal(routePrompt(command), null, command);
  }

  assert.equal(routePrompt('$Naruto')?.id, 'Naruto');
  assert.equal(routePrompt('$Work')?.id, 'Naruto');
  assert.equal(routePrompt('$Work')?.command, '$Naruto');
});

test('flag aliases normalize to canonical command handlers', () => {
  assert.equal(normalizeCommand(['--mad', '--high']).command, 'mad-sks');
  assert.equal(normalizeCommand(['--MAD']).command, 'mad-sks');
  assert.equal(normalizeCommand(['--help']).command, 'help');
  assert.equal(normalizeCommand(['--naruto']).command, null);
});

test('doctor command alias cleanup writes a clean report during fix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-command-alias-cleanup-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const globalRuntimeRoot = path.join(root, 'global-runtime');
  try {
    await writeManagedSkill(path.join(home, '.agents', 'skills', 'team'), 'team');
    await writeManagedSkill(path.join(project, '.agents', 'skills', 'mad-db'), 'mad-db');
    await writeManagedSkill(path.join(project, '.codex', 'skills', 'swarm'), 'swarm');
    await fs.mkdir(path.join(project, '.agents', 'skills', 'customer-skill'), { recursive: true });
    await fs.writeFile(path.join(project, '.agents', 'skills', 'customer-skill', 'SKILL.md'), '---\nname: customer-skill\n---\n\nkeep me\n', 'utf8');
    await fs.mkdir(path.join(home, '.sneakoscope', 'team'), { recursive: true });
    await fs.writeFile(path.join(home, '.sneakoscope', 'team', 'runtime.json'), '{"schema":"sks.team-runtime.v1"}\n', 'utf8');
    await fs.writeFile(path.join(home, '.sneakoscope', 'team', 'notes.txt'), 'preserve home bytes\n', 'utf8');
    await fs.mkdir(path.join(globalRuntimeRoot, '.sneakoscope'), { recursive: true });
    await fs.writeFile(path.join(globalRuntimeRoot, '.sneakoscope', 'work-order-ledger.json'), '{"schema":"sks.work-order-ledger.v1","route":"team"}\n', 'utf8');

    const report = await runDoctorCommandAliasCleanup({ root: project, home, globalRuntimeRoot, fix: true });
    assert.equal(report.ok, true);
    assert.equal(report.status, 'clean');
    assert.equal(report.detected.retired_registry_entry_count, 0);
    assert.equal(report.detected.retired_catalog_entry_count, 0);
    assert.equal(report.cleanup.removed_count, 3);
    assert.equal(report.cleanup.remaining_count, 0);
    assert.equal(report.actions[0].action, 'doctor_fix_reconciled_current_public_surface');
    assert.doesNotMatch(JSON.stringify(report), /(?:team|mad-db|tmux|xai|swarm|shadow-clone|kage-bunshin|ralph)/i);
    await assert.rejects(fs.access(path.join(home, '.agents', 'skills', 'team')));
    await assert.rejects(fs.access(path.join(project, '.agents', 'skills', 'mad-db')));
    await assert.rejects(fs.access(path.join(project, '.codex', 'skills', 'swarm')));
    await assert.rejects(fs.access(path.join(home, '.sneakoscope', 'team')));
    await assert.rejects(fs.access(path.join(globalRuntimeRoot, '.sneakoscope', 'work-order-ledger.json')));
    assert.equal(await fs.readFile(path.join(project, '.agents', 'skills', 'customer-skill', 'SKILL.md'), 'utf8'), '---\nname: customer-skill\n---\n\nkeep me\n');
    const preservedHomeNotes = await findFile(home, 'notes.txt');
    assert.ok(preservedHomeNotes?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.equal(await fs.readFile(preservedHomeNotes, 'utf8'), 'preserve home bytes\n');
    const written = JSON.parse(await fs.readFile(path.join(project, '.sneakoscope/reports/command-alias-cleanup.json'), 'utf8'));
    assert.equal(written.schema, 'sks.command-alias-cleanup.v1');
    assert.equal(written.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function findFile(root, name) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(file, name);
      if (nested) return nested;
    } else if (entry.name === name) return file;
  }
  return null;
}

async function writeManagedSkill(dir, name) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Sneakoscope generated legacy skill\n---\n\n<!-- BEGIN SKS MANAGED SKILL v6.2.0 name=${name} -->\n`, 'utf8');
}
