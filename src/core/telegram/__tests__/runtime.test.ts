import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RemoteSshClientError } from '../../remote/ssh-worker-client.js';
import type {
  RemoteCommandReceiptV1,
  RemoteMachineRegistryV1,
  RemoteSessionIndexV1,
  WorkerRequestV1,
  WorkerResponseV1
} from '../../remote/types.js';
import { TelegramBotApiClient, TelegramBotApiError } from '../bot-api.js';
import { TelegramHubRouter, TelegramPollingHub } from '../hub.js';
import {
  TelegramActionBroker,
  TelegramAuditLedger,
  TelegramIdempotencyLedger,
  TelegramTopicRegistry
} from '../ledgers.js';
import { TelegramMessageProjector } from '../messages.js';
import { TelegramOwnerLock } from '../owner-lock.js';
import { TelegramHubRuntime, type TelegramRemoteWorkerPort } from '../runtime.js';
import type { TelegramBotApiTransport, TelegramHubConfigV1, TelegramUpdate } from '../types.js';

class RecordingApi implements TelegramBotApiTransport {
  readonly calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  private messageId = 100;

  constructor(
    private readonly order: string[],
    private readonly options: { forumUnavailable?: boolean } = {}
  ) {}

  async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, payload });
    this.order.push(`api:${method}`);
    if (method === 'createForumTopic') {
      if (this.options.forumUnavailable) throw new TelegramBotApiError(method, 400, 'topics unavailable');
      return { message_thread_id: 77, name: payload.name } as T;
    }
    this.messageId += 1;
    return { message_id: this.messageId } as T;
  }

  async uploadDocument(input: Parameters<NonNullable<TelegramBotApiTransport['uploadDocument']>>[0]): Promise<{ message_id: number }> {
    this.calls.push({ method: 'sendDocument', payload: { ...input, content: `[${input.content.byteLength} bytes]` } });
    this.order.push('api:sendDocument');
    this.messageId += 1;
    return { message_id: this.messageId };
  }
}

class RecordingWorker implements TelegramRemoteWorkerPort {
  readonly requests: WorkerRequestV1[] = [];

  constructor(
    private readonly order: string[],
    private readonly handler: (request: WorkerRequestV1) => Promise<WorkerResponseV1>
  ) {}

  async request(request: WorkerRequestV1): Promise<WorkerResponseV1> {
    this.requests.push(request);
    this.order.push(`worker:${request.type}`);
    return this.handler(request);
  }

  async close(): Promise<void> {}
}

interface RuntimeFixture {
  root: string;
  config: TelegramHubConfigV1;
  topics: TelegramTopicRegistry;
  actions: TelegramActionBroker;
  auditFile: string;
  actionFile: string;
  api: RecordingApi;
  worker: RecordingWorker;
  runtime: TelegramHubRuntime;
}

async function fixture(options: {
  order?: string[];
  forumUnavailable?: boolean;
  handler?: (request: WorkerRequestV1) => Promise<WorkerResponseV1>;
} = {}): Promise<RuntimeFixture> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-runtime-'));
  const order = options.order ?? [];
  const config: TelegramHubConfigV1 = {
    schema: 'sks.telegram-config.v1',
    bot_token_ref: { type: 'external_file', path: path.join(root, 'token') },
    paired_chat_ids: ['1'],
    paired_user_ids: ['2']
  };
  const topics = new TelegramTopicRegistry(path.join(root, 'topics.json'));
  const actionFile = path.join(root, 'actions.json');
  const auditFile = path.join(root, 'audit.jsonl');
  const actions = new TelegramActionBroker(actionFile);
  const audit = new TelegramAuditLedger(auditFile, 'fixture-salt');
  const router = new TelegramHubRouter({
    config,
    topics,
    idempotency: new TelegramIdempotencyLedger(path.join(root, 'updates.jsonl')),
    actions,
    audit
  });
  const api = new RecordingApi(order, options.forumUnavailable ? { forumUnavailable: true } : {});
  const projector = new TelegramMessageProjector(api, {
    rich_message: true,
    rich_draft: true,
    plain_draft: true,
    reactions: true
  }, { sleep: async () => undefined });
  const worker = new RecordingWorker(order, options.handler ?? (async (request) => ok(request, {})));
  const machineRegistry: RemoteMachineRegistryV1 = {
    schema: 'sks.remote-machines.v1',
    machines: [{
      id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac',
      allowed_roots: ['/Users/example/src'], enabled: true
    }]
  };
  const sessionIndex: RemoteSessionIndexV1 = {
    schema: 'sks.remote-session-index.v1',
    targets: [{ machine_id: 'mac', project_id: 'repo', project_root: '/Users/example/src/repo' }]
  };
  const runtime = new TelegramHubRuntime({
    config,
    router,
    topics,
    actions,
    audit,
    projector,
    machineRegistry,
    sessionIndex,
    projectionStatePath: path.join(root, 'projection.json'),
    clientFactory: () => worker
  });
  return { root, config, topics, actions, auditFile, actionFile, api, worker, runtime };
}

