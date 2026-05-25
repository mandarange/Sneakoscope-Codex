import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

export function runRouteBackfillBlackbox(route, gate) {
  const result = spawnSync(process.execPath, [
    'dist/bin/sks.js',
    'agent',
    'run',
    'fixture',
    '--route',
    route,
    '--agents',
    '5',
    '--work-items',
    '8',
    '--target-active-slots',
    '5',
    '--mock',
    '--json'
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE: '1' },
    maxBuffer: 1024 * 1024 * 8
  });
  assertGate(result.status === 0, `${gate} route command failed`, { stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
  const json = JSON.parse(result.stdout);
  const state = json.scheduler?.state || {};
  const proof = json.proof || {};
  const ledgerRoot = path.join(root, json.ledger_root || '');
  const eventsPath = path.join(ledgerRoot, 'agent-scheduler-events.jsonl');
  const events = fs.readFileSync(eventsPath, 'utf8').trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
  const backfills = events.filter((event) => event.event_type === 'backfill_event');
  const graph = JSON.parse(fs.readFileSync(path.join(ledgerRoot, 'agent-task-graph.json'), 'utf8'));
  assertGate(json.ok === true, `${gate} proof must pass`, proof);
  assertGate(graph.schema === 'sks.agent-task-graph.v1', `${gate} task graph schema missing`, graph);
  assertGate(graph.target_active_slots === 5 && graph.total_work_items === 8, `${gate} task graph must split active slots and work items`, graph.route_work_count_summary);
  assertGate(state.target_active_slots === 5, `${gate} target active slots must be 5`, state);
  assertGate(state.total_work_items === 8, `${gate} total work items must be 8`, state);
  assertGate(state.max_observed_active_slots === 5, `${gate} must observe 5 active slots`, state);
  assertGate(state.expected_backfill_count >= 2, `${gate} expected backfill count must be at least 2`, state);
  assertGate(state.backfill_count >= state.expected_backfill_count, `${gate} backfills must satisfy expectation`, state);
  assertGate(backfills.length >= 2, `${gate} must emit at least two backfill events`, { backfills });
  assertGate(events.some((event) => event.event_type === 'scheduler_draining'), `${gate} must emit scheduler_draining`, {});
  assertGate(state.pending_queue_drained === true, `${gate} queue must drain`, state);
  assertGate(state.all_generations_closed === true, `${gate} generations must close`, state);
  assertGate(proof.generation_count >= state.total_work_items, `${gate} proof generation count must cover work items`, proof);
  assertGate(proof.terminal_close_report_count >= proof.generation_count, `${gate} close reports must cover generations`, proof);
  assertGate(proof.source_intelligence_generation_refs_ok === true, `${gate} source refs must propagate`, proof);
  assertGate(proof.goal_mode_generation_refs_ok === true, `${gate} goal refs must propagate`, proof);
  assertGate(proof.tmux_lane_no_flicker_verified === true, `${gate} tmux no-flicker proof must pass`, proof);
  emitGate(gate, {
    route,
    mission_id: json.mission_id,
    target_active_slots: state.target_active_slots,
    total_work_items: state.total_work_items,
    expected_backfill_count: state.expected_backfill_count,
    backfill_count: state.backfill_count,
    generation_count: proof.generation_count
  });
}
