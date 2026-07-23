import {
  REMOTE_COMMAND_SCHEMA,
  REMOTE_R2_APPROVAL_SCHEMA,
  REMOTE_WORKER_REQUEST_SCHEMA,
  RemoteLocalWorkerClient,
  RemoteSshClientError,
  RemoteSshWorkerClient,
  findRemoteMachine,
  findRemoteSessionTarget,
  type RemoteCommandEnvelopeV1,
  type RemoteMachineRegistryV1,
  type RemoteSessionIndexV1,
  type RemoteSessionTargetV1,
  type WorkerRequestV1,
  type WorkerResponseV1
} from '../remote/index.js';
import { nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import { TelegramActionBroker, TelegramAuditLedger, TelegramTopicRegistry } from './ledgers.js';
import { TelegramBotApiError } from './bot-api.js';
import { TelegramHubRouter, type TelegramHubRouteResult, type TelegramUpdateProcessor } from './hub.js';
import { TelegramMessageProjector, publicSafeText } from './messages.js';
import {
  asRecord,
  boundedIdentifier,
  cardFromSnapshot,
  commandView,
  emptyProjection,
  pickerAction,
  requestId,
  routeKey,
  snapshotSummary,
  successSummary,
  topicName,
  type ProjectionStateV1
} from './runtime-projection.js';
import type { RemoteActionV1, TelegramHubConfigV1, TelegramTopicRouteV1, TelegramUpdate } from './types.js';

export interface TelegramRemoteWorkerPort {
  request(request: WorkerRequestV1): Promise<WorkerResponseV1>;
  close(): Promise<void>;
}

export interface TelegramHubRuntimeOptions {
  config: TelegramHubConfigV1;
  router: TelegramHubRouter;
  topics: TelegramTopicRegistry;
  actions: TelegramActionBroker;
  audit: TelegramAuditLedger;
  projector: TelegramMessageProjector;
  machineRegistry: RemoteMachineRegistryV1;
  sessionIndex: RemoteSessionIndexV1;
  projectionStatePath: string;
  clientFactory?: (target: RemoteSessionTargetV1) => TelegramRemoteWorkerPort;
  now?: () => number;
}

export class TelegramHubRuntime implements TelegramUpdateProcessor {
  private readonly clients = new Map<string, TelegramRemoteWorkerPort>();
  private readonly now: () => number;

  constructor(private readonly options: TelegramHubRuntimeOptions) {
    this.now = options.now ?? Date.now;
  }

  async initialize(): Promise<{ ok: boolean; targets: number; sessions: number; warnings: string[] }> {
    return this.syncSessions();
  }

  async processUpdate(update: TelegramUpdate): Promise<TelegramHubRouteResult> {
    const routed = await this.options.router.handleUpdate(update);
    await this.acknowledgeCallback(update, routed);
    try {
      if (routed.session_picker) await this.sendSessionPicker(update);
      else if (routed.ok && routed.action) await this.executeRoutedAction(update, routed);
    } catch (error: unknown) {
      await this.reportEffectFailure(update, routed.action, error);
    }
    return routed;
  }

  async tick(): Promise<void> {
    const routes = await this.options.topics.list();
    if (!routes.length) return;
    const state = await this.readProjectionState();
    let changed = false;
    for (const route of routes) {
      try {
        const key = routeKey(route);
        const row = state.sessions[key] ?? emptyProjection();
        state.sessions[key] = row;
        const response = await this.clientForRoute(route).request({
          schema: REMOTE_WORKER_REQUEST_SCHEMA,
          id: requestId('watch'),
          type: 'watch',
          after_seq: row.after_seq,
          session_id: route.session_id
        });
        if (!response.ok) {
          const cursor = asRecord(response.error?.details?.cursor);
          if (response.error?.code === 'event_cursor_gap' && Number.isSafeInteger(Number(cursor?.last_available_seq))) {
            row.after_seq = Number(cursor?.last_available_seq);
            state.sessions[key] = row;
            changed = true;
          }
          continue;
        }
        const data = asRecord(response.data);
        const cursor = asRecord(data?.cursor);
        const nextAfter = Number(cursor?.next_after_seq);
        if (Number.isSafeInteger(nextAfter) && nextAfter >= row.after_seq && nextAfter !== row.after_seq) {
          row.after_seq = nextAfter;
          changed = true;
        }
        const snapshot = asRecord(data?.snapshot);
        if (snapshot) changed = await this.projectSnapshot(route, snapshot, state) || changed;
      } catch {
        // A disconnected Mac is a fleet warning, not a Telegram polling failure.
      }
    }
    if (changed) await writeJsonAtomic(this.options.projectionStatePath, state);
  }

  async syncSessions(): Promise<{ ok: boolean; targets: number; sessions: number; warnings: string[] }> {
    const warnings: string[] = [];
    let sessions = 0;
    const state = await this.readProjectionState();
    for (const target of this.options.sessionIndex.targets) {
      try {
        const client = this.clientForTarget(target);
        const listed = await client.request({ schema: REMOTE_WORKER_REQUEST_SCHEMA, id: requestId('list'), type: 'list_sessions' });
        if (!listed.ok) {
          warnings.push(`target_unavailable:${target.machine_id}:${target.project_id}`);
          continue;
        }
        const rawRows = Array.isArray(asRecord(listed.data)?.sessions)
          ? asRecord(listed.data)?.sessions as unknown[]
          : [];
        const rows = rawRows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
        const dedicatedRows = rows.filter((row) => row.dedicated_telegram_thread === true);
        for (const session of dedicatedRows.length ? dedicatedRows : rows) {
          const sessionId = boundedIdentifier(session?.session_id);
          if (!sessionId) continue;
          const snapshotResponse = await client.request({
            schema: REMOTE_WORKER_REQUEST_SCHEMA,
            id: requestId('snapshot'),
            type: 'read_snapshot',
            session_id: sessionId
          });
          const snapshot = snapshotResponse.ok ? asRecord(snapshotResponse.data) : null;
          let route = await this.options.topics.findBySession(target.machine_id, target.project_id, sessionId);
          if (!route) {
            let messageThreadId = 0;
            try {
              const topic = await this.options.projector.createSessionTopic(
                this.options.config.paired_chat_ids[0]!,
                topicName(target, sessionId, snapshot)
              );
              messageThreadId = topic.message_thread_id;
            } catch (error: unknown) {
              if (!(error instanceof TelegramBotApiError) || (error.errorCode !== 400 && error.errorCode !== 404)) throw error;
              warnings.push(`private_topics_unavailable_flat_fallback:${target.machine_id}:${target.project_id}`);
            }
            route = await this.options.topics.upsert({
              machine_id: target.machine_id,
              project_id: target.project_id,
              session_id: sessionId,
              chat_id: this.options.config.paired_chat_ids[0]!,
              message_thread_id: messageThreadId,
              pinned_message_id: null
            });
          }
          if (snapshot) {
            const needsInitialProjection = route.pinned_message_id === null || !state.sessions[routeKey(route)];
            await this.projectSnapshot(route, snapshot, state, needsInitialProjection);
          }
          sessions += 1;
        }
      } catch {
        warnings.push(`target_unavailable:${target.machine_id}:${target.project_id}`);
      }
    }
    await writeJsonAtomic(this.options.projectionStatePath, state);
    return { ok: warnings.length === 0, targets: this.options.sessionIndex.targets.length, sessions, warnings };
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.close().catch(() => undefined)));
    this.clients.clear();
  }

  private async executeRoutedAction(update: TelegramUpdate, routed: TelegramHubRouteResult): Promise<void> {
    const action = routed.action!;
    const route = await this.options.topics.findBySession(action.machine_id, action.project_id, action.session_id);
    if (!route) throw new Error('telegram_action_route_missing');
    if (action.prompt === 'pick') {
      await this.options.projector.sendFinal({ route, text: 'Session selected. Use this topic for typed SKS controls.' });
      if (action.status === 'claimed') await this.options.actions.complete(action.action_id, 'resolved');
      return;
    }
    if (routed.status === 'approval_required' && routed.callback_data) {
      const messageId = await this.options.projector.sendApproval(route, routed.callback_data);
      await this.options.projector.setReaction(route, messageId, 'needs_input');
      return;
    }
    if (action.kind === 'input' && action.prompt === '/input') {
      await this.options.projector.requestInput({ route, prompt: 'Reply to this message with the exact Codex follow-up input.', placeholder: 'Send input to this session' });
      return;
    }
    const response = await this.dispatch(route, action);
    const data = asRecord(response.receipt?.result ?? response.data);
    if (response.ok) {
      await this.options.projector.sendFinal({ route, text: successSummary(action, data) });
      if (commandView(action.prompt) === 'artifacts') await this.options.projector.sendArtifactManifest({ route, artifacts: Array.isArray(data?.artifacts) ? data.artifacts : [] });
      if (data?.schema === 'sks.remote-session-snapshot.v1') {
        const state = await this.readProjectionState();
        await this.projectSnapshot(route, data, state, true);
        await writeJsonAtomic(this.options.projectionStatePath, state);
      }
      await this.reactToUpdate(update, route, action.kind === 'cancel' ? 'blocked' : action.kind === 'verify' ? 'verified' : 'observed');
      if (action.status === 'claimed') await this.options.actions.complete(action.action_id, 'resolved');
    } else {
      const code = publicSafeText(response.error?.code ?? 'remote_command_failed');
      await this.options.projector.sendFinal({ route, text: `Remote action blocked: ${code}` });
      await this.reactToUpdate(update, route, 'blocked');
      if (action.status === 'claimed') await this.options.actions.complete(action.action_id, 'cancelled');
    }
    await this.options.audit.record({
      update_id: update.update_id,
      chat_id: route.chat_id,
      topic_id: route.message_thread_id,
      action_alias: update.callback_query?.data?.startsWith('cb:') ? update.callback_query.data.slice(3) : null,
      command_kind: action.kind,
      decision: response.ok ? 'accepted' : 'rejected',
      policy_reason: response.ok ? 'effect_completed' : response.error?.code ?? 'effect_failed',
      effect_receipt: response.receipt ? `${response.receipt.command_id}:${response.receipt.status}` : null
    });
  }

  private async dispatch(route: TelegramTopicRouteV1, action: RemoteActionV1): Promise<WorkerResponseV1> {
    if (action.risk === 'R3') throw new Error('telegram_r3_always_denied');
    const client = this.clientForRoute(route);
    const commandId = action.action_id;
    let payload: Record<string, unknown>;
    if (action.kind === 'input') payload = { text: action.prompt };
    else if (action.kind === 'read') payload = { view: commandView(action.prompt) };
    else if (action.kind === 'verify') payload = { view: 'verify' };
    else {
      const challengeResponse = await client.request({
        schema: REMOTE_WORKER_REQUEST_SCHEMA,
        id: requestId('cancel'),
        type: 'prepare_cancel',
        session_id: route.session_id,
        command_id: commandId
      });
      if (!challengeResponse.ok) return challengeResponse;
      const challenge = asRecord(challengeResponse.data);
      if (challenge?.schema !== 'sks.remote-cancel-challenge.v1') throw new Error('remote_cancel_challenge_invalid');
      payload = {
        owner_nonce: challenge.owner_nonce,
        expected_pid: challenge.expected_pid,
        expected_process_start_time: challenge.expected_process_start_time,
        expected_command: challenge.expected_command,
        expected_project_root: challenge.expected_project_root,
        expected_generation: challenge.expected_generation,
        approval: {
          schema: REMOTE_R2_APPROVAL_SCHEMA,
          approval_id: `approval-${sha256(action.action_id).slice(0, 16)}`,
          approved_by: 'telegram-owner',
          approved_at: nowIso(),
          expires_at: action.expires_at,
          machine_id: action.machine_id,
          project_id: action.project_id,
          session_id: action.session_id,
          kind: 'cancel',
          command_id: commandId
        }
      };
    }
    const envelope: RemoteCommandEnvelopeV1 = {
      schema: REMOTE_COMMAND_SCHEMA,
      command_id: commandId,
      issued_at: nowIso(),
      expires_at: action.expires_at,
      actor: 'telegram-owner',
      machine_id: action.machine_id,
      project_id: action.project_id,
      session_id: action.session_id,
      kind: action.kind === 'question' || action.kind === 'approval' ? 'input' : action.kind,
      risk: action.risk,
      payload,
      idempotency_key: `tg:${sha256(`${action.action_id}:${action.revision}`).slice(0, 32)}`
    };
    return client.request({ schema: REMOTE_WORKER_REQUEST_SCHEMA, id: requestId('command'), type: 'command', envelope });
  }

  private async sendSessionPicker(update: TelegramUpdate): Promise<void> {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId === undefined) return;
    const routes = (await this.options.topics.list()).filter((route) => route.chat_id === String(chatId)).slice(0, 24);
    if (!routes.length) {
      await this.options.projector.sendFlat({ chatId: String(chatId), text: 'No registered SKS session topics are available. Run hub sync after the remote session index is configured.' });
      return;
    }
    const buttons: Array<Array<Record<string, string>>> = [];
    for (const route of routes) {
      const action = pickerAction(route, this.now());
      const created = await this.options.actions.create(action, { chat_id: route.chat_id, message_thread_id: 0 });
      buttons.push([{ text: `${route.machine_id} · ${route.project_id} · ${route.session_id}`.slice(0, 56), callback_data: created.callback_data }]);
    }
    await this.options.projector.sendFlat({
      chatId: String(chatId),
      text: 'Choose a session. The bot will post into the exact private topic; subsequent controls must stay in that topic.',
      replyMarkup: { inline_keyboard: buttons }
    });
  }

  private async acknowledgeCallback(update: TelegramUpdate, routed: TelegramHubRouteResult): Promise<void> {
    const id = update.callback_query?.id;
    if (!id) return;
    const text = routed.ok
      ? routed.status === 'claimed' ? 'Approved; applying exact scope.' : 'Request accepted.'
      : routed.status === 'already_resolved' ? 'Already resolved.' : `Request rejected: ${routed.status}`;
    await this.options.projector.answerCallbackQuery(id, text, false).catch(() => undefined);
  }

  private async reportEffectFailure(update: TelegramUpdate, action: RemoteActionV1 | null, error: unknown): Promise<void> {
    if (!action) return;
    const route = await this.options.topics.findBySession(action.machine_id, action.project_id, action.session_id);
    if (!route) return;
    const code = error instanceof RemoteSshClientError ? `${error.code}:${error.delivery}` : 'telegram_effect_failed';
    await this.options.projector.sendFinal({ route, text: `Remote action blocked: ${publicSafeText(code)}` }).catch(() => undefined);
    await this.options.audit.record({
      update_id: update.update_id,
      chat_id: route.chat_id,
      topic_id: route.message_thread_id,
      action_alias: update.callback_query?.data?.startsWith('cb:') ? update.callback_query.data.slice(3) : null,
      command_kind: action.kind,
      decision: 'rejected',
      policy_reason: code,
      effect_receipt: null
    });
    if (action.status === 'claimed') await this.options.actions.complete(action.action_id, 'cancelled').catch(() => undefined);
  }

  private async projectSnapshot(routeInput: TelegramTopicRouteV1, snapshot: Record<string, unknown>, state: ProjectionStateV1, force = false): Promise<boolean> {
    let route = routeInput;
    const key = routeKey(route);
    const projection = state.sessions[key] ?? emptyProjection();
    const digest = sha256(JSON.stringify(snapshot));
    if (!force && projection.snapshot_digest === digest) return false;
    const pinned = await this.options.projector.upsertPinnedCard({ route, card: cardFromSnapshot(route, snapshot) });
    if (route.pinned_message_id !== pinned.message_id) {
      route = await this.options.topics.upsert({
        machine_id: route.machine_id,
        project_id: route.project_id,
        session_id: route.session_id,
        chat_id: route.chat_id,
        message_thread_id: route.message_thread_id,
        pinned_message_id: pinned.message_id
      });
    }
    const draft = await this.options.projector.streamDraft({
      route,
      publicPhase: String(snapshot.phase ?? snapshot.session_state ?? 'Session update'),
      text: snapshotSummary(snapshot),
      ...(projection.draft_message_id ? { existingMessageId: projection.draft_message_id } : {})
    });
    projection.snapshot_digest = digest;
    if (draft.message_id) projection.draft_message_id = draft.message_id;
    if (snapshot.completion_verified === true && projection.final_generation !== route.generation) {
      await this.options.projector.sendFinal({ route, text: `Verified terminal session: ${route.session_id}. Machine gates and trust evidence are complete.` });
      projection.final_generation = route.generation;
    }
    state.sessions[key] = projection;
    return true;
  }

  private clientForRoute(route: TelegramTopicRouteV1): TelegramRemoteWorkerPort {
    return this.clientForTarget(findRemoteSessionTarget(this.options.sessionIndex, route.machine_id, route.project_id));
  }

  private clientForTarget(target: RemoteSessionTargetV1): TelegramRemoteWorkerPort {
    const key = `${target.machine_id}:${target.project_id}`;
    const existing = this.clients.get(key);
    if (existing) return existing;
    const machine = findRemoteMachine(this.options.machineRegistry, target.machine_id);
    const created = this.options.clientFactory?.(target) ?? (machine.transport === 'local'
      ? new RemoteLocalWorkerClient({
          machine,
          projectRoot: target.project_root,
          projectId: target.project_id
        })
      : new RemoteSshWorkerClient({
          machine,
          projectRoot: target.project_root,
          projectId: target.project_id
        }));
    this.clients.set(key, created);
    return created;
  }

  private async reactToUpdate(update: TelegramUpdate, route: TelegramTopicRouteV1, state: 'observed' | 'verified' | 'blocked'): Promise<void> {
    const messageId = update.message?.message_id ?? update.callback_query?.message?.message_id;
    if (messageId) await this.options.projector.setReaction(route, messageId, state).catch(() => undefined);
  }

  private async readProjectionState(): Promise<ProjectionStateV1> {
    const value = await readJson<ProjectionStateV1>(this.options.projectionStatePath, { schema: 'sks.telegram-projection-state.v1', sessions: {} });
    return value.schema === 'sks.telegram-projection-state.v1' && value.sessions && typeof value.sessions === 'object'
      ? value
      : { schema: 'sks.telegram-projection-state.v1', sessions: {} };
  }
}
