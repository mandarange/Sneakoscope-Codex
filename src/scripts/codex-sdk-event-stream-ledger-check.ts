#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const fixture = await runFakeCodexSdkTaskFixture('event-stream');
assertGate(fixture.events.length >= 1, 'SDK event ledger must contain events', fixture.events);
assertGate(fixture.proof.stream_event_count === fixture.result.streamEventCount, 'proof stream count mismatch', fixture.proof);
assertGate(fixture.proof.translated_event_count === fixture.events.length, 'translated event count mismatch', fixture.proof);
emitGate('codex-sdk:event-stream-ledger', { event_count: fixture.events.length, event_types: fixture.result.eventTypes });
