#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const fixture = await runFakeCodexSdkTaskFixture('control-event-stream');
assertGate(fixture.events.length >= 1, 'Control Plane event ledger must contain translated events', fixture.events);
assertGate(fixture.proof.stream_event_count === fixture.result.streamEventCount, 'proof stream count mismatch', fixture.proof);
assertGate(fixture.proof.translated_event_count === fixture.events.length, 'translated event count mismatch', fixture.proof);
assertGate(fixture.proof.reliability_shield?.attempts?.[0]?.event_count >= 1, 'reliability shield must observe SDK events', fixture.proof);
emitGate('codex-control:event-stream-ledger', { event_count: fixture.events.length, event_types: fixture.result.eventTypes });
