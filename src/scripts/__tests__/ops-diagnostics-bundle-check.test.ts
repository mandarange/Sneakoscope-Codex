import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildOpsDiagnosticsBundle } from '../../core/ops/diagnostics-bundle.js';

test('ops diagnostics bundle reports env keys without raw secret values', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ops-diagnostics-test-'));
  const previous = process.env.SKS_TEST_SECRET_TOKEN;
  process.env.SKS_TEST_SECRET_TOKEN = 'raw-secret-value';
  try {
    await fs.writeFile(path.join(root, 'package.json'), '{"version":"0.0.0","scripts":{},"bin":{}}\n');
    const bundle = await buildOpsDiagnosticsBundle(root);
    assert.equal(bundle.secret_scan.raw_values_recorded, false);
    assert.ok(bundle.redacted_env_keys.includes('SKS_TEST_SECRET_TOKEN'));
    assert.equal(JSON.stringify(bundle).includes('raw-secret-value'), false);
  } finally {
    if (previous === undefined) delete process.env.SKS_TEST_SECRET_TOKEN;
    else process.env.SKS_TEST_SECRET_TOKEN = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
