#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.js';

const fixture = await runFakeCodexSdkTaskFixture('thread-registry', { zellijPaneId: 'pane-42' });
const thread = fixture.registry.threads[0] || {};
assertGate(fixture.registry.thread_count === 1, 'thread registry must record one thread', fixture.registry);
assertGate(thread.sdk_thread_id === fixture.result.sdkThreadId, 'thread registry sdk_thread_id mismatch', { thread, result: fixture.result });
assertGate(thread.zellij_pane_id === 'pane-42', 'thread registry must link zellij pane id when present', thread);
assertGate(thread.output_schema_id === 'sks.agent-worker-result.v1', 'thread registry output schema mismatch', thread);
emitGate('codex-sdk:thread-registry', { thread_count: fixture.registry.thread_count, sdk_thread_id: thread.sdk_thread_id });
