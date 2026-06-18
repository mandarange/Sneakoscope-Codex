import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  openRouterSecretPaths,
  resolveOpenRouterApiKey,
  writeStoredOpenRouterKey
} from '../openrouter-secret-store.js';

test('OpenRouter env key wins over stored key and OPENAI_API_KEY is ignored', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-openrouter-secret-'));
  const env = {
    HOME: root,
    OPENAI_API_KEY: 'openai-fixture-should-not-be-used-0000000000',
    OPENROUTER_API_KEY: 'or-fixture-env-key-abcdefghijklmnop'
  } as NodeJS.ProcessEnv;
  const paths = openRouterSecretPaths(env);
  await writeStoredOpenRouterKey('or-fixture-stored-key-abcdefghijklmnop', { paths });
  const resolved = await resolveOpenRouterApiKey({ env, paths });
  assert.equal(resolved.source, 'env');
  assert.equal(resolved.env_var, 'OPENROUTER_API_KEY');
  assert.equal(resolved.key, env.OPENROUTER_API_KEY);
});

test('OpenRouter stored key is written with private permissions and redacted metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-openrouter-secret-'));
  const env = { HOME: root } as NodeJS.ProcessEnv;
  const paths = openRouterSecretPaths(env);
  const raw = 'or-fixture-secret-key-abcdefghijklmnop';
  const first = await writeStoredOpenRouterKey(raw, { paths, nowIso: () => '2026-06-18T00:00:00.000Z' });
  const second = await writeStoredOpenRouterKey('or-fixture-new-key-abcdefghijklmnop', {
    paths,
    nowIso: () => '2026-06-18T00:01:00.000Z'
  });
  const mode = (await fs.stat(paths.keyPath)).mode & 0o777;
  const dirMode = (await fs.stat(paths.secretDir)).mode & 0o777;
  const metadata = await fs.readFile(paths.metadataPath, 'utf8');
  assert.equal(mode, 0o600);
  assert.equal(dirMode, 0o700);
  assert.equal(first.created_at, second.created_at);
  assert.equal(second.updated_at, '2026-06-18T00:01:00.000Z');
  assert.equal(metadata.includes(raw), false);
  assert.equal(metadata.includes('or-fixture-new-key-abcdefghijklmnop'), false);
  assert.match(second.key_preview, /^or-fix/);
});
