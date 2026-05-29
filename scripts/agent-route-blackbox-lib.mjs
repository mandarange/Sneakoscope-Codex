import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const PROMPT = 'route truth dynamic scheduler fixture';
const ROUTE_ARGS = ['--agents', '5', '--work-items', '8', '--target-active-slots', '5', '--minimum-work-items', '5', '--max-queue-expansion', '10', '--mock', '--json'];

export function runRouteBackfillBlackbox(route, gate) {
  if (String(route).toLowerCase().includes('team')) return runActualTeamBackfillBlackbox(gate);
  if (String(route).toLowerCase().includes('research')) return runActualResearchBackfillBlackbox(gate);
  if (String(route).toLowerCase().includes('qa')) return runActualQaBackfillBlackbox(gate);
  return runActualAgentBackfillBlackbox(gate);
}

export function runActualAgentBackfillBlackbox(gate = 'agent:backfill-route-blackbox') {
  const json = runSks(['agent', 'run', PROMPT, '--route', '$Agent', ...ROUTE_ARGS], gate);
  validateNativeRun(json, gate, { route: '$Agent', command: 'sks agent run', kind: 'actual_agent_command' });
  return json;
}

export function runActualTeamBackfillBlackbox(gate = 'team:backfill-route-blackbox') {
  const json = runSks(['team', PROMPT, ...ROUTE_ARGS, '--no-open-zellij'], gate);
  validateNativeRun(json.native_agent_run, gate, { route: '$Team', command: 'sks team', kind: 'actual_team_command' });
  return json;
}

export function runActualResearchBackfillBlackbox(gate = 'research:backfill-route-blackbox') {
  const prepared = runSks(['research', 'prepare', PROMPT, '--json'], `${gate}:prepare`);
  const missionId = prepared.mission_id;
  assertGate(Boolean(missionId), `${gate} research prepare must return mission_id`, prepared);
  const json = runSks(['research', 'run', missionId, ...ROUTE_ARGS], gate);
  const native = json.native_agent_run || readMissionJson(missionId, 'research-native-agent-run.json');
  validateNativeRun(native, gate, { route: '$Research', command: 'sks research run', kind: 'actual_research_command' });
  return json;
}

export function runActualQaBackfillBlackbox(gate = 'qa:backfill-route-blackbox') {
  const prepared = runSks(['qa-loop', 'prepare', PROMPT, '--json'], `${gate}:prepare`);
  const missionId = prepared.mission_id;
  assertGate(Boolean(missionId), `${gate} qa prepare must return mission_id`, prepared);
  const json = runSks(['qa-loop', 'run', missionId, ...ROUTE_ARGS], gate);
  const native = json.native_agent_run || readMissionJson(missionId, 'qa-native-agent-run.json');
  validateNativeRun(native, gate, { route: '$QA-LOOP', command: 'sks qa-loop run', kind: 'actual_qa_command' });
  return json;
}

