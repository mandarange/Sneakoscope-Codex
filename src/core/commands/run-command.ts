// @ts-nocheck
import path from 'node:path';
import { exists, projectRoot, runProcess, writeJsonAtomic } from '../fsx.js';
import { createMission, missionDir, setCurrent } from '../mission.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { routePrompt } from '../routes.js';
import { latestTrustReport } from '../trust-kernel/trust-report.js';
import { flag, positionalArgs } from './command-utils.js';

export async function runCommand(args = []) {
  const root = await projectRoot();
  const prompt = positionalArgs(args).join(' ').trim();
  if (!prompt) {
    console.error('Usage: sks run "task" [--visual|--research|--db] [--mock] [--json]');
    process.exitCode = 2;
    return;
  }
  const route = classifyRunRoute(prompt, args);
  const { id, dir } = await createMission(root, { mode: 'run', prompt });
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: flag(args, '--mock') ? 'RUN_MOCK_FINALIZE' : 'RUN_ROUTE_SELECTED',
    implementation_allowed: true
  });
  const execute = flag(args, '--execute') || flag(args, '--auto');
  const auto = flag(args, '--auto');
  const classification = {
    schema: 'sks.run-classification.v1',
    mission_id: id,
    prompt,
    route: route.command,
    reason: route.description || 'route classifier selected this SKS route',
    mock: flag(args, '--mock'),
    execute,
    auto,
    next_action: runNextAction(route, id, args)
  };
  await writeJsonAtomic(path.join(dir, 'run-classification.json'), classification);
  if (!flag(args, '--mock') && !execute) {
    const result = { schema: 'sks.run.v2', ok: true, mission_id: id, route: route.command, classification, status: 'prepared' };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`SKS run prepared ${route.command} mission ${id}`);
    console.log(`Next: ${classification.next_action}`);
    return result;
  }
  if (execute) return executeRunRoute(root, { id, dir, route, prompt, args, classification, auto });
  const gate = { schema: 'sks.run-gate.v1', ok: true, passed: true, route: route.command, mock: true };
  await writeJsonAtomic(path.join(missionDir(root, id), 'run-gate.json'), gate);
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route: route.command,
    gateFile: 'run-gate.json',
    gate,
    artifacts: ['run-classification.json', 'run-gate.json', 'completion-proof.json'],
    mock: true,
    visual: flag(args, '--visual'),
    statusHint: 'verified_partial',
    command: { cmd: `sks run "${prompt}" --mock`, status: 0 }
  });
  const trust = await latestTrustReport(root, id);
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: proof.ok ? 'RUN_MOCK_FINALIZED' : 'RUN_MOCK_BLOCKED',
    implementation_allowed: true,
    completion_proof: 'completion-proof.json',
    trust_report: 'trust-report.json'
  });
  const result = {
    schema: 'sks.run.v2',
    ok: proof.ok,
    mission_id: id,
    route: route.command,
    status: proof.proof?.status || 'not_verified',
    trust_status: trust.status,
    classification,
    completion_proof: { ok: proof.ok, validation: proof.validation },
    trust_report: trust
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`SKS run: ${result.status} (${route.command})`);
  console.log(`Mission: ${id}`);
  console.log(`Trust: ${trust.status}`);
  return result;
}

