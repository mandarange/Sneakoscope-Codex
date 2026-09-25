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

test('Codex built-in image tool under ChatGPT OAuth is a usable path; SKS pins no engine', async () => {
  const r = await evaluateImagegenAuthReadiness({
    env: { HOME: '/tmp/none' },
    authJsonText: OAUTH_AUTH_JSON,
    codexAppBuiltInAvailable: true
  });
  assert.equal(r.auth_mode, 'chatgpt_oauth');
  assert.deepEqual(r.available_paths, ['codex_exec_builtin_image_generation']);
  assert.equal(r.primary_blocker, null);
  assert.deepEqual(r.next_actions, []);
});

test('the custom image model and the Codex bridge route come before the built-in tool and the API key', async () => {
  const r = await evaluateImagegenAuthReadiness({
    env: { HOME: '/tmp/none', OPENAI_API_KEY: 'sk-test' },
    authJsonText: OAUTH_AUTH_JSON,
    codexAppBuiltInAvailable: true,
    codexBridgeRouteAvailable: true,
    customModelReady: true
  });
  assert.deepEqual(r.available_paths, [
    'sks_custom_openrouter_image_model',
    'codex_bridge_route_image_generation',
    'codex_exec_builtin_image_generation',
    'openai_api_key_headless'
  ]);
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
