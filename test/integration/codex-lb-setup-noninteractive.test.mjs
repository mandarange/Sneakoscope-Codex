import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runProcess } from '../../src/core/fsx.mjs';

test('codex-lb noninteractive setup configures env loader and metadata', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-it-codex-lb-noninteractive-'));
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex-lb', 'setup', '--host', 'lb.example.test', '--api-key', 'sk-noninteractive', '--yes', '--json'], {
    env: { ...process.env, HOME: home, CI: 'true', SKS_CODEX_LB_CHAIN_CHECK: '0', SKS_SKIP_CODEX_LB_LAUNCH_ENV: '1' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /sk-noninteractive/);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.base_url, 'https://lb.example.test/backend-api/codex');
  const metadata = JSON.parse(await fs.readFile(path.join(home, '.codex', 'sks-codex-lb.json'), 'utf8'));
  assert.equal(metadata.api_key.redacted, true);
  assert.ok(metadata.api_key.sha256);
});
