import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTemporaryInstallSmoke } from '../update/temporary-install-smoke.js';

test('temporary install smoke verifies package manifest, entrypoint version, and package-local doctor', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-temp-install-'));
  const npmBin = path.join(root, 'npm-fixture.mjs');
  try {
    await writePrefixNpmFixture(npmBin);
    const result = await runTemporaryInstallSmoke({
      npmBin,
      packageName: 'sneakoscope',
      version: '6.3.0',
      registry: 'https://registry.npmjs.org/',
      env: { ...process.env, HOME: root, SKS_TEST_DOCTOR_OK: '1' },
      timeoutMs: 10_000
    });
    assert.equal(result.ok, true, result.error || 'temporary smoke failed');
    assert.equal(result.status, 'verified');
    assert.equal(result.install_code, 0);
    assert.equal(result.manifest_version, '6.3.0');
    assert.equal(result.probed_version, '6.3.0');
    assert.equal(result.doctor?.ok, true);
    assert.deepEqual(result.npm_args.slice(0, 4), ['install', '--prefix', result.npm_args[2], 'sneakoscope@6.3.0']);
    await assert.rejects(fs.access(path.dirname(path.dirname(path.dirname(result.entrypoint!)))));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('temporary install smoke fails closed on a mismatched package manifest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-temp-mismatch-'));
  const npmBin = path.join(root, 'npm-fixture.mjs');
  try {
    await writePrefixNpmFixture(npmBin);
    const result = await runTemporaryInstallSmoke({
      npmBin,
      packageName: 'sneakoscope',
      version: '6.3.0',
      registry: 'https://registry.npmjs.org/',
      env: {
        ...process.env,
        HOME: root,
        SKS_TEST_DOCTOR_OK: '1',
        SKS_FAKE_TEMP_MANIFEST_VERSION: '6.2.0'
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'manifest_invalid');
    assert.equal(result.manifest_version, '6.2.0');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function writePrefixNpmFixture(file: string): Promise<void> {
  await fs.writeFile(file, [
    `#!${process.execPath}`,
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "const args = process.argv.slice(2);",
    "if (args[0] !== 'install' || args[1] !== '--prefix') process.exit(2);",
    "const prefix = args[2];",
    "const spec = args[3] || '';",
    "const target = spec.slice(spec.indexOf('@') + 1);",
    "const manifestVersion = process.env.SKS_FAKE_TEMP_MANIFEST_VERSION || target;",
    "const packageRoot = path.join(prefix, 'node_modules', 'sneakoscope');",
    "const entrypoint = path.join(packageRoot, 'dist', 'bin', 'sks.js');",
    "fs.mkdirSync(path.dirname(entrypoint), { recursive: true });",
    "fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'sneakoscope', version: manifestVersion, type: 'module' }) + '\\n');",
    "fs.writeFileSync(entrypoint, `if (process.argv.includes('--version')) { console.log(${JSON.stringify(target)}); process.exit(0); } process.exit(1);\\n`);",
    "console.log('temporary package installed');"
  ].join('\n'));
  await fs.chmod(file, 0o755);
}