async function executeRunRoute(root, { id, dir, route, prompt, args, classification, auto }) {
  const execution = await executeRouteCommand(root, route, prompt, { auto });
  await writeJsonAtomic(path.join(dir, 'run-route-execution.json'), execution);
  const gate = {
    schema: 'sks.run-gate.v1',
    ok: execution.ok,
    passed: execution.ok,
    route: route.command,
    execute: true,
    auto,
    route_execution: execution.status,
    executed_command: execution.command,
    nested_mission_id: execution.nested_mission_id || null,
    blockers: execution.blockers
  };
  await writeJsonAtomic(path.join(dir, 'run-gate.json'), gate);
  const statusHint = execution.ok ? execution.trust_status || 'verified_partial' : 'blocked';
  const proof = await maybeFinalizeRoute(root, {
    missionId: id,
    route: route.command,
    gateFile: 'run-gate.json',
    gate,
    artifacts: ['run-classification.json', 'run-route-execution.json', 'run-gate.json', 'completion-proof.json'],
    statusHint,
    blockers: execution.ok ? [] : execution.blockers,
    unverified: execution.unverified,
    command: { cmd: execution.command || `sks run "${prompt}" --execute`, status: execution.exit_code ?? (execution.ok ? 0 : 2) }
  });
  const trust = await latestTrustReport(root, id);
  const autoVerification = auto ? await runAutoVerification(root, id) : null;
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: execution.ok && proof.ok ? 'RUN_EXECUTE_DONE' : 'RUN_EXECUTE_BLOCKED',
    implementation_allowed: execution.ok,
    nested_mission_id: execution.nested_mission_id || null,
    completion_proof: 'completion-proof.json',
    trust_report: 'trust-report.json'
  });
  const result = {
    schema: 'sks.run.v2',
    ok: execution.ok && proof.ok,
    mission_id: id,
    route: route.command,
    route_execution: execution.status,
    status: proof.proof?.status || statusHint,
    trust_status: trust.status,
    classification,
    execution,
    auto_verification: autoVerification,
    completion_proof: `.sneakoscope/missions/${id}/completion-proof.json`,
    trust_report: `.sneakoscope/missions/${id}/trust-report.json`,
    next_action: execution.ok ? 'inspect status or continue with route-specific follow-up' : execution.next_action
  };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`SKS run execute: ${result.route_execution} (${route.command})`);
  console.log(`Mission: ${id}`);
  console.log(`Trust: ${trust.status}`);
  if (!execution.ok) console.log(`Next: ${execution.next_action}`);
  return result;
}

async function executeRouteCommand(root, route, prompt, { auto = false } = {}) {
  if (route.command === '$Image-UX-Review') {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      route: route.command,
      command: null,
      exit_code: 2,
      blockers: ['visual_source_or_codex_computer_use_evidence_missing'],
      unverified: ['Visual routes require real source images and Codex Computer Use/image evidence; sks run --execute will not fabricate it.'],
      next_action: 'provide the source screenshot/image evidence, then run the selected visual route directly'
    };
  }
  if (route.command === '$DB' && destructiveDbPrompt(prompt)) {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      route: route.command,
      command: 'sks db check --command <prompt>',
      exit_code: 2,
      blockers: ['destructive_db_auto_execute_blocked'],
      unverified: ['DB destructive or broad mutation prompts cannot auto-execute.'],
      next_action: 'run sks db check/classify and prepare a scoped migration-only plan'
    };
  }
  if (route.command === '$Research') return executePreparedRoute(root, route, prompt, {
    prepare: ['research', 'prepare', prompt, '--json'],
    run: (missionId) => ['research', 'run', missionId, '--mock', '--json'],
    trustStatus: 'verified_partial'
  });
  if (route.command === '$QA-LOOP') return executePreparedRoute(root, route, prompt, {
    prepare: ['qa-loop', 'prepare', prompt, '--json'],
    run: (missionId) => ['qa-loop', 'run', missionId, '--mock', '--json'],
    trustStatus: 'verified_partial'
  });
  const commandArgs = safeRouteExecutionArgs(route, prompt, { auto });
  const result = await runSks(root, commandArgs);
  return routeExecutionResult(route, ['sks', ...commandArgs].join(' '), result, {
    okStatus: 'verified_partial',
    trustStatus: 'verified_partial'
  });
}

async function runAutoVerification(root, missionId) {
  const trust = await runSks(root, ['trust', 'validate', missionId, '--json']);
  const status = await runSks(root, ['status', '--json']);
  return {
    schema: 'sks.run-auto-verification.v1',
    ok: trust.code === 0 && status.code === 0,
    trust_validate: {
      command: `sks trust validate ${missionId} --json`,
      exit_code: trust.code,
      stdout_tail: trust.stdout.slice(-1200),
      stderr_tail: trust.stderr.slice(-1200)
    },
    status: {
      command: 'sks status --json',
      exit_code: status.code,
      stdout_tail: status.stdout.slice(-1200),
      stderr_tail: status.stderr.slice(-1200)
    }
  };
}

