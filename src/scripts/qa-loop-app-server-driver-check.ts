#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { runQaAppServerDriver } from '../core/qa-loop/qa-app-server-driver.js';
import { selectQaSurface } from '../core/qa-loop/qa-surface-router.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-qa-app-server-driver-'));
const calls = [];
const fakeClient = {
  listeners: [],
  async initialize() {
    calls.push('initialize');
  },
  onEvent(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  },
  async startThread(params) {
    calls.push(['thread/start', params]);
    const event = { method: 'thread/started', params: { threadId: 'thread-qa-driver', thread: { id: 'thread-qa-driver' } } };
    this.listeners.forEach((listener) => listener(event));
    return { thread: { id: 'thread-qa-driver' }, cwd: params.cwd };
  },
  async startTurn(params) {
    calls.push(['turn/start', params]);
    this.listeners.forEach((listener) => listener({ method: 'turn/started', params: { threadId: params.threadId, turn: { id: 'turn-qa-driver' } } }));
    this.listeners.forEach((listener) => listener({
      method: 'item/tool/call',
      params: {
        threadId: params.threadId,
        turnId: 'turn-qa-driver',
        itemId: 'item-click-1',
        tool: '@Browser',
        action: 'click',
        cookie: 'secret-cookie-value'
      }
    }));
    return { turn: { id: 'turn-qa-driver' } };
  },
  async waitForTurnCompletion(threadId, turnId) {
    calls.push(['wait', { threadId, turnId }]);
    return { threadId, turnId, status: 'completed' };
  }
};

const surface = selectQaSurface({ missionId: 'M-qa-driver', targetUrl: 'http://localhost:3000', prompt: 'local Browser QA' });
const session = await runQaAppServerDriver({
  missionDir: tmp,
  missionId: 'M-qa-driver',
  client: fakeClient,
  cwd: process.cwd(),
  prompt: '@Browser open http://localhost:3000 and click Save',
  surfaceSelection: surface,
  timeoutMs: 500
});

assertGate(session.status === 'completed', 'QA App Server driver fake session must complete', session);
assertGate(session.thread_id === 'thread-qa-driver', 'thread id must be correlated', session);
assertGate(session.turn_id === 'turn-qa-driver', 'turn id must be correlated', session);
assertGate(session.action_event_count >= 1, 'action-like tool event must be counted', session);

const runtimeEvents = await fs.readFile(path.join(tmp, 'qa-loop', 'runtime-events.jsonl'), 'utf8');
const actionLedger = await fs.readFile(path.join(tmp, 'qa-loop', 'action-ledger.jsonl'), 'utf8');
assertGate(runtimeEvents.includes('thread-qa-driver') && runtimeEvents.includes('turn-qa-driver'), 'runtime events must include thread/turn IDs', runtimeEvents);
assertGate(actionLedger.includes('item-click-1'), 'action ledger must include item id', actionLedger);
assertGate(!runtimeEvents.includes('secret-cookie-value') && !actionLedger.includes('secret-cookie-value'), 'driver must redact cookie/token-like fields from artifacts');

emitGate('qa-loop:app-server-driver', {
  calls: calls.map((call) => Array.isArray(call) ? call[0] : call),
  action_event_count: session.action_event_count,
  event_count: session.event_count,
  redaction: true
});
