import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../src/core/fsx.mjs';

const rawMissingEnvPattern = new RegExp(['Missing environment variable:', '\\s*`?CODEX_LB_API_KEY`?'].join(''), 'i');

test('blackbox after-update codex-lb doctor has structured setup guidance', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-bb-codex-lb-update-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'doctor', '--deep', '--json'], {
    env: { ...process.env, HOME: home, CI: 'true', CODEX_LB_API_KEY: '', CODEX_LB_BASE_URL: '' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, rawMissingEnvPattern);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.codex-lb-doctor.v1');
  assert.equal(json.status.setup_needed, true);
});