async function addRoute(topics: TelegramTopicRegistry, threadId = 10) {
  return topics.upsert({
    machine_id: 'mac', project_id: 'repo', session_id: 'S1', chat_id: '1',
    message_thread_id: threadId, pinned_message_id: null
  });
}

test('production poller sends a routed Telegram command to the remote worker and advances watch projection', async () => {
  const fx = await fixture({
    handler: async (request) => request.type === 'watch'
      ? ok(request, { cursor: { next_after_seq: 0 }, events: [] })
      : ok(request, snapshot())
  });
  await addRoute(fx.topics);
  const owner = new TelegramOwnerLock({
    lockPath: path.join(fx.root, 'owner.lock'), tokenFingerprint: 'sha256:fixture'
  });
  await owner.acquire();
  const update = messageUpdate(1, 10, '/status');
  const client = new TelegramBotApiClient('123456789:ABCDEFGHIJKLMNOPQRSTUVWX', {
    fetch: async () => new Response(JSON.stringify({ ok: true, result: [update] }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  });
  const result = await new TelegramPollingHub(client, fx.runtime, owner, 1).pollOnce();
  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  const command = fx.worker.requests.find((request): request is Extract<WorkerRequestV1, { type: 'command' }> => request.type === 'command');
  assert.equal(command?.envelope.kind, 'read');
  assert.deepEqual(command?.envelope.payload, { view: 'status' });
  assert.ok(fx.worker.requests.some((request) => request.type === 'watch'));
  await owner.release();
  await fx.runtime.close();
});

test('a single private-chat session accepts ordinary text without a topic and returns Codex final output', async () => {
  const fx = await fixture({
    handler: async (request) => request.type === 'command'
      ? ok(request, {
          accepted: true,
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          final_response: 'The requested coding change is complete and the focused tests passed.'
        }, receipt(request, {
          accepted: true,
          final_response: 'The requested coding change is complete and the focused tests passed.'
        }))
      : ok(request, {})
  });
  await addRoute(fx.topics, 0);
  const routed = await fx.runtime.processUpdate(messageUpdate(1, undefined, 'Please fix the failing parser test.'));
  assert.equal(routed.ok, true);
  const command = fx.worker.requests.find((request): request is Extract<WorkerRequestV1, { type: 'command' }> => request.type === 'command');
  assert.equal(command?.envelope.kind, 'input');
  assert.equal(command?.envelope.session_id, 'S1');
  const final = fx.api.calls.find((call) => call.method === 'sendRichMessage');
  assert.match(
    String((final?.payload.rich_message as { markdown?: string } | undefined)?.markdown),
    /requested coding change is complete/
  );
});

test('callback acknowledgement precedes owner-proof cancel dispatch and the ActionBroker resolves once', async () => {
  const order: string[] = [];
  const fx = await fixture({
    order,
    handler: async (request) => {
      if (request.type === 'prepare_cancel') {
        return ok(request, {
          schema: 'sks.remote-cancel-challenge.v1', command_id: request.command_id, session_id: request.session_id,
          owner_nonce: 'owner-nonce', expected_pid: 42, expected_process_start_time: 'start',
          expected_command: 'codex exec', expected_project_root: '/Users/example/src/repo', expected_generation: 3
        });
      }
      if (request.type === 'command') return ok(request, { cancelled: true }, receipt(request, { cancelled: true }));
      return ok(request, {});
    }
  });
  await addRoute(fx.topics);
  const approval = await fx.runtime.processUpdate(messageUpdate(1, 10, '/cancel'));
  assert.equal(approval.status, 'approval_required');
  const callbackData = inlineCallback(fx.api.calls);
  order.length = 0;
  const claimed = await fx.runtime.processUpdate(callbackUpdate(2, callbackData, 10));
  assert.equal(claimed.status, 'claimed');
  assert.ok(order.indexOf('api:answerCallbackQuery') >= 0);
  assert.ok(order.indexOf('api:answerCallbackQuery') < order.indexOf('worker:prepare_cancel'));
  assert.ok(order.indexOf('worker:prepare_cancel') < order.indexOf('worker:command'));
  const command = fx.worker.requests.find((request): request is Extract<WorkerRequestV1, { type: 'command' }> => request.type === 'command');
  assert.equal(command?.envelope.kind, 'cancel');
  assert.equal((command?.envelope.payload.approval as { command_id?: string }).command_id, command?.envelope.command_id);
  const ledger = JSON.parse(await fsp.readFile(fx.actionFile, 'utf8')) as { actions: Array<{ status: string }> };
  assert.equal(ledger.actions[0]?.status, 'resolved');
  await fx.runtime.close();
});

test('flat chat picker aliases resolve to the exact session topic without guessing', async () => {
  const fx = await fixture();
  await addRoute(fx.topics);
  const picker = await fx.runtime.processUpdate(messageUpdate(1, undefined, '/status'));
  assert.equal(picker.session_picker, true);
  const callbackData = inlineCallback(fx.api.calls);
  const selected = await fx.runtime.processUpdate(callbackUpdate(2, callbackData, undefined));
  assert.equal(selected.status, 'claimed');
  assert.equal(fx.worker.requests.length, 0);
  const topicFinal = fx.api.calls.find((call) => call.method === 'sendRichMessage' && call.payload.message_thread_id === 10);
  assert.ok(topicFinal);
  const ledger = JSON.parse(await fsp.readFile(fx.actionFile, 'utf8')) as { actions: Array<{ status: string }> };
  assert.equal(ledger.actions[0]?.status, 'resolved');
});

test('delivery_unknown is surfaced as blocked and never automatically replayed', async () => {
  const fx = await fixture({
    handler: async () => { throw new RemoteSshClientError('delivery_unknown', 'unknown', false); }
  });
  await addRoute(fx.topics);
  await fx.runtime.processUpdate(messageUpdate(1, 10, '/status'));
  assert.equal(fx.worker.requests.length, 1);
  const final = fx.api.calls.find((call) => call.method === 'sendRichMessage');
  assert.match(String((final?.payload.rich_message as { markdown?: string } | undefined)?.markdown), /delivery_unknown:unknown/);
  assert.match(await fsp.readFile(fx.auditFile, 'utf8'), /delivery_unknown:unknown/);
});

test('artifacts command delivers a bounded document manifest through the production runtime', async () => {
  const fx = await fixture({ handler: async (request) => request.type === 'command'
    ? ok(request, { requested_view: 'artifacts', artifacts: ['completion-proof.json', 'trust-report.json'] }, receipt(request, { artifacts: ['completion-proof.json', 'trust-report.json'] }))
    : ok(request, {}) });
  await addRoute(fx.topics);
  await fx.runtime.processUpdate(messageUpdate(1, 10, '/artifacts'));
  const upload = fx.api.calls.find((call) => call.method === 'sendDocument');
  assert.ok(upload);
  assert.equal(upload?.payload.filename, 'sks-artifacts-S1.json');
  assert.equal(upload?.payload.message_thread_id, 10);
});

test('session sync creates a topic, pinned card, draft, and persistent verified final', async () => {
  const fx = await fixture({
    handler: async (request) => {
      if (request.type === 'list_sessions') return ok(request, { sessions: [{ session_id: 'S1' }] });
      if (request.type === 'read_snapshot') return ok(request, snapshot({ completion_verified: true }));
      return ok(request, {});
    }
  });
  const result = await fx.runtime.initialize();
  assert.deepEqual(result, { ok: true, targets: 1, sessions: 1, warnings: [] });
  const methods = fx.api.calls.map((call) => call.method);
  assert.ok(methods.includes('createForumTopic'));
  assert.ok(methods.includes('pinChatMessage'));
  assert.ok(methods.includes('sendRichMessageDraft'));
  assert.ok(methods.filter((method) => method === 'sendRichMessage').length >= 2);
  const route = await fx.topics.findBySession('mac', 'repo', 'S1');
  assert.equal(route?.message_thread_id, 77);
  assert.ok(route?.pinned_message_id);
});

test('session sync falls back to flat private chat when forum topics are unavailable', async () => {
  const fx = await fixture({
    forumUnavailable: true,
    handler: async (request) => {
      if (request.type === 'list_sessions') return ok(request, { sessions: [{ session_id: 'S1' }] });
      if (request.type === 'read_snapshot') return ok(request, snapshot());
      return ok(request, {});
    }
  });
  const result = await fx.runtime.initialize();
  assert.equal(result.ok, false);
  assert.ok(result.warnings.includes('private_topics_unavailable_flat_fallback:mac:repo'));
  assert.equal((await fx.topics.findBySession('mac', 'repo', 'S1'))?.message_thread_id, 0);
  assert.ok(fx.api.calls.some((call) => call.method === 'sendRichMessage' && call.payload.message_thread_id === undefined));
});

test('session sync exposes only the dedicated Telegram thread when legacy SKS sessions also exist', async () => {
  const fx = await fixture({
    forumUnavailable: true,
    handler: async (request) => {
      if (request.type === 'list_sessions') {
        return ok(request, {
          sessions: [
            { session_id: 'telegram-session', dedicated_telegram_thread: true },
            { session_id: 'legacy-mission', route: 'Naruto', phase: 'IMPLEMENT' }
          ]
        });
      }
      if (request.type === 'read_snapshot') {
        return ok(request, snapshot({ session_id: request.session_id }));
      }
      return ok(request, {});
    }
  });

  const result = await fx.runtime.initialize();

  assert.equal(result.sessions, 1);
  assert.deepEqual((await fx.topics.list()).map((route) => route.session_id), ['telegram-session']);
});

function ok(request: WorkerRequestV1, data: unknown, commandReceipt?: RemoteCommandReceiptV1): WorkerResponseV1 {
  return {
    schema: 'sks.remote-worker.response.v1', id: request.id, type: request.type, ok: true, data,
    ...(commandReceipt ? { receipt: commandReceipt } : {})
  };
}

function receipt(request: Extract<WorkerRequestV1, { type: 'command' }>, result: unknown): RemoteCommandReceiptV1 {
  return {
    schema: 'sks.remote-command-receipt.v1',
    command_id: request.envelope.command_id,
    idempotency_key: request.envelope.idempotency_key,
    machine_id: request.envelope.machine_id,
    project_id: request.envelope.project_id,
    session_id: request.envelope.session_id,
    kind: request.envelope.kind,
    status: 'completed',
    side_effect_applied: true,
    completed_at: new Date().toISOString(),
    result
  };
}

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'sks.remote-session-snapshot.v1', machine_id: 'mac', project_id: 'repo', session_id: 'S1',
    project: { name: 'repo', branch: 'release/6.3.0' }, session_state: 'active', phase: 'IMPLEMENT',
    route: 'Naruto', completion_proof_status: 'not_verified', machine_gates_status: 'not_recorded',
    machine_gates_pass: false, trust_status: 'not_verified', completion_verified: false,
    ...overrides
  };
}

function inlineCallback(calls: Array<{ method: string; payload: Record<string, unknown> }>): string {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index]!;
    const markup = call.payload.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> } | undefined;
    const callback = markup?.inline_keyboard?.[0]?.[0]?.callback_data;
    if (callback?.startsWith('cb:')) return callback;
  }
  throw new Error('callback alias not found');
}

function messageUpdate(updateId: number, topicId: number | undefined, text: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId, chat: { id: '1', type: 'private' }, from: { id: '2' },
      ...(topicId === undefined ? {} : { message_thread_id: topicId }), text
    }
  };
}

function callbackUpdate(updateId: number, data: string, topicId: number | undefined): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`, from: { id: '2' }, data,
      message: {
        message_id: updateId, chat: { id: '1', type: 'private' },
        ...(topicId === undefined ? {} : { message_thread_id: topicId })
      }
    }
  };
}
