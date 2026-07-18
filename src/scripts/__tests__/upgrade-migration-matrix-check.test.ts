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
    const teamFixture = fixtures.find((fixture) => fixture.mode === 'team');
    assert.ok(teamFixture);
    const teamRoot = path.join(root, '.sneakoscope', 'missions', teamFixture.id);
    const teamMission = JSON.parse(await fs.readFile(path.join(teamRoot, 'mission.json'), 'utf8'));
    const teamProof = JSON.parse(await fs.readFile(path.join(teamRoot, 'completion-proof.json'), 'utf8'));
    const teamEvents = await fs.readFile(path.join(teamRoot, 'events.jsonl'), 'utf8');
    assert.equal(teamMission.route, '$Team');
    assert.equal(teamMission.route_command, '$Team');
    assert.equal(teamMission.questions_allowed, true);
    assert.equal(teamMission.implementation_allowed, false);
    assert.equal(teamProof.route, '$Team');
    assert.match(teamEvents, /"type":"mission\.created"/);
    assert.match(teamEvents, /"route":"\$Team"/);
    const indexText = await fs.readFile(path.join(root, '.sneakoscope', 'missions', 'index.json'), 'utf8');
    assert.match(indexText, /corrupted/);
    assert.equal(await fs.readFile(path.join(root, 'USER-NOTES.md'), 'utf8'), 'customer-owned upgrade notes\n');
    const customerMetadata = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'state', 'customer-metadata.json'), 'utf8'));
    assert.equal(customerMetadata.profile.mode, 'team');
    assert.equal(JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'team-dashboard-state.json'), 'utf8')).schema, 'sks.team-dashboard-state.v1');
    assert.equal(JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'team', 'manifest.json'), 'utf8')).schema, 'sks.team-runtime.v1');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
