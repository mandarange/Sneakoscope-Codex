import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMMANDS } from '../../dist/cli/command-registry.js';
import { ensureCurrentMigrationBeforeCommand } from '../../dist/core/update/update-migration-state.js';
import { doctorArgWarnings, doctorProfileFromArgs } from '../../dist/commands/doctor.js';

test('doctor remains executable when migration gate would otherwise block normal commands', async () => {
  assert.equal(COMMANDS.doctor.skipMigrationGate, true);
  const result = await ensureCurrentMigrationBeforeCommand({
    command: 'doctor',
    args: ['--fix', '--yes'],
    cwd: process.cwd(),
    env: { ...process.env, SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT: '1' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped');
  assert.equal(result.failed_stage_id, null);
});

test('doctor consumes migration gate machine flags and validates profile values', () => {
  assert.equal(doctorProfileFromArgs(['--profile', 'migration'], true), 'migration');
  assert.deepEqual(doctorArgWarnings(['--fix', '--yes', '--machine-only', '--report-file', 'out.json', '--profile', 'migration']), []);
  assert.ok(doctorArgWarnings(['--profile', 'bogus']).some((warning) => warning.startsWith('unknown_profile:bogus')));
  assert.ok(doctorArgWarnings(['--not-a-real-flag']).includes('unknown_flag:--not-a-real-flag'));
});

test('doctor --fix reports a real migration receipt result instead of hard-coded current state', () => {
  const source = fs.readFileSync('dist/commands/doctor.js', 'utf8');
  assert.doesNotMatch(source, /manual_update_commands_only/);
  assert.doesNotMatch(source, /migration_current:\s*true/);
  assert.match(source, /writeProjectUpdateMigrationReceipt/);
  assert.match(source, /doctor_fix_wrote_current_project_migration_receipt/);
  assert.match(source, /doctor_fix_migration_receipt_failed/);
});
