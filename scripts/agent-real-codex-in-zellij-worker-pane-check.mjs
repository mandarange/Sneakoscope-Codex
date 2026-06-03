#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const manager = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-worker-pane-manager.js')).href);
const swarmSource = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'native-cli-session-swarm.ts'), 'utf8');
const routerSource = await fs.readFile(path.join(root, 'src', 'core', 'agents', 'native-worker-backend-router.ts'), 'utf8');
const controlSource = await fs.readFile(path.join(root, 'src', 'core', 'codex-control', 'codex-task-runner.ts'), 'utf8');
const sourceOk = swarmSource.includes('native_cli_process_in_zellij_worker_pane')
  && swarmSource.includes('openWorkerPane')
  && swarmSource.includes('worker-process-report.json')
  && swarmSource.includes('codex_sdk_thread_started')
  && routerSource.includes("backend === 'codex-sdk' || backend === 'zellij'")
  && routerSource.includes('runCodexTask')
  && controlSource.includes('codex-sdk-events.jsonl')
  && routerSource.includes('codex-thread-registry.json');
const eventProof = manager.evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'worker_started' },
  { event_type: 'codex_sdk_thread_started' },
  { event_type: 'result_written' },
  { event_type: 'pane_closed' }
]);
const requireReal = process.env.SKS_REQUIRE_REAL_CODEX_ZELLIJ === '1' || process.argv.includes('--require-real');
const ok = sourceOk && eventProof.ok && !requireReal;
emit({
  schema: 'sks.agent-real-codex-in-zellij-worker-pane-check.v1',
  ok,
  source_ok: sourceOk,
  event_proof: eventProof,
  integration_optional: !requireReal,
  real_execution: null,
  blockers: ok ? [] : requireReal ? ['real_codex_zellij_worker_pane_not_executed_by_fixture_gate'] : ['agent_real_codex_in_zellij_worker_pane_source_check_failed']
});

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-real-codex-in-zellij-worker-pane-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