async function executePreparedRoute(root, route, prompt, { prepare, run, trustStatus }) {
  const prepareResult = await runSks(root, prepare);
  const prepareCommand = ['sks', ...prepare].join(' ');
  const missionId = parseMissionId(prepareResult.stdout);
  const steps = [
    {
      label: 'prepare',
      command: prepareCommand,
      exit_code: prepareResult.code,
      stdout_tail: prepareResult.stdout.slice(-1200),
      stderr_tail: prepareResult.stderr.slice(-1200)
    }
  ];
  if (prepareResult.code !== 0 || !missionId) {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      route: route.command,
      command: prepareCommand,
      exit_code: prepareResult.code,
      stdout_tail: prepareResult.stdout.slice(-1200),
      stderr_tail: prepareResult.stderr.slice(-1200),
      nested_mission_id: missionId || null,
      steps,
      blockers: [missionId ? 'route_prepare_failed' : 'route_prepare_mission_id_missing'],
      unverified: [],
      next_action: 'inspect run-route-execution.json prepare stdout_tail/stderr_tail'
    };
  }
  const runArgs = run(missionId);
  const runResult = await runSks(root, runArgs);
  const runCommand = ['sks', ...runArgs].join(' ');
  steps.push({
    label: 'run',
    command: runCommand,
    exit_code: runResult.code,
    stdout_tail: runResult.stdout.slice(-1200),
    stderr_tail: runResult.stderr.slice(-1200)
  });
  return routeExecutionResult(route, `${prepareCommand} && ${runCommand}`, runResult, {
    nestedMissionId: missionId,
    steps,
    okStatus: 'verified_partial',
    trustStatus,
    unverified: [
      'sks run --execute prepared and ran the selected route through its CLI; mock-safe fixtures do not claim live external source or UI coverage.'
    ]
  });
}

async function runSks(root, commandArgs) {
  const packedBin = new URL('../../bin/sks.js', import.meta.url).pathname;
  const sourceBin = new URL('../../../bin/sks.js', import.meta.url).pathname;
  const entrypoint = await exists(packedBin) ? packedBin : sourceBin;
  return runProcess(process.execPath, [entrypoint, ...commandArgs], {
    cwd: root,
    timeoutMs: 180_000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
}

function routeExecutionResult(route, command, result, options = {}) {
  const nestedMissionId = parseMissionId(result.stdout);
  const ok = result.code === 0;
  return {
    schema: 'sks.run-route-execution.v1',
    ok,
    status: ok ? 'completed' : 'blocked',
    route: route.command,
    command,
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-1200),
    stderr_tail: result.stderr.slice(-1200),
    nested_mission_id: options.nestedMissionId || nestedMissionId,
    steps: options.steps || undefined,
    trust_status: ok ? options.trustStatus || 'verified_partial' : 'blocked',
    blockers: ok ? [] : ['route_command_failed'],
    unverified: ok ? options.unverified || ['sks run --execute used the deterministic safe route command path; real external dependencies remain route-specific.'] : [],
    next_action: ok ? 'review completion proof and trust report' : 'inspect run-route-execution.json stderr_tail'
  };
}

function classifyRunRoute(prompt, args) {
  if (flag(args, '--visual')) return routePrompt('$Image-UX-Review');
  if (flag(args, '--research')) return routePrompt('$Research');
  if (flag(args, '--db')) return routePrompt('$DB');
  const route = routePrompt(prompt);
  return route?.command === '$SKS' ? routePrompt('$Team') : route;
}

function runNextAction(route, id, args) {
  if (flag(args, '--mock')) return 'mock run finalizes immediately for release fixture evidence';
  if (flag(args, '--execute') || flag(args, '--auto')) return 'execute selected safe route command and write completion proof/trust report';
  if (route.command === '$Research') return `sks research run ${id} --json`;
  if (route.command === '$QA-LOOP') return `sks qa-loop run ${id} --json`;
  return `continue ${route.command} mission ${id} through the selected SKS route`;
}

function safeRouteExecutionArgs(route, prompt, { auto = false } = {}) {
  if (route.command === '$DB') return ['db', 'check', '--sql', 'SELECT 1', '--json'];
  if (route.command === '$Wiki') return ['wiki', 'refresh', '--json'];
  return ['team', prompt, '--mock', '--json', ...(auto ? ['--no-tmux'] : [])];
}

function destructiveDbPrompt(prompt = '') {
  return /\b(drop|truncate|delete\s+from|update\s+\w+\s+set|reset|db\s+push|disable\s+rls)\b/i.test(String(prompt));
}

function parseMissionId(text = '') {
  try {
    const parsed = JSON.parse(text);
    return parsed?.mission_id || parsed?.proof?.proof?.mission_id || null;
  } catch {
    return String(text || '').match(/\bM-\d{8}-\d{6}-[a-f0-9]{4}\b/)?.[0] || null;
  }
}
