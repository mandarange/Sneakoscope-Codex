import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildTelegramTopicName,
  TelegramActionBroker,
  TelegramAuditLedger,
  TelegramIdempotencyLedger,
  TelegramTopicRegistry
} from '../ledgers.js';
import { authorizeTelegramAction, TelegramHubRouter } from '../hub.js';
import type { RemoteActionV1, TelegramHubConfigV1, TelegramUpdate } from '../types.js';

async function tempRoot(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-ledger-'));
}

function action(risk: RemoteActionV1['risk'] = 'R2'): RemoteActionV1 {
  return {
    schema: 'sks.remote-action.v1', action_id: crypto.randomUUID(), machine_id: 'mac', project_id: 'repo', session_id: 'S1',
    kind: 'cancel', risk, prompt: 'cancel', exact_scope: ['mac', 'repo', 'S1'],
    expires_at: new Date(Date.now() + 60_000).toISOString(), revision: 1, status: 'open'
  };
}

test('topic registry supports multi-session routes, collision handling, and bounded names', async () => {
  const root = await tempRoot();
  const registry = new TelegramTopicRegistry(path.join(root, 'topics.json'));
  const first = await registry.upsert({ machine_id: 'mac', project_id: 'repo', session_id: 'S1', chat_id: '1', message_thread_id: 10, pinned_message_id: null });
  const second = await registry.upsert({ machine_id: 'mac', project_id: 'repo', session_id: 'S2', chat_id: '1', message_thread_id: 11, pinned_message_id: null });
  assert.equal((await registry.list()).length, 2);
  assert.equal(first.generation, 1);
  assert.equal(second.session_id, 'S2');
  await assert.rejects(
    registry.upsert({ machine_id: 'mac2', project_id: 'repo', session_id: 'S3', chat_id: '1', message_thread_id: 10, pinned_message_id: null }),
    /topic_collision/
  );
  const name = buildTelegramTopicName({ machine: 'mac', repo: 'repo', branch: 'main', title: 'x'.repeat(200) }, [], 64);
  assert.ok(name.length <= 64);
  assert.notEqual(buildTelegramTopicName({ machine: 'mac', repo: 'repo', branch: 'main', title: 'x'.repeat(200) }, [name], 64), name);
});

test('idempotency and callback ledgers reject duplicate, replay, wrong topic, expiry, and R3', async () => {
  const root = await tempRoot();
  const idempotency = new TelegramIdempotencyLedger(path.join(root, 'updates.jsonl'));
  assert.equal(await idempotency.claim(1), true);
  assert.equal(await idempotency.claim(1), false);
  const broker = new TelegramActionBroker(path.join(root, 'actions.json'));
  const created = await broker.create(action(), { chat_id: '1', message_thread_id: 10 });
  assert.ok(Buffer.byteLength(created.callback_data) <= 64);
  assert.match(created.callback_data, /^cb:[A-Za-z0-9_-]+$/);
  const wrong = await broker.resolve({ callback_data: created.callback_data, chat_id: '1', message_thread_id: 11, revision: 1 });
  assert.equal(wrong.status, 'wrong_topic');
  const claimed = await broker.resolve({ callback_data: created.callback_data, chat_id: '1', message_thread_id: 10, revision: 1 });
  assert.equal(claimed.status, 'claimed');
  const replay = await broker.resolve({ callback_data: created.callback_data, chat_id: '1', message_thread_id: 10, revision: 1 });
  assert.equal(replay.status, 'already_resolved');
  const expiredAction = action();
  expiredAction.expires_at = new Date(Date.now() - 1).toISOString();
  const expiredCreated = await broker.create(expiredAction, { chat_id: '1', message_thread_id: 10 });
  assert.equal((await broker.resolve({ callback_data: expiredCreated.callback_data, chat_id: '1', message_thread_id: 10, revision: 1 })).status, 'expired');
  await assert.rejects(broker.create(action('R3'), { chat_id: '1', message_thread_id: 10 }), /r3_always_denied/);
});

