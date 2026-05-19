import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../src/core/fsx.mjs';

test('codex-lb doctor sees redacted key after setup', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-doctor-'));
  const secret = 'sk-fixture-doctor-secret';
  const env = { ...process.env, HOME: home, CI: 'true', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1', SKS_CODEX_LB_CHAIN_CHECK: '0' };
  const setup = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key-stdin', '--yes', '--json'], {
    input: `${secret}\n`,
    env,
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(setup.code, 0, setup.stderr || setup.stdout);

  const doctor = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'doctor', '--deep', '--json'], {
    env,
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);
  const text = `${doctor.stdout}\n${doctor.stderr}`;
  assert.doesNotMatch(text, new RegExp(secret));
  assert.doesNotMatch(text, /Missing environment variable:\s*`?CODEX_LB_API_KEY`?/i);
  const json = JSON.parse(doctor.stdout);
  assert.equal(json.schema, 'sks.codex-lb-doctor.v1');
  assert.equal(json.status.api_key.redacted, true);
  assert.equal(json.status.setup_needed, false);
});
