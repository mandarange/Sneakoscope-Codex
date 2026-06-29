import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

test('global SKS install cleanup under fix removes stale installs and clears npm cache', async () => {
  const { cleanDuplicateGlobalSksInstalls } = await import('../../dist/core/doctor/global-sks-install-cleanup.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-global-cleanup-'));
  const sourceRoot = path.join(tmp, 'source');
  const keepPrefix = path.join(tmp, 'keep-prefix');
  const oldPrefix = path.join(tmp, 'old-prefix');
  await writeSksPackage(sourceRoot, '4.6.3');
  await writeSksPackage(path.join(keepPrefix, 'lib', 'node_modules', 'sneakoscope'), '4.6.3');
  await writeSksPackage(path.join(oldPrefix, 'lib', 'node_modules', 'sneakoscope'), '4.6.1');
  await fs.mkdir(path.join(keepPrefix, 'bin'), { recursive: true });
  await fs.mkdir(path.join(oldPrefix, 'bin'), { recursive: true });
  await fs.symlink(path.join(keepPrefix, 'lib', 'node_modules', 'sneakoscope', 'dist', 'bin', 'sks.js'), path.join(keepPrefix, 'bin', 'sks'));
  await fs.symlink(path.join(oldPrefix, 'lib', 'node_modules', 'sneakoscope', 'dist', 'bin', 'sks.js'), path.join(oldPrefix, 'bin', 'sks'));
  const nodeShimDir = path.join(tmp, 'node-shim');
  await fs.mkdir(nodeShimDir, { recursive: true });
  await fs.symlink(process.execPath, path.join(nodeShimDir, 'node'));
  const oldPrefixReal = await fs.realpath(oldPrefix);

  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(tmp, 'npm-fake.mjs');
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'prefix' && args[1] === '-g') {
  console.log(process.env.SKS_KEEP_PREFIX);
  process.exit(0);
}
if (args[0] === 'root' && args[1] === '-g') {
  console.log(path.join(process.env.SKS_KEEP_PREFIX, 'lib', 'node_modules'));
  process.exit(0);
}
if (args[0] === 'uninstall' && args[1] === '-g' && args[2] === 'sneakoscope' && args[3] === '--prefix') {
  process.exit(0);
}
if (args[0] === 'cache' && args[1] === 'clean' && args[2] === '--force') {
  process.exit(0);
}
console.error('unexpected npm args: ' + args.join(' '));
process.exit(2);
`);
  await fs.chmod(fakeNpm, 0o755);

  const result = await cleanDuplicateGlobalSksInstalls({
    root: sourceRoot,
    fix: true,
    npmBin: fakeNpm,
    env: {
      ...process.env,
      PATH: [...[oldPrefix, keepPrefix].map((prefix) => path.join(prefix, 'bin')), nodeShimDir].join(path.delimiter),
      SKS_FAKE_NPM_LOG: log,
      SKS_KEEP_PREFIX: keepPrefix,
      SKS_OLD_PREFIX: oldPrefix,
      SKS_MUTATION_LEDGER_ROOT: tmp
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].prefix, oldPrefixReal);
  assert.equal(result.npm_cache.status, 'cleaned');
  const calls = (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.ok(calls.some((args) => args[0] === 'uninstall' && args[4] === oldPrefixReal));
  assert.ok(calls.some((args) => args[0] === 'cache' && args[1] === 'clean' && args.includes('--force')));
});

async function writeSksPackage(root, version) {
  await fs.mkdir(path.join(root, 'dist', 'bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'sneakoscope', version }, null, 2)}\n`);
  const bin = path.join(root, 'dist', 'bin', 'sks.js');
  await fs.writeFile(bin, '#!/usr/bin/env node\nconsole.log("sks fixture")\n');
  await fs.chmod(bin, 0o755);
}
