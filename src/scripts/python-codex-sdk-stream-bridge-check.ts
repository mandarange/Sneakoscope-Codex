#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const mod = await importDist('core/codex-control/python-codex-sdk-event-translator.js');
const events = mod.translatePythonCodexSdkEvents([
  { event: 'thread_started', thread_id: 't' },
  { event: 'turn_completed', turn_id: 'u', status: 'completed', final_response: '{}' }
]);
assertGate(events.length === 2, 'Python SDK event translator must preserve stream events');
assertGate(events[1].event_type === 'turn_completed', 'Python SDK turn completion event missing');
emitGate('python-sdk:stream-bridge', { event_count: events.length });
