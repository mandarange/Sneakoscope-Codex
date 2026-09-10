import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImagegenAuthMode,
  evaluateImagegenAuthReadiness
} from '../../dist/core/imagegen/imagegen-auth-readiness.js';

const OAUTH_AUTH_JSON = JSON.stringify({
  auth_mode: 'chatgpt',
  OPENAI_API_KEY: null,
  tokens: { access_token: 'eyJ.a.b', account_id: 'acct-1' }
});
const APIKEY_AUTH_JSON = JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-test' });

test('detects ChatGPT OAuth auth mode from auth.json', async () => {
  const r = await detectImagegenAuthMode({ env: { HOME: '/tmp/none' }, authJsonText: OAUTH_AUTH_JSON });
  assert.equal(r.auth_mode, 'chatgpt_oauth');
  assert.equal(r.openai_api_key_present, false);
});

test('OAuth-only built-in availability does not prove support for the current image model', async () => {
  const r = await evaluateImagegenAuthReadiness({
    env: { HOME: '/tmp/none' },
    authJsonText: OAUTH_AUTH_JSON,
    codexAppBuiltInAvailable: true
  });
  assert.equal(r.auth_mode, 'chatgpt_oauth');
  assert.equal(r.headless_auto_available, false);
  assert.equal(r.primary_blocker, 'imagegen_model_unavailable');
  assert.deepEqual(r.available_paths, []);
  assert.match(r.next_actions.join(' '), /image_generation.model=gpt-image-2\.5-sunburst/);
});

test('OpenAI key present: headless auto available', async () => {
  const r = await evaluateImagegenAuthReadiness({
    env: { HOME: '/tmp/none', OPENAI_API_KEY: 'sk-test' },
    authJsonText: APIKEY_AUTH_JSON,
    codexAppBuiltInAvailable: false
  });
  assert.equal(r.headless_auto_available, true);
  assert.ok(r.available_paths.includes('openai_api_key_headless'));
  assert.equal(r.primary_blocker, null);
});

test('no key and no Codex App: no usable path with explicit next actions', async () => {
  const r = await evaluateImagegenAuthReadiness({
    env: { HOME: '/tmp/none' },
    authJsonText: OAUTH_AUTH_JSON,
    codexAppBuiltInAvailable: false
  });
  assert.equal(r.headless_auto_available, false);
  assert.equal(r.available_paths.length, 0);
  assert.equal(r.primary_blocker, 'imagegen_no_usable_path');
  assert.ok(r.next_actions.length >= 1);
});
