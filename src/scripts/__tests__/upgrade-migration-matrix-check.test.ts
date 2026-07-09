import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { seedUpgradeMigrationFixture, UPGRADE_MIGRATION_FIXTURES } from '../../core/ops/upgrade-migration-fixtures.js';

test('upgrade migration fixtures include required legacy and corrupted-index states', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-upgrade-fixture-test-'));
  try {
    const fixtures = await seedUpgradeMigrationFixture(root);
    assert.equal(fixtures.length, UPGRADE_MIGRATION_FIXTURES.length);
    assert.ok(fixtures.some((fixture) => fixture.label === 'legacy Team route state'));
    assert.ok(fixtures.some((fixture) => fixture.label === 'legacy MadDB route state'));
    assert.ok(fixtures.some((fixture) => fixture.corruptIndex === true));
    const indexText = await fs.readFile(path.join(root, '.sneakoscope', 'missions', 'index.json'), 'utf8');
    assert.match(indexText, /corrupted/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
