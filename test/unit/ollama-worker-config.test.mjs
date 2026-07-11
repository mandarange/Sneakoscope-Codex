import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveOllamaWorkerConfig } from '../../dist/core/agents/ollama-worker-config.js';

test('stored disabled local model is default off but explicit run activation can enable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ollama-config-test-'));
  const old = snapshotEnv();
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  await fs.writeFile(process.env.SKS_LOCAL_MODEL_CONFIG, JSON.stringify({
    schema: 'sks.local-model-config.v1',
    enabled: false,
    provider: 'ollama',
    model: 'local:test',
    base_url: 'http://127.0.0.1:11434'
  }));
  try {
    const implicit = await resolveOllamaWorkerConfig();
    assert.equal(implicit.enabled, false);
    assert.match(implicit.blockers.join('\n'), /ollama_workers_disabled/);

    const explicit = await resolveOllamaWorkerConfig({ backend: 'ollama' });
    assert.equal(explicit.enabled, true);
    assert.equal(explicit.ok, false);
    assert.equal(explicit.status, 'enabled_unverified');
    assert.match(explicit.blockers.join('\n'), /local_llm_enabled_unverified/);
    assert.equal(explicit.model, 'local:test');
  } finally {
    restoreEnv(old);
  }
});

test('SKS_OLLAMA_WORKERS=0 force-disables even explicit local backend', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-ollama-config-off-test-'));
  const old = snapshotEnv();
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(root, 'local-model.json');
  process.env.SKS_OLLAMA_WORKERS = '0';
  try {
    const explicit = await resolveOllamaWorkerConfig({ backend: 'ollama' });
    assert.equal(explicit.enabled, false);
    assert.equal(explicit.ok, false);
    assert.match(explicit.blockers.join('\n'), /ollama_workers_disabled/);
  } finally {
    restoreEnv(old);
  }
});

function snapshotEnv() {
  return {
    SKS_LOCAL_MODEL_CONFIG: process.env.SKS_LOCAL_MODEL_CONFIG,
    SKS_OLLAMA_WORKERS: process.env.SKS_OLLAMA_WORKERS
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