export function validateNativeRun(json, gate, expected = {}) {
  assertGate(Boolean(json), `${gate} native agent run JSON missing`, {});
  const state = json.scheduler?.state || {};
  const proof = json.proof || {};
  const ledgerRoot = path.join(root, json.ledger_root || '');
  assertGate(fs.existsSync(ledgerRoot), `${gate} ledger root missing`, { ledger_root: json.ledger_root });
  const events = readJsonl(path.join(ledgerRoot, 'agent-scheduler-events.jsonl'));
  const backfills = events.filter((event) => event.event_type === 'backfill_event');
  const graph = readJson(path.join(ledgerRoot, 'agent-task-graph.json'));
  const queue = readJson(path.join(ledgerRoot, 'agent-work-queue.json'));
  const supervisor = readJson(path.join(ledgerRoot, 'agent-zellij-lane-supervisor.json'));
  assertGate(json.ok === true, `${gate} proof must pass`, proof);
  assertGate(graph.schema === 'sks.agent-task-graph.v1', `${gate} task graph schema missing`, graph);
  assertGate(graph.target_active_slots === 5 && graph.total_work_items === 8, `${gate} task graph must split active slots and work items`, graph.route_work_count_summary);
  assertGate(queue.total_work_items === graph.total_work_items, `${gate} work queue must match task graph`, { queue: queue.total_work_items, graph: graph.total_work_items });
  assertGate(state.target_active_slots === 5, `${gate} target active slots must be 5`, state);
  assertGate(state.total_work_items === queue.total_work_items, `${gate} scheduler must match work queue`, { scheduler: state.total_work_items, queue: queue.total_work_items });
  assertGate(state.max_observed_active_slots === 5, `${gate} must observe 5 active slots`, state);
  assertGate(state.expected_backfill_count >= 2, `${gate} expected backfill count must be at least 2`, state);
  assertGate(state.backfill_count >= state.expected_backfill_count, `${gate} backfills must satisfy expectation`, state);
  assertGate(backfills.length >= 2, `${gate} must emit at least two backfill events`, { backfills });
  assertGate(events.some((event) => event.event_type === 'scheduler_draining'), `${gate} must emit scheduler_draining`, {});
  assertGate(state.pending_queue_drained === true, `${gate} queue must drain`, state);
  assertGate(state.all_generations_closed === true, `${gate} generations must close`, state);
  assertGate(proof.requested_work_items === 8, `${gate} proof must record requested work items`, proof);
  assertGate(proof.actual_total_work_items === 8, `${gate} proof must record actual total work items`, proof);
  assertGate(proof.task_graph_total_work_items === 8, `${gate} proof task graph total must be 8`, proof);
  assertGate(proof.work_queue_total_work_items === 8, `${gate} proof work queue total must be 8`, proof);
  assertGate(proof.scheduler_total_work_items === 8, `${gate} proof scheduler total must be 8`, proof);
  assertGate(proof.task_graph_matches_cli_options === true, `${gate} proof must bind task graph to CLI options`, proof);
  assertGate(proof.work_queue_matches_task_graph === true, `${gate} proof must bind work queue to task graph`, proof);
  assertGate(proof.scheduler_matches_work_queue === true, `${gate} proof must bind scheduler to work queue`, proof);
  assertGate(proof.generation_count >= state.total_work_items, `${gate} proof generation count must cover work items`, proof);
  assertGate(proof.terminal_close_report_count >= proof.generation_count, `${gate} close reports must cover generations`, proof);
  assertGate(proof.terminal_reports_match_generations === true, `${gate} proof must bind terminal reports to generations`, proof);
  assertGate(proof.source_intelligence_generation_refs_ok === true && proof.task_graph_source_refs_ok === true && proof.work_queue_source_refs_ok === true, `${gate} source refs must propagate`, proof);
  assertGate(proof.goal_mode_generation_refs_ok === true && proof.task_graph_goal_refs_ok === true && proof.work_queue_goal_refs_ok === true, `${gate} goal refs must propagate`, proof);
  assertGate(proof.lane_supervisor_integrated === true && supervisor.schema === 'sks.zellij-lane-supervisor.v1', `${gate} Zellij supervisor must be integrated`, { proof, supervisor });
  assertGate(proof.zellij_lane_no_flicker_verified === true, `${gate} Zellij no-flicker proof must pass`, proof);
  assertGate(proof.real_route_command_used === true, `${gate} must use real route command`, proof);
  assertGate(String(proof.route_command || '').includes(expected.command), `${gate} proof route command mismatch`, proof);
  assertGate(proof.route_blackbox_kind === expected.kind, `${gate} proof route blackbox kind mismatch`, proof);
  if (expected.route !== '$Agent') {
    assertGate(!/\bagent\s+run\b/i.test(String(proof.route_command || '')), `${gate} must not use agent run stand-in`, proof);
  }
  emitGate(gate, {
    route: expected.route,
    command: proof.route_command,
    mission_id: json.mission_id,
    target_active_slots: state.target_active_slots,
    total_work_items: state.total_work_items,
    expected_backfill_count: state.expected_backfill_count,
    backfill_count: state.backfill_count,
    generation_count: proof.generation_count
  });
}

function runSks(args, gate) {
  const result = spawnSync(process.execPath, ['dist/bin/sks.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SKS_AGENT_DYNAMIC_BACKFILL_FIXTURE: '1' },
    maxBuffer: 1024 * 1024 * 16
  });
  assertGate(result.status === 0, `${gate} route command failed`, { args, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
  return parseJson(result.stdout, gate);
}

function parseJson(stdout, gate) {
  try {
    return JSON.parse(stdout);
  } catch (err) {
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(stdout.slice(start, end + 1));
    assertGate(false, `${gate} did not emit JSON`, { stdout: stdout.slice(-4000), error: String(err) });
  }
}

function readMissionJson(missionId, rel) {
  return readJson(path.join(root, '.sneakoscope', 'missions', missionId, rel));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
}
