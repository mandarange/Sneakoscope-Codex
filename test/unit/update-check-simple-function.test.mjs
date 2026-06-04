import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('SKS update check is a function-only npm freshness check', async () => {
  const { runSksUpdateCheck, comparePackageVersions } = await import('../../dist/core/update-check.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-check-'));
  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(tmp, 'npm-fake.mjs');
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'list' && args[1] === '-g' && args[2] === 'sneakoscope') {
  console.log(JSON.stringify({ dependencies: { sneakoscope: { version: process.env.SKS_FAKE_GLOBAL || '1.10.0' } } }));
  process.exit(0);
}
if (args[0] === 'root' && args[1] === '-g') {
  console.log(path.join(process.env.SKS_FAKE_NPM_ROOT || process.cwd(), 'node_modules'));
  process.exit(0);
}
if (args[0] === 'view' && args[1] === 'sneakoscope' && args[2] === 'version') {
  console.log(process.env.SKS_FAKE_LATEST || '99.99.99');
  process.exit(0);
}
console.error('unexpected args: ' + args.join(' '));
process.exit(1);
`);
  await fs.chmod(fakeNpm, 0o755);

  const result = await runSksUpdateCheck({
    npmBin: fakeNpm,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_FAKE_NPM_LOG: log, SKS_FAKE_LATEST: '99.99.99', SKS_FAKE_GLOBAL: '1.10.0' }
  });

  assert.equal(result.schema, 'sks.update-check.v2');
  assert.equal(result.mode, 'function');
  assert.equal(result.route_required, false);
  assert.equal(result.pipeline_required, false);
  assert.equal(result.update_available, true);
  assert.equal(result.npm_global_current, '1.10.0');
  assert.equal(result.command, 'sks update now --version 99.99.99');
  const calls = (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(calls.at(-1), ['view', 'sneakoscope', 'version', '--silent', '--registry', 'https://registry.npmjs.org/']);
  assert.ok(calls.some((args) => args[0] === 'list' && args[1] === '-g' && args[2] === 'sneakoscope'));
  assert.equal(comparePackageVersions('1.10.0', '1.9.9'), 1);
});

test('SKS update now installs through npm global argv instead of local project install', async () => {
  const { runSksUpdateNow } = await import('../../dist/core/update-check.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-now-global-'));
  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(tmp, 'npm-fake.mjs');
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === 'list' && args[1] === '-g' && args[2] === 'sneakoscope') {
  console.log(JSON.stringify({ dependencies: { sneakoscope: { version: '1.10.0' } } }));
  process.exit(0);
}
if (args[0] === 'root' && (args[1] === '-g' || args[1] === '--global')) {
  console.log(path.join(process.env.SKS_FAKE_NPM_ROOT || process.cwd(), 'node_modules'));
  process.exit(0);
}
if (args[0] === 'view' && args[1] === 'sneakoscope' && args[2] === 'version') {
  console.log('99.99.99');
  process.exit(0);
}
if (args[0] === 'install' && args[1] === '--global' && args[2] === 'sneakoscope@99.99.99') {
  console.log('globally installed');
  process.exit(0);
}
console.error('unexpected args: ' + args.join(' '));
process.exit(1);
`);
  await fs.chmod(fakeNpm, 0o755);

  const result = await runSksUpdateNow({
    npmBin: fakeNpm,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_FAKE_NPM_LOG: log }
  });

  assert.equal(result.schema, 'sks.update-now.v1');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'updated');
  assert.deepEqual(result.npm_args, ['install', '--global', 'sneakoscope@99.99.99', '--registry', 'https://registry.npmjs.org/']);
  const calls = (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.ok(calls.some((call) => call.args[0] === 'root' && call.args[1] === '--global'));
  assert.ok(calls.some((call) => call.args[0] === 'install' && call.args[1] === '--global'));
  assert.ok(!calls.some((call) => call.args[0] === 'install' && call.args[1] !== '--global'));
});

test('SKS update check treats current global npm package as installed even when runtime is older', async () => {
  const { runSksUpdateCheck } = await import('../../dist/core/update-check.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-check-global-'));
  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(tmp, 'npm-fake.mjs');
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'list' && args[1] === '-g' && args[2] === 'sneakoscope') {
  console.log(JSON.stringify({ dependencies: { sneakoscope: { version: '9.9.9' } } }));
  process.exit(0);
}
if (args[0] === 'root' && args[1] === '-g') {
  console.log(process.cwd() + '/node_modules');
  process.exit(0);
}
if (args[0] === 'view' && args[1] === 'sneakoscope' && args[2] === 'version') {
  console.log('9.9.9');
  process.exit(0);
}
process.exit(1);
`);
  await fs.chmod(fakeNpm, 0o755);
  const result = await runSksUpdateCheck({
    npmBin: fakeNpm,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_FAKE_NPM_LOG: log }
  });
  assert.equal(result.current, '9.9.9');
  assert.equal(result.npm_global_current, '9.9.9');
  assert.equal(result.status, 'current');
  assert.equal(result.update_available, false);
  assert.equal(result.command, null);
});

test('SKS update check can run without npm through the hermetic env override', async () => {
  const { runSksUpdateCheck } = await import('../../dist/core/update-check.js');
  const result = await runSksUpdateCheck({
    npmBin: null,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '99.99.99' }
  });
  assert.equal(result.status, 'available');
  assert.equal(result.latest, '99.99.99');
  assert.equal(result.pipeline_required, false);
});

test('SKS update check override does not call npm view', async () => {
  const { runSksUpdateCheck } = await import('../../dist/core/update-check.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-check-override-'));
  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(tmp, 'npm-fake.mjs');
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'list' && args[1] === '-g' && args[2] === 'sneakoscope') {
  console.log(JSON.stringify({ dependencies: { sneakoscope: { version: '1.10.0' } } }));
  process.exit(0);
}
if (args[0] === 'root' && args[1] === '-g') {
  console.log(path.join(process.cwd(), 'node_modules'));
  process.exit(0);
}
if (args[0] === 'view') {
  console.error('npm view should not run when override is present');
  process.exit(1);
}
process.exit(0);
`);
  await fs.chmod(fakeNpm, 0o755);
  const result = await runSksUpdateCheck({
    npmBin: fakeNpm,
    currentVersion: '1.10.0',
    env: {
      ...process.env,
      SKS_FAKE_NPM_LOG: log,
      SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '99.99.99'
    }
  });
  assert.equal(result.status, 'available');
  assert.equal(result.latest, '99.99.99');
  const calls = (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(calls.some((args) => args[0] === 'view'), false);
});

test('SKS update check reports unavailable instead of starting fallback work', async () => {
  const { runSksUpdateCheck } = await import('../../dist/core/update-check.js');
  const result = await runSksUpdateCheck({
    npmBin: null,
    currentVersion: '1.10.0',
    env: {}
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.update_available, false);
  assert.equal(result.command, null);
  assert.equal(result.error, 'npm not found on PATH');
  assert.equal(result.route_required, false);
  assert.equal(result.pipeline_required, false);
});