test('hub rejects unpaired users before parsing, uses session picker for flat chat, and routes typed topic actions', async () => {
  const root = await tempRoot();
  const topics = new TelegramTopicRegistry(path.join(root, 'topics.json'));
  await topics.upsert({ machine_id: 'mac', project_id: 'repo', session_id: 'S1', chat_id: '1', message_thread_id: 10, pinned_message_id: null });
  const config: TelegramHubConfigV1 = {
    schema: 'sks.telegram-config.v1', bot_token_ref: { type: 'external_file', path: '/tmp/token' },
    paired_chat_ids: ['1'], paired_user_ids: ['2']
  };
  const router = new TelegramHubRouter({
    config,
    topics,
    idempotency: new TelegramIdempotencyLedger(path.join(root, 'updates.jsonl')),
    actions: new TelegramActionBroker(path.join(root, 'actions.json')),
    audit: new TelegramAuditLedger(path.join(root, 'audit.jsonl'), 'salt'),
    now: () => Date.now()
  });

  const unpaired = await router.handleUpdate(messageUpdate(1, '1', '999', 10, '/cancel /Users/me/secret'));
  assert.equal(unpaired.status, 'not_paired');
  const audit = await fsp.readFile(path.join(root, 'audit.jsonl'), 'utf8');
  assert.ok(!audit.includes('/Users/me/secret'));
  assert.ok(!audit.includes('"chat_id":"1"'));

  const flat = await router.handleUpdate(messageUpdate(2, '1', '2', undefined, '/status'));
  assert.equal(flat.session_picker, true);
  const wrongTopic = await router.handleUpdate(messageUpdate(3, '1', '2', 99, '/status'));
  assert.equal(wrongTopic.status, 'wrong_topic');
  const read = await router.handleUpdate(messageUpdate(4, '1', '2', 10, '/status'));
  assert.equal(read.action?.risk, 'R0');
  const input = await router.handleUpdate(messageUpdate(5, '1', '2', 10, 'continue with tests'));
  assert.equal(input.action?.kind, 'input');
  assert.equal(input.action?.risk, 'R1');
  const forceReplyUpdate = messageUpdate(51, '1', '2', 10, 'approved input');
  forceReplyUpdate.message!.reply_to_message = { message_id: 500 };
  assert.equal((await router.handleUpdate(forceReplyUpdate)).action?.kind, 'input');
  const cancel = await router.handleUpdate(messageUpdate(6, '1', '2', 10, '/cancel'));
  assert.equal(cancel.status, 'approval_required');
  assert.ok(cancel.callback_data);
  const callback = await router.handleUpdate(callbackUpdate(7, '1', '2', 10, cancel.callback_data!));
  assert.equal(callback.status, 'claimed');
  const callbackReplay = await router.handleUpdate(callbackUpdate(8, '1', '2', 10, cancel.callback_data!));
  assert.equal(callbackReplay.status, 'already_resolved');
  assert.equal((await router.handleUpdate(messageUpdate(8, '1', '2', 10, '/status'))).status, 'duplicate_update_id');
  assert.equal(authorizeTelegramAction('R3', { exactTopic: true, explicitUserMessage: true }).ok, false);
  assert.equal(authorizeTelegramAction('R2', { exactTopic: true, explicitUserMessage: true }).ok, false);
  assert.equal(authorizeTelegramAction('R2', { exactTopic: true, explicitUserMessage: true, oneTimeApproval: true }).ok, true);
});

function messageUpdate(updateId: number, chatId: string, userId: string, topicId: number | undefined, text: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type: 'private' },
      from: { id: userId },
      ...(topicId === undefined ? {} : { message_thread_id: topicId }),
      text
    }
  };
}

function callbackUpdate(updateId: number, chatId: string, userId: string, topicId: number, data: string): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId), from: { id: userId }, data,
      message: { message_id: updateId, chat: { id: chatId, type: 'private' }, message_thread_id: topicId }
    }
  };
}
