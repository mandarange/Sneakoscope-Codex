import assert from 'node:assert/strict';
import test from 'node:test';
import {
  codexLbBaseUrlSecurityBlocker,
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
    api_key: { present: true, source: 'env-file', redacted: true, fingerprint: 'fixture' },
    secret_api_key: 'sk-clb-fixture-secret',
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
