import test from 'node:test';
import assert from 'node:assert/strict';

test('global SKS install cleanup keeps one global install and exempts source checkout', async () => {
  const { planGlobalSksInstallCleanup } = await import('../../dist/core/doctor/global-sks-install-cleanup.js');
  const sourceRoot = '/repo/Sneakoscope-Codex';
  const plan = planGlobalSksInstallCleanup([
    {
      bin: '/repo/Sneakoscope-Codex/dist/bin/sks.js',
      real_bin: '/repo/Sneakoscope-Codex/dist/bin/sks.js',
      package_root: sourceRoot,
      prefix: null,
      version: '1.21.6',
      source: 'source-root',
      source_repo_exempt: true,
      keep: false,
      remove: false,
      reason: 'discovered'
    },
    {
      bin: '/opt/homebrew/bin/sks',
      real_bin: '/opt/homebrew/lib/node_modules/sneakoscope/dist/bin/sks.js',
      package_root: '/opt/homebrew/lib/node_modules/sneakoscope',
      prefix: '/opt/homebrew',
      version: '1.21.6',
      source: 'PATH',
      source_repo_exempt: false,
      keep: false,
      remove: false,
      reason: 'discovered'
    },
    {
      bin: '/usr/local/bin/sks',
      real_bin: '/usr/local/lib/node_modules/sneakoscope/dist/bin/sks.js',
      package_root: '/usr/local/lib/node_modules/sneakoscope',
      prefix: '/usr/local',
      version: '1.20.0',
      source: 'PATH',
      source_repo_exempt: false,
      keep: false,
      remove: false,
      reason: 'discovered'
    }
  ], { sourceRoot });

  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.kept.some((candidate) => candidate.package_root === sourceRoot && candidate.source_repo_exempt), true);
  assert.equal(plan.kept.some((candidate) => candidate.package_root === '/opt/homebrew/lib/node_modules/sneakoscope'), true);
  assert.equal(plan.removable.length, 1);
  assert.equal(plan.removable[0].prefix, '/usr/local');
  assert.equal(plan.removable[0].reason, 'duplicate_global_install');
});
