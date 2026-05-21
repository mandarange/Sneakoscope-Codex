import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('release registry check ignores inherited publish dist-tag config', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-registry-check-'));
  const bin = path.join(tmp, 'bin');
  const log = path.join(tmp, 'npm-log.jsonl');
  const fakeNpm = path.join(bin, 'npm-fake.mjs');
  await fs.mkdir(bin);
  await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';

const args = process.argv.slice(2);
fs.appendFileSync(process.env.SKS_FAKE_NPM_LOG, JSON.stringify({
  args,
  tag: process.env.npm_config_tag || null
}) + '\\n');

if (args[0] === 'pack') {
  console.log(JSON.stringify([{ name: 'sneakoscope', version: '1.11.0' }]));
  process.exit(0);
}

if (args[0] === 'view' && args[1] === 'sneakoscope@latest') {
  console.log(JSON.stringify({ version: '0.9.20', 'dist-tags': { latest: '0.9.20' } }));
  process.exit(0);
}

if (args[0] === 'view' && args[1] === 'sneakoscope@1.11.0') {
  console.error('No match found for version 1.11.0');
  process.exit(1);
}

console.error(\`unexpected fake npm args: \${args.join(' ')}\`);
process.exit(1);
`);
  await fs.chmod(fakeNpm, 0o755);
  await fs.writeFile(path.join(bin, 'npm'), `#!/usr/bin/env sh
exec "${process.execPath}" "${fakeNpm}" "$@"
`);
  await fs.chmod(path.join(bin, 'npm'), 0o755);
  await fs.writeFile(path.join(bin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${fakeNpm}" %*\r\n`);

  const result = spawnSync(process.execPath, ['scripts/release-registry-check.mjs', '--require-unpublished'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
      SKS_FAKE_NPM_LOG: log,
      npm_config_tag: 'rc'
    }
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Registry metadata check passed/);

  const calls = (await fs.readFile(log, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const viewCalls = calls.filter((call) => call.args[0] === 'view');
  assert.deepEqual(viewCalls.map((call) => call.args[1]), ['sneakoscope@latest', 'sneakoscope@1.11.0']);
  assert.deepEqual(viewCalls.map((call) => call.tag), [null, null]);
});
