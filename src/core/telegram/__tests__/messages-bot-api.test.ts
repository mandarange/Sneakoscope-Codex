import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramBotApiClient, TelegramBotApiError } from '../bot-api.js';
import { publicSafeText, REACTIONS, TelegramMessageProjector } from '../messages.js';
import type { TelegramBotApiTransport, TelegramTopicRouteV1 } from '../types.js';

class FakeApi implements TelegramBotApiTransport {
  readonly calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, payload });
    if (method === 'createForumTopic') return { message_thread_id: 77, name: payload.name } as T;
    return { message_id: this.calls.length } as T;
  }
}

const route: TelegramTopicRouteV1 = {
  schema: 'sks.telegram-topic-route.v1', machine_id: 'mac', project_id: 'repo', session_id: 'S1',
  chat_id: '1', message_thread_id: 10, pinned_message_id: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), generation: 1
};

test('draft streaming prefers rich, deduplicates, throttles to two updates/sec, and sends a persistent final', async () => {
  const api = new FakeApi();
  let now = 1_000;
  const sleeps: number[] = [];
  const projector = new TelegramMessageProjector(api, { rich_message: true, rich_draft: true, plain_draft: true, reactions: true }, {
    now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    protectContent: true,
    silent: true
  });
  const first = await projector.streamDraft({ route, publicPhase: 'Running tests', text: 'hello' });
  assert.equal(first.method, 'sendRichMessageDraft');
  const duplicate = await projector.streamDraft({ route, publicPhase: 'Running tests', text: 'hello' });
  assert.equal(duplicate.skipped, true);
  now += 100;
  await projector.streamDraft({ route, publicPhase: 'Running tests', text: 'hello 2' });
  assert.deepEqual(sleeps, [400]);
  const final = await projector.sendFinal({ route, text: 'done' });
  assert.equal(final.method, 'sendRichMessage');
  assert.equal(api.calls.at(-1)?.method, 'sendRichMessage');
});

test('plain/edit fallback, pinned card, ForceReply, reactions, and redaction are bounded', async () => {
  const api = new FakeApi();
  const projector = new TelegramMessageProjector(api, { rich_message: false, rich_draft: false, plain_draft: true, reactions: true });
  assert.equal((await projector.streamDraft({ route, publicPhase: 'phase', text: 'plain' })).method, 'sendMessageDraft');
  const editApi = new FakeApi();
  const editProjector = new TelegramMessageProjector(editApi, { rich_message: false, rich_draft: false, plain_draft: false, reactions: false });
  assert.equal((await editProjector.streamDraft({ route, publicPhase: 'phase', text: 'edit', existingMessageId: 42 })).method, 'editMessageText');
  assert.equal((await projector.createSessionTopic('1', 'mac · repo/main · task')).message_thread_id, 77);
  const pin = await projector.upsertPinnedCard({
    route,
    card: {
      machine: 'mac', project: 'repo', branch: 'main', state: 'Running', route: 'Naruto', model: 'Sol', gate: '1/2', trust: 'Pending', changed: '1 file', last_event: 'test',
      checks: { build: true, focused_tests: true, full_release: false, npm_pack: false }, latest_public_activity: 'safe'
    }
  });
  assert.equal(pin.pinned, true);
  assert.ok(api.calls.some((call) => call.method === 'pinChatMessage'));
  await projector.upsertPinnedCard({
    route: { ...route, pinned_message_id: pin.message_id },
    card: {
      machine: 'mac', project: 'repo', branch: 'main', state: 'Verified', route: 'Naruto', model: 'Sol', gate: '2/2', trust: 'Verified', changed: '1 file', last_event: 'pass',
      checks: { build: true, focused_tests: true, full_release: true, npm_pack: false }, latest_public_activity: 'verified'
    }
  });
  assert.ok(api.calls.some((call) => call.method === 'editMessageText' && call.payload.message_id === pin.message_id));
  const replyId = await projector.requestInput({ route, prompt: 'Reply', placeholder: 'Type input' });
  assert.ok(replyId > 0);
  const forceReplyCall = api.calls.find((call) => (call.payload.reply_markup as { force_reply?: boolean } | undefined)?.force_reply);
  assert.equal((forceReplyCall?.payload.reply_markup as { force_reply: boolean }).force_reply, true);
  await projector.setReaction(route, 3, 'verified');
  assert.equal(REACTIONS.verified, '✅');
  assert.ok(api.calls.some((call) => call.method === 'setMessageReaction'));
  await projector.answerCallbackQuery('cbq-1', 'Already resolved');
  assert.ok(api.calls.some((call) => call.method === 'answerCallbackQuery'));
  assert.ok(!publicSafeText('token=abcdefghijklmnop /Users/me/private').includes('abcdefghijklmnop'));
  assert.ok(!publicSafeText('123456789:ABCDEFGHIJKLMNOPQRSTUVWX').includes('ABCDEFGHIJKLMNOPQRSTUVWX'));
  assert.ok(!publicSafeText('/Users/me/private').includes('/Users/me/private'));
  assert.ok(!publicSafeText('<tg-thinking>secret chain</tg-thinking> public').includes('secret chain'));
});

test('Bot API retries 429, exposes 409 as an immediate typed stop, and never leaks the token', async () => {
  const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWX';
  const responses = [
    new Response(JSON.stringify({ ok: false, error_code: 429, description: 'retry', parameters: { retry_after: 1 } }), { status: 429, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  ];
  const sleeps: number[] = [];
  const client = new TelegramBotApiClient(token, { fetch: async () => responses.shift()!, sleep: async (ms) => { sleeps.push(ms); } });
  assert.deepEqual(await client.getUpdates(), []);
  assert.deepEqual(sleeps, [1_000]);

  const conflict = new TelegramBotApiClient(token, {
    fetch: async () => new Response(JSON.stringify({ ok: false, error_code: 409, description: `Conflict for ${token}` }), { status: 409, headers: { 'content-type': 'application/json' } })
  });
  await assert.rejects(conflict.getUpdates(), (error: unknown) => {
    assert.ok(error instanceof TelegramBotApiError);
    assert.equal(error.errorCode, 409);
    assert.ok(!error.message.includes(token));
    return true;
  });
});
