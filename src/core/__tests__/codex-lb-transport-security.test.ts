import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  codexLbBaseUrlSecurityBlocker,
  loadCodexLbEnv,
  readCodexLbModelCatalog,
  type CodexLbEnvLoadResult
} from '../codex-lb/codex-lb-env.js';

function loaded(baseUrl: string): CodexLbEnvLoadResult {
  return {
    schema: 'sks.codex-lb-env.v1',
    configured: true,
    missing: [],
    source: 'env-file',
    source_priority: ['env-file'],
    base_url: baseUrl,
    api_key: { present: true, usable: true, source: 'env-file', redacted: true, fingerprint: 'fixture' },
    secret_api_key: 'sk-clb-fixture-secret',
    credential_binding: {
      checked: false,
      present: false,
      valid: false,
      status: 'missing',
      metadata_path: '/tmp/sks-codex-lb.json',
      api_key_matches: null,
      base_url_matches: null,
      blockers: []
    },
    env_paths: [],
    keychain: { checked: false, available: false, status: 'not_checked' }
  };
}

test('codex-lb never sends bearer credentials over insecure remote transport', async () => {
  let called = false;
  const result = await readCodexLbModelCatalog({
    loadedEnv: loaded('http://remote.example/backend-api/codex'),
    fetchImpl: (async () => {
      called = true;
      throw new Error('must not fetch');
    }) as typeof fetch
  });

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('codex_lb_insecure_base_url'));
  assert.equal(codexLbBaseUrlSecurityBlocker('https://remote.example/backend-api/codex'), null);
  assert.equal(codexLbBaseUrlSecurityBlocker('http://127.0.0.1:8787/backend-api/codex'), null);
  assert.equal(codexLbBaseUrlSecurityBlocker('https://user:pass@remote.example/backend-api/codex'), 'codex_lb_base_url_userinfo_forbidden');
});

test('codex-lb loader suppresses a persisted secret when metadata fingerprint or URL binding drifts', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-binding-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  const codexHome = path.join(home, '.codex');
  const envPath = path.join(codexHome, 'sks-codex-lb.env');
  const metadataPath = path.join(codexHome, 'sks-codex-lb.json');
  const apiKey = 'sk-clb-binding-fixture';
  const baseUrl = 'https://bound.example.test/backend-api/codex';
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.writeFile(envPath, `export CODEX_LB_BASE_URL='${baseUrl}'\nexport CODEX_LB_API_KEY='${apiKey}'\n`, { mode: 0o600 });
  await fsp.writeFile(metadataPath, `${JSON.stringify({
    schema: 'sks.codex-lb-metadata.v1',
    base_url: baseUrl,
    api_key: { redacted: true, sha256: createHash('sha256').update(apiKey).digest('hex') }
  })}\n`, { mode: 0o600 });

  const matched = await loadCodexLbEnv({ home, processEnv: {}, securityBin: '/bin/false' });
  assert.equal(matched.configured, true);
  assert.equal(matched.credential_binding.status, 'matched');
  assert.equal(matched.secret_api_key, apiKey);

  await fsp.writeFile(envPath, `export CODEX_LB_BASE_URL='https://mutated.example.test/backend-api/codex'\nexport CODEX_LB_API_KEY='${apiKey}'\n`, { mode: 0o600 });
  const urlMismatch = await loadCodexLbEnv({ home, processEnv: {}, securityBin: '/bin/false' });
  assert.equal(urlMismatch.configured, false);
  assert.equal(urlMismatch.credential_binding.status, 'base_url_mismatch');
  assert.equal(urlMismatch.secret_api_key, null);
  assert.equal(urlMismatch.base_url, baseUrl);

  await fsp.writeFile(envPath, `export CODEX_LB_BASE_URL='${baseUrl}'\nexport CODEX_LB_API_KEY='sk-clb-different-fixture'\n`, { mode: 0o600 });
  const keyMismatch = await loadCodexLbEnv({ home, processEnv: {}, securityBin: '/bin/false' });
  assert.equal(keyMismatch.configured, false);
  assert.equal(keyMismatch.credential_binding.status, 'api_key_mismatch');
  assert.equal(keyMismatch.secret_api_key, null);
});

test('codex-lb loader binds the explicit HOME credential before an unrelated macOS keychain item', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-source-'));
  t.after(() => fsp.rm(home, { recursive: true, force: true }));
  const codexHome = path.join(home, '.codex');
  const envPath = path.join(codexHome, 'sks-codex-lb.env');
  const metadataPath = path.join(codexHome, 'sks-codex-lb.json');
  const securityStub = path.join(home, 'security-stub');
  const apiKey = 'sk-clb-home-fixture';
  const baseUrl = 'https://home-bound.example.test/backend-api/codex';
  await fsp.mkdir(codexHome, { recursive: true });
  await fsp.writeFile(envPath, `export CODEX_LB_BASE_URL='${baseUrl}'\nexport CODEX_LB_API_KEY='${apiKey}'\n`, { mode: 0o600 });
  await fsp.writeFile(securityStub, "#!/bin/sh\nprintf '%s\\n' 'sk-clb-unrelated-keychain-fixture'\n", { mode: 0o700 });

  const withoutMetadata = await loadCodexLbEnv({
    home,
    processEnv: {},
    forceMacos: true,
    securityBin: securityStub
  });
  assert.equal(withoutMetadata.configured, true);
  assert.equal(withoutMetadata.api_key.source, 'env-file');
  assert.equal(withoutMetadata.secret_api_key, apiKey);

  await fsp.writeFile(metadataPath, `${JSON.stringify({
    schema: 'sks.codex-lb-metadata.v1',
    base_url: baseUrl,
    api_key: { redacted: true, sha256: createHash('sha256').update(apiKey).digest('hex') }
  })}\n`, { mode: 0o600 });
  const withMetadata = await loadCodexLbEnv({
    home,
    processEnv: {},
    forceMacos: true,
    securityBin: securityStub
  });
  assert.equal(withMetadata.configured, true);
  assert.equal(withMetadata.api_key.source, 'env-file');
  assert.equal(withMetadata.credential_binding.status, 'matched');
  assert.equal(withMetadata.secret_api_key, apiKey);
});
