import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('MAD native swarm dry-run targets the existing MAD mission ledger', async () => {
  const mod = await import('../../dist/core/commands/mad-sks-command.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-native-swarm-'));
  const missionId = 'M-mad-native-swarm';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });

  const report = await mod.startMadNativeSwarm(
    root,
    { mission_id: missionId, dir, root },
    ['--mad-agents', '7', '--mad-swarm-backend', 'fake'],
    { profile_name: 'sks-mad-high' },
    { dryRun: true }
  );

  assert.equal(report.ok, true);
  assert.equal(report.status, 'dry_run');
  assert.equal(report.same_mission_ledger, true);
  assert.equal(report.lane_count, 7);
  assert.equal(report.ledger_root, path.join('.sneakoscope', 'missions', missionId, 'agents'));
  assert.ok(report.command.includes('agent'));
  assert.ok(report.command.includes('run'));
  assert.ok(report.command.includes('--mission'));
  assert.ok(report.command.includes(missionId));
  assert.ok(report.command.includes('--route'));
  assert.ok(report.command.includes('$MAD-SKS'));
  assert.ok(report.command.includes('--readonly'));
  assert.ok(report.command.includes('--profile'));
  assert.ok(report.command.includes('sks-mad-high'));

  const artifact = JSON.parse(await fs.readFile(path.join(dir, 'mad-sks-native-swarm.json'), 'utf8'));
  assert.equal(artifact.status, 'dry_run');
  assert.equal(artifact.lane_count, 7);
});

test('MAD native swarm can be explicitly disabled for emergency launch fallback', async () => {
  const mod = await import('../../dist/core/commands/mad-sks-command.js');
  const options = mod.resolveMadNativeSwarmOptions(['--no-mad-swarm']);
  assert.equal(options.enabled, false);
  assert.equal(options.disabled_reason, 'operator_disabled_mad_native_swarm');
});
