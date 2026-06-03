#!/usr/bin/env node
import { assertGate, emitGate, readText, runFakeCodexSdkTaskFixture } from './lib/codex-sdk-gate-lib.mjs';

const fixture = await runFakeCodexSdkTaskFixture('zellij-binding', { zellijPaneId: 'pane-999' });
const swarmSource = readText('src/core/agents/native-cli-session-swarm.ts');
const proofSource = readText('src/core/agents/agent-slot-pane-binding-proof.ts');
const managerSource = readText('src/core/zellij/zellij-worker-pane-manager.ts');
assertGate(fixture.proof.zellij_pane_id === 'pane-999', 'control proof must link zellij pane id', fixture.proof);
assertGate(swarmSource.includes('codex_sdk_thread_started'), 'swarm must emit SDK thread event');
assertGate(proofSource.includes('worker_codex_sdk'), 'slot-pane proof must require worker_codex_sdk pane kind');
assertGate(managerSource.includes("pane_kind: 'worker_codex_sdk'"), 'worker pane manager must record worker_codex_sdk pane kind');
emitGate('codex-sdk:zellij-pane-binding', { zellij_pane_id: fixture.proof.zellij_pane_id, sdk_thread_id: fixture.proof.sdk_thread_id });
