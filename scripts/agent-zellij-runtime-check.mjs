#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureDistFresh, root } from './lib/ensure-dist-fresh.mjs';

const freshness = ensureDistFresh({ rebuild: true });
if (!freshness.ok) fail('dist_not_fresh', { freshness });
const supervisor = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'zellij-lane-supervisor.js')).href);
const runner = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'agent-runner-zellij.js')).href);
const nativeSwarm = await import(pathToFileURL(path.join(root, 'dist', 'core', 'agents', 'native-cli-session-swarm.js')).href);
const manager = await import(pathToFileURL(path.join(root, 'dist', 'core', 'zellij', 'zellij-worker-pane-manager.js')).href);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-zellij-'));
await supervisor.initializeZellijLaneSupervisorEmpty(tmp, { missionId: 'M-agent-zellij', sessionName: 'sks-M-agent-zellij' });
const supervisorState = JSON.parse(await fs.readFile(path.join(tmp, 'agent-zellij-lane-supervisor.json'), 'utf8'));
const runtimeManifest = JSON.parse(await fs.readFile(path.join(tmp, 'zellij-lane-runtime.json'), 'utf8'));
const agent = { id: 'agent_1', session_id: 'session_1', persona_id: 'agent_1', slot_id: 'slot-001', generation_index: 1 };
const result = await runner.runZellijAgent(agent, { id: 'work-001' }, { agentRoot: tmp, missionId: 'M-agent-zellij' });
const supervisorOk = supervisorState.lane_count === 0
  && supervisorState.lanes.length === 0
  && supervisorState.all_lanes_closed_after_drain === true
  && runtimeManifest.lanes.length === 0;
const paneWorkerCommand = nativeSwarm.buildPaneWorkerCommand({
  args: ['/tmp/sks.js', '--agent', 'worker', '--intake', '/tmp/worker-intake.json', '--json'],
  stdoutPath: '/tmp/worker.stdout.log',
  stderrPath: '/tmp/worker.stderr.log',
  heartbeatPath: '/tmp/worker-heartbeat.jsonl',
  env: {
    SKS_AGENT_WORKER: '1',
    SKS_PARENT_MISSION_ID: 'M-agent-zellij',
    SKS_AGENT_SLOT_ID: 'slot-001',
    SKS_ZELLIJ_WORKER_PANE: '1'
  }
});
const paneArtifact = manager.buildWorkerPaneArtifact({
  root: tmp,
  missionId: 'M-agent-zellij',
  sessionName: 'sks-M-agent-zellij',
  slotId: 'slot-001',
  generationIndex: 1,
  sessionId: 'slot-001-gen-1',
  workerArtifactDir: 'sessions/slot-001/gen-1/worker',
  resultPath: 'sessions/slot-001/gen-1/worker/worker-result.json',
  heartbeatPath: 'sessions/slot-001/gen-1/worker/worker-heartbeat.jsonl',
  patchEnvelopePath: 'sessions/slot-001/gen-1/worker/worker-patch-envelope.json',
  stdoutLog: 'sessions/slot-001/gen-1/worker/worker.stdout.log',
  stderrLog: 'sessions/slot-001/gen-1/worker/worker.stderr.log',
  paneId: '1',
  paneIdSource: 'zellij_worker_new_pane_stdout',
  status: 'running',
  blockers: []
});
const paneWorkerOk = paneWorkerCommand.includes('SKS_ZELLIJ_WORKER_PANE=')
  && paneWorkerCommand.includes('--agent')
  && paneWorkerCommand.includes('worker')
  && paneWorkerCommand.includes('worker.stdout.log')
  && paneWorkerCommand.includes('worker.stderr.log')
  && paneWorkerCommand.includes('worker-heartbeat.jsonl')
  && paneWorkerCommand.includes('code=$?')
  && paneArtifact.pane_name === 'slot-001/gen-1'
  && paneArtifact.scaling_primitive === 'native_cli_process_in_zellij_worker_pane';
const ok = result.status === 'done' && result.backend === 'zellij' && supervisorOk && paneWorkerOk;
const report = { schema: 'sks.agent-zellij-runtime-check.v1', ok, result, supervisor_ok: supervisorOk, pane_worker_ok: paneWorkerOk, pane_worker_command: paneWorkerCommand, pane_artifact: paneArtifact, supervisor: supervisorState, runtime_manifest: runtimeManifest, blockers: ok ? [] : ['agent_zellij_runtime_check_failed'] };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'agent-zellij-runtime.json'), `${JSON.stringify(report, null, 2)}\n`);
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-zellij-runtime-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
