import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMAND_CATALOG } from '../../dist/core/routes.js';
import { COMMANDS, LEGACY_COMMAND_ALIASES, commandNames } from '../../dist/cli/command-registry.js';
import { normalizeCommand } from '../../dist/cli/router.js';
import { runDoctorCommandAliasCleanup } from '../../dist/core/doctor/command-alias-cleanup.js';

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

test('flag aliases normalize to canonical command handlers', () => {
  assert.equal(normalizeCommand(['--mad', '--high']).command, 'mad-sks');
  assert.equal(normalizeCommand(['--MAD']).command, 'mad-sks');
  assert.equal(normalizeCommand(['--help']).command, 'help');
});

test('doctor command alias cleanup writes a clean report during fix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-command-alias-cleanup-'));
  try {
    const report = await runDoctorCommandAliasCleanup({ root, fix: true });
    assert.equal(report.ok, true);
    assert.equal(report.status, 'clean');
    assert.equal(report.detected.registered_alias_commands.length, 0);
    assert.equal(report.detected.catalog_alias_rows.length, 0);
    const written = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope/reports/command-alias-cleanup.json'), 'utf8'));
    assert.equal(written.schema, 'sks.command-alias-cleanup.v1');
    assert.equal(written.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
