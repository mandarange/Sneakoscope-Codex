import path from 'node:path';
import { appendJsonlBounded, nowIso, writeJsonAtomic } from '../fsx.js';
import {
  QA_ACTION_LEDGER_ARTIFACT,
  QA_LIVE_SESSION_ARTIFACT,
  QA_RUNTIME_EVENT_LEDGER_ARTIFACT,
  type QaSurfaceSelection
} from './qa-types.js';

type JsonObject = Record<string, any>;

export interface QaAppServerDriverClient {
  initialize?: () => Promise<unknown>;
  startThread: (params: JsonObject) => Promise<unknown>;
  startTurn: (params: JsonObject) => Promise<unknown>;
  waitForTurnCompletion?: (threadId: string, turnId?: string | null, timeoutMs?: number) => Promise<JsonObject>;
  onEvent?: (listener: (event: JsonObject) => void) => () => void;
  close?: () => Promise<void>;
}

export interface QaAppServerDriverInput {
  readonly missionDir: string;
  readonly missionId: string | null;
  readonly client: QaAppServerDriverClient;
  readonly cwd: string;
  readonly prompt: string;
  readonly surfaceSelection: QaSurfaceSelection;
  readonly timeoutMs?: number;
  readonly threadStartParams?: JsonObject;
  readonly turnStartParams?: JsonObject;
}

export interface QaAppServerLiveSession {
  readonly schema: 'sks.qa-loop-live-session.v2';
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly mission_id: string | null;
  readonly status: 'completed' | 'blocked';
  readonly selected_surface: string;
  readonly thread_id: string | null;
  readonly turn_id: string | null;
  readonly event_count: number;
  readonly item_event_count: number;
  readonly action_event_count: number;
  readonly observation_event_count: number;
  readonly blockers: readonly string[];
  readonly unverified: readonly string[];
  readonly artifacts: {
    readonly runtime_events: string;
    readonly action_ledger: string;
  };
}

export async function runQaAppServerDriver(input: QaAppServerDriverInput): Promise<QaAppServerLiveSession> {
  const events: JsonObject[] = [];
  const dispose = input.client.onEvent?.((event) => {
    events.push(event);
  });
  const startedAt = nowIso();
  const blockers: string[] = [];
  let threadId: string | null = null;
  let turnId: string | null = null;
  try {
    await input.client.initialize?.();
    const thread = await input.client.startThread({
      cwd: input.cwd,
      ...input.threadStartParams
    } satisfies JsonObject);
    threadId = extractThreadId(thread);
    if (!threadId) blockers.push('app_server_thread_id_missing');
    if (threadId) {
      const turn = await input.client.startTurn({
        threadId,
        cwd: input.cwd,
        input: [{ type: 'text', text: input.prompt }],
        ...input.turnStartParams
      } satisfies JsonObject);
      turnId = extractTurnId(turn);
      if (!turnId) blockers.push('app_server_turn_id_missing');
      if (input.client.waitForTurnCompletion) {
        const completed = await input.client.waitForTurnCompletion(threadId, turnId, input.timeoutMs);
        events.push({ method: 'turn/completed', params: completed, received_at: nowIso() });
      }
    }
  } catch (err: unknown) {
    blockers.push(`app_server_driver_failed:${err instanceof Error ? err.message : String(err)}`);
  } finally {
    dispose?.();
  }

  await writeAppServerEventLedgers(input.missionDir, input.missionId, input.surfaceSelection.selected_surface, threadId, turnId, events);
  const session: QaAppServerLiveSession = {
    schema: 'sks.qa-loop-live-session.v2',
    started_at: startedAt,
    completed_at: nowIso(),
    mission_id: input.missionId,
    status: blockers.length ? 'blocked' : 'completed',
    selected_surface: input.surfaceSelection.selected_surface,
    thread_id: threadId,
    turn_id: turnId,
    event_count: events.length,
    item_event_count: events.filter(isItemEvent).length,
    action_event_count: events.filter(isActionLikeEvent).length,
    observation_event_count: events.filter(isObservationLikeEvent).length,
    blockers,
    unverified: events.some(isActionLikeEvent) ? [] : ['app_server_action_event_unverified'],
    artifacts: {
      runtime_events: QA_RUNTIME_EVENT_LEDGER_ARTIFACT,
      action_ledger: QA_ACTION_LEDGER_ARTIFACT
    }
  };
  await writeJsonAtomic(path.join(input.missionDir, QA_LIVE_SESSION_ARTIFACT), session);
  return session;
}

async function writeAppServerEventLedgers(
  missionDir: string,
  missionId: string | null,
  surface: string,
  threadId: string | null,
  turnId: string | null,
  events: readonly JsonObject[]
) {
  for (const event of events) {
    const method = String(event.method || event.type || event.params?.method || 'app_server_event');
    await appendJsonlBounded(path.join(missionDir, QA_RUNTIME_EVENT_LEDGER_ARTIFACT), {
      schema: 'sks.qa-loop-app-server-event.v2',
      ts: nowIso(),
      mission_id: missionId,
      thread_id: event.params?.threadId || event.threadId || threadId,
      turn_id: event.params?.turnId || event.params?.turn?.id || event.turnId || turnId,
      item_id: event.params?.itemId || event.params?.item?.id || event.itemId || null,
      surface,
      kind: method,
      status: 'observed',
      data: redactEvent(event)
    });
    if (isActionLikeEvent(event)) {
      await appendJsonlBounded(path.join(missionDir, QA_ACTION_LEDGER_ARTIFACT), {
        schema: 'sks.qa-loop-action.v2',
        ts: nowIso(),
        mission_id: missionId,
        thread_id: event.params?.threadId || event.threadId || threadId,
        turn_id: event.params?.turnId || event.params?.turn?.id || event.turnId || turnId,
        item_id: event.params?.itemId || event.params?.item?.id || event.itemId || null,
        surface,
        kind: method,
        status: 'observed',
        real: true,
        data: redactEvent(event)
      });
    }
  }
}

function extractThreadId(value: unknown): string | null {
  const obj = value as JsonObject | null;
  return stringOrNull(obj?.thread?.id || obj?.threadId || obj?.id);
}

function extractTurnId(value: unknown): string | null {
  const obj = value as JsonObject | null;
  return stringOrNull(obj?.turn?.id || obj?.turnId || obj?.id);
}

function stringOrNull(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function isItemEvent(event: JsonObject): boolean {
  return /^item\//.test(String(event.method || event.type || ''));
}

function isActionLikeEvent(event: JsonObject): boolean {
  const method = String(event.method || event.type || '');
  return /^item\/.*(?:tool|action|commandExecution|computer|browser|chrome)/i.test(method)
    || /(?:tool|action|click|type|scroll|navigate|screenshot|observation)/i.test(JSON.stringify(event.params || event));
}

function isObservationLikeEvent(event: JsonObject): boolean {
  const method = String(event.method || event.type || '');
  return /observation|completed|screenshot|browser|chrome|computer/i.test(method)
    || /observation|screenshot|visual|page|window/i.test(JSON.stringify(event.params || event));
}

function redactEvent(event: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(event, (key, value) => {
    if (/(password|passwd|token|secret|cookie|authorization|credential)/i.test(String(key))) return '[REDACTED]';
    if (typeof value === 'string' && /(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]+)/.test(value)) return '[REDACTED]';
    return value;
  }));
}
