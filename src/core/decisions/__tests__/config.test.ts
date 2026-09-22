import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readDecisionConfig, writeDecisionConfig } from '../config.js';

async function tempEnv(t: test.TestContext): Promise<NodeJS.ProcessEnv> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-jev-config-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return { HOME: path.join(root, 'home'), SKS_HOME: path.join(root, 'sks') };
}

test('default mode is off and leftover local-decision files are ignored', async (t) => {
  const env = await tempEnv(t);
  await fsp.mkdir(path.join(env.SKS_HOME!, 'local-decision'), { recursive: true });
  await fsp.writeFile(path.join(env.SKS_HOME!, 'local-decision', 'config.json'), JSON.stringify({
    schemaVersion: 1,
    mode: 'advisory',
    shadowSampleRate: 1,
    updatedAt: '2026-09-17T00:00:00.000Z'
  }));
  const config = await readDecisionConfig(env);
  assert.equal(config.mode, 'off');
  assert.equal(config.consentCloud, false);
  assert.equal(config.schema, 'sks.jev-decision-config.v1');
});

test('enable requires explicit cloud consent and the pinned model', async (t) => {
  const env = await tempEnv(t);
  await assert.rejects(
    writeDecisionConfig({ mode: 'jev', consentCloud: false }, env),
    /jev_cloud_consent_required/
  );
  const next = await writeDecisionConfig({
    mode: 'jev',
    consentCloud: true,
    consentAt: '2026-09-19T00:00:00.000Z',
    model: 'typesafe/jev-1.13',
    capabilities: {
      context: { ready: true, promoted: false, reason: 'ready' },
      plan: { ready: true, promoted: false, reason: 'ready' }
    }
  }, env);
  assert.equal(next.mode, 'jev');
  assert.equal(next.capabilities.recovery.ready, false);
  const written = path.join(env.SKS_HOME!, 'decisions', 'config.json');
  const stat = await fsp.stat(written);
  assert.equal(stat.mode & 0o777, 0o600);
  const reread = await readDecisionConfig(env);
  assert.equal(reread.mode, 'jev');
});
