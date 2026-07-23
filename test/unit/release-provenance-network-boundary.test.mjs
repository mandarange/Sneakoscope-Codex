import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('release provenance dev review remains hermetic and does not invoke npm', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-provenance-'));
  const bin = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'npm-called');
  const fakeNpm = path.join(bin, 'npm-fake.mjs');
  await fs.mkdir(bin);
  try {
    await fs.writeFile(fakeNpm, `#!/usr/bin/env node
import fs from 'node:fs';
fs.writeFileSync(process.env.SKS_FAKE_NPM_MARKER, process.argv.slice(2).join(' '));
process.exit(97);
`);
    await fs.chmod(fakeNpm, 0o755);
    await fs.writeFile(path.join(bin, 'npm'), `#!/usr/bin/env sh
exec "${process.execPath}" "${fakeNpm}" "$@"
`);
    await fs.chmod(path.join(bin, 'npm'), 0o755);
    await fs.writeFile(path.join(bin, 'npm.cmd'), `@echo off\r\n"${process.execPath}" "${fakeNpm}" %*\r\n`);

    const result = spawnSync(process.execPath, ['dist/scripts/release-provenance-check.js'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
        SKS_FAKE_NPM_MARKER: marker
      }
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fsSync.existsSync(marker), false, 'dev-review provenance must not contact the npm registry');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
