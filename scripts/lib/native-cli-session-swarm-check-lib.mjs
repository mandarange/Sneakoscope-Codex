import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertGate, root } from '../sks-1-18-gate-lib.mjs';

export function runNativeCliSwarmCheck({ agents, workItems = agents, reportName, backend = 'fake', extraArgs = [] }) {
  const distCli = path.join(root, 'dist', 'bin', 'sks.js');
  assertGate(fs.existsSync(distCli), 'dist CLI missing for native CLI swarm check', { distCli });
  const args = [
    distCli,
    'agent',
    'run',
    `native cli session swarm ${agents}`,
    '--backend',
    backend,
    '--mock',
    '--agents',
    String(agents),
    '--concurrency',
    String(agents),
    '--work-items',
    String(workItems),
    '--minimum-work-items',
    String(agents),
    '--json',
    ...extraArgs
  ];
  const stdout = execFileSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(backend === 'codex-sdk' ? { SKS_CODEX_SDK_FAKE: '1', NODE_ENV: 'test' } : {})
    },
    maxBuffer: 96 * 1024 * 1024
  });
  const result = JSON.parse(stdout);
  const proof = result.native_cli_session_proof || {};
  const noSubagent = result.no_subagent_scaling_policy || {};
  const fast = result.fast_mode_propagation || {};
  const report = {
    schema: 'sks.native-cli-session-swarm-check.v1',
    ok: result.ok === true,
    agents,
    work_items: workItems,
    mission_id: result.mission_id,
    backend: result.backend,
    native_cli_session_proof: proof,
    no_subagent_scaling_policy: noSubagent,
    fast_mode_propagation: fast,
    proof_status: result.proof?.status || null
  };
  const out = path.join(root, '.sneakoscope', 'reports', reportName);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  assertGate(result.ok === true, 'native CLI session swarm run must pass', report);
  assertGate(proof.spawned_worker_process_count >= agents, 'spawned native worker process count below requested agents', report);
  assertGate(proof.unique_worker_session_count >= agents, 'unique worker session count below requested agents', report);
  assertGate(proof.unique_slot_count >= agents, 'unique slot count below requested agents', report);
  assertGate(Array.isArray(proof.process_ids) && proof.process_ids.length >= agents, 'process ids missing from native CLI proof', report);
  assertGate(proof.close_report_count >= agents, 'worker close report count below requested agents', report);
  assertGate(noSubagent.ok === true && noSubagent.subagent_events_counted_as_worker_sessions === false, 'no-subagent scaling policy must pass', report);
  assertGate(fast.ok === true && fast.fast_mode === true && fast.service_tier === 'fast', 'fast mode must propagate by default', report);
  assertGate((proof.worker_command_lines || []).every((line) => line.includes('--agent') && line.includes('worker')), 'worker command lines must use --agent worker', report);
  return report;
}
