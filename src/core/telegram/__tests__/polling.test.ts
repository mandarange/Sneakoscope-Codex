import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TelegramBotApiClient } from '../bot-api.js';
import { TelegramPollingHub } from '../hub.js';
import { TelegramOwnerLock } from '../owner-lock.js';

async function tempRoot(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-poll-'));
}

test('poller stops immediately on Telegram 409 and releases owner lock', async () => {
  const root = await tempRoot();
  const lockPath = path.join(root, 'owner.lock');
  const owner = new TelegramOwnerLock({ lockPath, tokenFingerprint: 'sha256:one' });
  await owner.acquire();
  const client = new TelegramBotApiClient('123456789:ABCDEFGHIJKLMNOPQRSTUVWX', {
    fetch: async () => new Response(JSON.stringify({ ok: false, error_code: 409, description: 'Conflict' }), { status: 409, headers: { 'content-type': 'application/json' } })
  });
  const polling = new TelegramPollingHub(client, { handleUpdate: async () => ({}) } as never, owner, 1);
  const result = await polling.pollOnce();
  assert.equal(result.stopped_reason, 'telegram_409_conflict');
  assert.equal(await fsp.stat(lockPath).then(() => true).catch(() => false), false);
});

test('long polling fails closed while a webhook is configured', async () => {
  const root = await tempRoot();
  const owner = new TelegramOwnerLock({ lockPath: path.join(root, 'owner.lock'), tokenFingerprint: 'sha256:one' });
  const client = new TelegramBotApiClient('123456789:ABCDEFGHIJKLMNOPQRSTUVWX', {
    fetch: async () => new Response(JSON.stringify({ ok: true, result: { url: 'https://example.test/hook' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const polling = new TelegramPollingHub(client, { handleUpdate: async () => ({}) } as never, owner, 1);
  await assert.rejects(polling.ensureLongPollingAllowed(), /webhook_conflict/);
});
