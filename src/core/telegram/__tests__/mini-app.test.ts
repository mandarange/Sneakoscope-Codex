import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateMiniAppDefaultOnGate,
  FileMiniAppReplayStore,
  InMemoryMiniAppReplayStore,
  MINI_APP_SCREENS,
  validateMiniAppRequest
} from '../mini-app.js';

const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWX';

test('Mini App validates initData, freshness, allowlists, live challenge, exact scope, CSRF, and replay', async () => {
  const now = Date.now();
  const initData = signedInitData({
    auth_date: String(Math.floor(now / 1000)),
    query_id: 'Q1',
    user: JSON.stringify({ id: 2 }),
    chat: JSON.stringify({ id: 1 })
  });
  const challenge = {
    nonce: 'nonce-1', revision: 4, csrf_token: 'csrf-1', exact_action_scope: ['mac', 'repo', 'S1'],
    expires_at: new Date(now + 60_000).toISOString()
  };
  const replayStore = new InMemoryMiniAppReplayStore();
  const request = {
    initData, nonce: 'nonce-1', revision: 4, csrf_token: 'csrf-1', exact_action_scope: ['mac', 'repo', 'S1'], biometric_user_presence: true
  };
  const valid = await validateMiniAppRequest(request, { botToken: token, allowedUserIds: ['2'], allowedChatIds: ['1'], challenge, replayStore, now });
  assert.equal(valid.ok, true, valid.issues.join(', '));
  assert.equal(valid.biometric_user_presence, true);
  const replay = await validateMiniAppRequest(request, { botToken: token, allowedUserIds: ['2'], allowedChatIds: ['1'], challenge, replayStore, now });
  assert.equal(replay.ok, false);
  assert.ok(replay.issues.includes('query_id_replay'));
});

test('Mini App rejects initDataUnsafe, forged signatures, stale auth, and biometric-only authorization', async () => {
  const now = Date.now();
  const result = await validateMiniAppRequest({
    initData: 'auth_date=1&query_id=Q&user=%7B%22id%22%3A2%7D&hash=bad',
    initDataUnsafe: { user: { id: 2 } },
    nonce: 'wrong', revision: 1, csrf_token: 'wrong', exact_action_scope: [], biometric_user_presence: true
  }, {
    botToken: token,
    allowedUserIds: ['2'], allowedChatIds: ['1'],
    challenge: { nonce: 'n', revision: 2, csrf_token: 'c', exact_action_scope: ['x'], expires_at: new Date(now + 60_000).toISOString() },
    replayStore: new InMemoryMiniAppReplayStore(), now
  });
  assert.equal(result.ok, false);
  for (const expected of ['init_data_unsafe_ignored', 'init_data_signature_invalid', 'auth_date_stale', 'nonce_mismatch', 'revision_mismatch', 'csrf_mismatch', 'action_scope_mismatch']) {
    assert.ok(result.issues.includes(expected), expected);
  }
});

test('Mini App remains labs/default-off until every required gate is true', () => {
  const all = {
    init_data_validation_tests: true,
    replay_tests: true,
    r2_challenge_tests: true,
    mobile_safe_area_tests: true,
    ios_android_real_smoke: true,
    diff_virtualization_performance: true,
    no_raw_secret_path_leak: true,
    topic_ux_when_disabled: true
  };
  assert.equal(evaluateMiniAppDefaultOnGate(all).mode, 'default_on');
  assert.equal(evaluateMiniAppDefaultOnGate({ ...all, ios_android_real_smoke: false }).mode, 'labs_default_off');
  assert.equal(evaluateMiniAppDefaultOnGate({ ...all, ios_android_real_smoke: false }).cookie_policy, 'no_cookie');
  assert.deepEqual(MINI_APP_SCREENS, ['Fleet', 'Machines', 'Projects', 'Sessions', 'Live Activity', 'Diff', 'Evidence', 'Gates', 'Trust', 'Approval Inbox', 'Artifacts', 'Security']);
});

test('Mini App file replay ledger is durable across instances', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mini-replay-'));
  const file = path.join(root, 'replay.json');
  const expiry = new Date(Date.now() + 60_000).toISOString();
  assert.equal(await new FileMiniAppReplayStore(file).consume('Q:nonce:1', expiry), true);
  assert.equal(await new FileMiniAppReplayStore(file).consume('Q:nonce:1', expiry), false);
});

function signedInitData(values: Record<string, string>): string {
  const params = new URLSearchParams(values);
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}
