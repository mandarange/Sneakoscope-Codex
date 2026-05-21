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
const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'view' && args[1] === 'sneakoscope' && args[2] === 'version') {
  console.log(process.env.SKS_FAKE_LATEST || '1.10.1');
  process.exit(0);
}
console.error('unexpected args: ' + args.join(' '));
process.exit(1);
`);
  await fs.chmod(fakeNpm, 0o755);

  const result = await runSksUpdateCheck({
    npmBin: fakeNpm,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_FAKE_NPM_LOG: log, SKS_FAKE_LATEST: '1.10.1' }
  });

  assert.equal(result.schema, 'sks.update-check.v2');
  assert.equal(result.mode, 'function');
  assert.equal(result.route_required, false);
  assert.equal(result.pipeline_required, false);
  assert.equal(result.update_available, true);
  assert.equal(result.command, 'npm i -g sneakoscope@1.10.1 --registry https://registry.npmjs.org/');
  assert.deepEqual(
    (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line)),
    [['view', 'sneakoscope', 'version', '--silent', '--registry', 'https://registry.npmjs.org/']]
  );
  assert.equal(comparePackageVersions('1.10.0', '1.9.9'), 1);
});

test('SKS update check can run without npm through the hermetic env override', async () => {
  const { runSksUpdateCheck } = await import('../../dist/core/update-check.js');
  const result = await runSksUpdateCheck({
    npmBin: null,
    currentVersion: '1.10.0',
    env: { ...process.env, SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '1.10.2' }
  });
  assert.equal(result.status, 'available');
  assert.equal(result.latest, '1.10.2');
  assert.equal(result.pipeline_required, false);
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
