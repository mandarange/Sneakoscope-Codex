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
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-zellij-'));
await supervisor.initializeZellijLaneSupervisor(tmp, { missionId: 'M-agent-zellij', targetActiveSlots: 1 });
const supervisorState = JSON.parse(await fs.readFile(path.join(tmp, 'agent-zellij-lane-supervisor.json'), 'utf8'));
const runtimeManifest = JSON.parse(await fs.readFile(path.join(tmp, 'zellij-lane-runtime.json'), 'utf8'));
const agent = { id: 'agent_1', session_id: 'session_1', persona_id: 'agent_1', slot_id: 'slot-001', generation_index: 1 };
const result = await runner.runZellijAgent(agent, { id: 'work-001' }, { agentRoot: tmp, missionId: 'M-agent-zellij' });
const lane = supervisorState.lanes?.[0] || {};
const runtimeOk = supervisorState.dispatch_mode === 'jsonl_nonblocking'
  && supervisorState.fifo_policy === 'disabled_to_avoid_writer_blocking'
  && runtimeManifest.dispatch_mode === 'jsonl_nonblocking'
  && lane.command_inbox === 'lanes/slot-001/command-inbox.jsonl'
  && lane.state_dir === 'lanes/slot-001/state'
  && lane.pane_id_source === 'synthetic_layout_pending_proof'
  && lane.runtime?.dispatch?.fifo_policy === 'disabled_to_avoid_writer_blocking'
  && lane.command.includes('SKS_ZELLIJ_COMMAND_INBOX=')
  && lane.command.includes('nice -n 10');
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
const paneWorkerOk = paneWorkerCommand.includes('SKS_ZELLIJ_WORKER_PANE=')
  && paneWorkerCommand.includes('--agent')
  && paneWorkerCommand.includes('worker')
  && paneWorkerCommand.includes('worker.stdout.log')
  && paneWorkerCommand.includes('worker.stderr.log')
  && paneWorkerCommand.includes('worker-heartbeat.jsonl')
  && paneWorkerCommand.includes('code=$?');
const ok = result.status === 'done' && result.backend === 'zellij' && runtimeOk && paneWorkerOk;
const report = { schema: 'sks.agent-zellij-runtime-check.v1', ok, result, runtime_ok: runtimeOk, pane_worker_ok: paneWorkerOk, pane_worker_command: paneWorkerCommand, supervisor: supervisorState, runtime_manifest: runtimeManifest };
await fs.mkdir(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
await fs.writeFile(path.join(root, '.sneakoscope', 'reports', 'agent-zellij-runtime.json'), `${JSON.stringify(report, null, 2)}\n`);
emit(report);
function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
function fail(blocker, detail) { emit({ schema: 'sks.agent-zellij-runtime-check.v1', ok: false, blockers: [blocker], detail }); process.exit(1); }
