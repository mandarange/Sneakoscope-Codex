#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const shield = await importDist('core/codex-control/codex-reliability-shield.js');
const translator = await importDist('core/codex-control/codex-event-translator.js');
const reasoningEvent = { type: 'reasoning.delta', item: { type: 'reasoning', text: 'private reasoning fixture that must not leak' } };
const heartbeats = shield.buildKeepaliveHeartbeats([reasoningEvent]);
const translated = translator.translateCodexSdkEvent(reasoningEvent);
assertGate(heartbeats.length === 1, 'reasoning events must produce keepalive heartbeats', heartbeats);
assertGate(heartbeats[0].content_redacted === true, 'heartbeat must redact reasoning content', heartbeats);
assertGate(translated.message_tail === '[thinking]', 'translated reasoning event must show status only', translated);
assertGate(!JSON.stringify(heartbeats).includes('private reasoning fixture'), 'heartbeat leaked reasoning content', heartbeats);
emitGate('codex-control:keepalive-no-cot-leak', { heartbeat_count: heartbeats.length, content_redacted: true });
