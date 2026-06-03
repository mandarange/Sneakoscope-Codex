#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const manager = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-worker-pane-manager.js')).href);
const valid = manager.evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'worker_started' },
  { event_type: 'codex_sdk_thread_started' },
  { event_type: 'result_written' },
  { event_type: 'pane_closed' }
]);
const invalid = manager.evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'worker_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'result_written' }
]);
const ok = valid.ok && invalid.ok === false && invalid.blockers.includes('spawn_order_missing_codex_sdk_thread_started');
emit({
  schema: 'sks.zellij-worker-pane-spawn-order-check.v1',
  ok,
  valid,
  invalid,
  blockers: ok ? [] : ['zellij_worker_pane_spawn_order_check_failed']
});

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.zellij-worker-pane-spawn-order-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
