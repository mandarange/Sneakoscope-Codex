import path from 'node:path';
import { exists, projectRoot, runProcess, writeJsonAtomic, type RunProcessResult } from '../fsx.js';
import { createMission, missionDir, setCurrent } from '../mission.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { routePrompt } from '../routes.js';
import { latestTrustReport } from '../trust-kernel/trust-report.js';
import { flag, positionalArgs } from './command-utils.js';

export type RunMode = 'prepare' | 'mock' | 'execute' | 'auto';
export type RouteExecutionStatus = 'completed' | 'blocked' | 'verified_partial' | 'prepared';
export type RouteExecutionKind = 'safe_deterministic' | 'mock_safe' | 'live_route' | 'blocked';

export interface RunClassification {
  schema: 'sks.run-classification.v1';
  mission_id: string;
  prompt: string;
  route: string;
  reason: string;
  mock: boolean;
  execute: boolean;
  auto: boolean;
  next_action: string;
}

export interface RunRouteStep {
  label: string;
  command: string;
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
}

export interface RunRouteExecution {
  schema: 'sks.run-route-execution.v1';
  ok: boolean;
  status: RouteExecutionStatus;
  execution_kind: RouteExecutionKind;
  route: string;
  command: string | null;
  exit_code: number | null;
  nested_mission_id: string | null;
  stdout_tail?: string;
  stderr_tail?: string;
  steps?: RunRouteStep[];
  trust_status?: string;
  blockers: string[];
  unverified: string[];
  next_action: string;
}

export interface RunAutoVerification {
  schema: 'sks.run-auto-verification.v1';
  ok: boolean;
  trust_validate: CommandTail;
  status: CommandTail;
}

export interface CommandTail {
  command: string;
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
}

export interface RunResult {
  schema: 'sks.run.v2';
  ok: boolean;
  mission_id: string;
  route: string;
  mode: RunMode;
  route_execution?: RouteExecutionStatus;
  status: string;
  trust_status?: string;
  classification: RunClassification;
  execution?: RunRouteExecution;
  auto_verification?: RunAutoVerification | null;
  completion_proof?: string | { ok: boolean; validation?: unknown };
  trust_report?: string | TrustReportLike;
  next_action?: string;
}

interface RouteSelection {
  id: string;
  command: string;
  description?: string;
}

interface ExecuteRunContext {
  id: string;
  dir: string;
  route: RouteSelection;
  prompt: string;
  args: readonly string[];
  classification: RunClassification;
  auto: boolean;
}

interface PreparedRouteOptions {
  prepare: readonly string[];
  run: (missionId: string) => readonly string[];
  trustStatus: string;
  executionKind: RouteExecutionKind;
}

interface RouteExecutionOptions {
  nestedMissionId?: string | null;
  steps?: RunRouteStep[];
  okStatus?: RouteExecutionStatus;
  trustStatus?: string;
  unverified?: string[];
  executionKind?: RouteExecutionKind;
}

interface FinalizeResult {
  ok: boolean;
  proof?: {
    status?: string;
  };
  validation?: unknown;
}

interface TrustReportLike {
  status: string;
  ok?: boolean;
  issues?: string[];
  [key: string]: unknown;
}

export async function runCommand(args: readonly string[] = []): Promise<RunResult | void> {
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
    implementation_allowed: true,
  });
  const execute = flag(args, '--execute') || flag(args, '--auto');
  const auto = flag(args, '--auto');
  const mode = runMode(args);
  const classification: RunClassification = {
    schema: 'sks.run-classification.v1',
    mission_id: id,
    prompt,
    route: route.command,
    reason: route.description || 'route classifier selected this SKS route',
    mock: flag(args, '--mock'),
    execute,
    auto,
    next_action: runNextAction(route, id, args),
  };
  await writeJsonAtomic(path.join(dir, 'run-classification.json'), classification);
  if (!flag(args, '--mock') && !execute) {
    const result: RunResult = {
      schema: 'sks.run.v2',
      ok: true,
      mission_id: id,
      route: route.command,
      mode,
      classification,
      status: 'prepared',
    };
    if (flag(args, '--json')) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }
    console.log(`SKS run prepared ${route.command} mission ${id}`);
    console.log(`Next: ${classification.next_action}`);
    return result;
  }
  if (execute) return executeRunRoute(root, { id, dir, route, prompt, args, classification, auto });
  return finalizeMockRun(root, { id, route, prompt, args, classification, mode });
}

async function finalizeMockRun(
  root: string,
  {
    id,
    route,
    prompt,
    args,
    classification,
    mode,
  }: Pick<ExecuteRunContext, 'id' | 'route' | 'prompt' | 'args' | 'classification'> & { mode: RunMode }
): Promise<RunResult> {
  const gate = { schema: 'sks.run-gate.v1', ok: true, passed: true, route: route.command, mock: true };
  await writeJsonAtomic(path.join(missionDir(root, id), 'run-gate.json'), gate);
  const proof = await finalizeRoute(root, {
    missionId: id,
    route: route.command,
    gateFile: 'run-gate.json',
    gate,
    artifacts: ['run-classification.json', 'run-gate.json', 'completion-proof.json'],
    mock: true,
    visual: flag(args, '--visual'),
    statusHint: 'verified_partial',
    command: { cmd: `sks run "${prompt}" --mock`, status: 0 },
  });
  const trust = await loadTrustReport(root, id);
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: proof.ok ? 'RUN_MOCK_FINALIZED' : 'RUN_MOCK_BLOCKED',
    implementation_allowed: true,
    completion_proof: 'completion-proof.json',
    trust_report: 'trust-report.json',
  });
  const result: RunResult = {
    schema: 'sks.run.v2',
    ok: proof.ok,
    mission_id: id,
    route: route.command,
    mode,
    status: proof.proof?.status || 'not_verified',
    trust_status: trust.status,
    classification,
    completion_proof: { ok: proof.ok, validation: proof.validation },
    trust_report: trust,
  };
  if (flag(args, '--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  console.log(`SKS run: ${result.status} (${route.command})`);
  console.log(`Mission: ${id}`);
  console.log(`Trust: ${trust.status}`);
  return result;
}

async function executeRunRoute(root: string, context: ExecuteRunContext): Promise<RunResult> {
  const { id, dir, route, prompt, args, classification, auto } = context;
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
    execution_kind: execution.execution_kind,
    executed_command: execution.command,
    nested_mission_id: execution.nested_mission_id,
    blockers: execution.blockers,
  };
  await writeJsonAtomic(path.join(dir, 'run-gate.json'), gate);
  const statusHint = execution.ok ? execution.trust_status || 'verified_partial' : 'blocked';
  const proof = await finalizeRoute(root, {
    missionId: id,
    route: route.command,
    gateFile: 'run-gate.json',
    gate,
    artifacts: ['run-classification.json', 'run-route-execution.json', 'run-gate.json', 'completion-proof.json'],
    statusHint,
    blockers: execution.ok ? [] : execution.blockers,
    unverified: execution.unverified,
    command: { cmd: execution.command || `sks run "${prompt}" --execute`, status: execution.exit_code ?? (execution.ok ? 0 : 2) },
  });
  const trust = await loadTrustReport(root, id);
  const autoVerification = auto ? await runAutoVerification(root, id) : null;
  const autoOk = autoVerification?.ok ?? true;
  await setCurrent(root, {
    mission_id: id,
    mode: 'RUN',
    route: route.id,
    route_command: route.command,
    phase: execution.ok && proof.ok && autoOk ? 'RUN_EXECUTE_DONE' : 'RUN_EXECUTE_BLOCKED',
    implementation_allowed: execution.ok,
    nested_mission_id: execution.nested_mission_id,
    completion_proof: 'completion-proof.json',
    trust_report: 'trust-report.json',
  });
  const result: RunResult = {
    schema: 'sks.run.v2',
    ok: execution.ok && proof.ok && autoOk,
    mission_id: id,
    route: route.command,
    mode: auto ? 'auto' : 'execute',
    route_execution: execution.status,
    status: proof.proof?.status || statusHint,
    trust_status: trust.status,
    classification,
    execution,
    auto_verification: autoVerification,
    completion_proof: `.sneakoscope/missions/${id}/completion-proof.json`,
    trust_report: `.sneakoscope/missions/${id}/trust-report.json`,
    next_action: execution.ok && autoOk ? 'inspect status or continue with route-specific follow-up' : execution.next_action,
  };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  console.log(`SKS run execute: ${result.route_execution} (${route.command})`);
  console.log(`Mission: ${id}`);
  console.log(`Trust: ${trust.status}`);
  if (!result.ok) console.log(`Next: ${result.next_action}`);
  return result;
}

async function executeRouteCommand(
  root: string,
  route: RouteSelection,
  prompt: string,
  { auto = false }: { auto?: boolean } = {}
): Promise<RunRouteExecution> {
  if (route.command === '$Image-UX-Review') {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      execution_kind: 'blocked',
      route: route.command,
      command: null,
      exit_code: 2,
      nested_mission_id: null,
      blockers: ['visual_source_or_official_capture_evidence_missing'],
      unverified: ['Visual routes require real source images plus official capture evidence when live capture is required: Codex Chrome Extension for web/browser/webapp, native Computer Use for Mac/non-web surfaces. sks run --execute will not fabricate it.'],
      next_action: 'provide the source screenshot/image evidence or complete the required official capture setup, then run the selected visual route directly',
    };
  }
  if (route.command === '$DB' && destructiveDbPrompt(prompt)) {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      execution_kind: 'blocked',
      route: route.command,
      command: 'sks db check --command <prompt>',
      exit_code: 2,
      nested_mission_id: null,
      blockers: ['destructive_db_auto_execute_blocked'],
      unverified: ['DB destructive or broad mutation prompts cannot auto-execute.'],
      next_action: 'run sks db check/classify and prepare a scoped migration-only plan',
    };
  }
  if (route.command === '$Research') {
    return executePreparedRoute(root, route, prompt, {
      prepare: ['research', 'prepare', prompt, '--json'],
      run: (missionId: string) => ['research', 'run', missionId, '--mock', '--json'],
      trustStatus: 'verified_partial',
      executionKind: 'mock_safe',
    });
  }
  if (route.command === '$QA-LOOP') {
    return executePreparedRoute(root, route, prompt, {
      prepare: ['qa-loop', 'prepare', prompt, '--json'],
      run: (missionId: string) => ['qa-loop', 'run', missionId, '--mock', '--json'],
      trustStatus: 'verified_partial',
      executionKind: 'mock_safe',
    });
  }
  const commandArgs = safeRouteExecutionArgs(route, prompt, { auto });
  const result = await runSks(root, commandArgs);
  return routeExecutionResult(route, ['sks', ...commandArgs].join(' '), result, {
    okStatus: 'completed',
    trustStatus: 'verified_partial',
    executionKind: route.command === '$DB' || route.command === '$Wiki' ? 'safe_deterministic' : 'mock_safe',
  });
}

async function runAutoVerification(root: string, missionId: string): Promise<RunAutoVerification> {
  const trust = await runSks(root, ['trust', 'validate', missionId, '--json']);
  const status = await runSks(root, ['status', '--json']);
  return {
    schema: 'sks.run-auto-verification.v1',
    ok: trust.code === 0 && status.code === 0,
    trust_validate: commandTail(`sks trust validate ${missionId} --json`, trust),
    status: commandTail('sks status --json', status),
  };
}

async function executePreparedRoute(
  root: string,
  route: RouteSelection,
  prompt: string,
  { prepare, run, trustStatus, executionKind }: PreparedRouteOptions
): Promise<RunRouteExecution> {
  const prepareResult = await runSks(root, prepare);
  const prepareCommand = ['sks', ...prepare].join(' ');
  const missionId = parseMissionId(prepareResult.stdout);
  const steps: RunRouteStep[] = [commandStep('prepare', prepareCommand, prepareResult)];
  if (prepareResult.code !== 0 || !missionId) {
    return {
      schema: 'sks.run-route-execution.v1',
      ok: false,
      status: 'blocked',
      execution_kind: 'blocked',
      route: route.command,
      command: prepareCommand,
      exit_code: prepareResult.code,
      stdout_tail: prepareResult.stdout.slice(-1200),
      stderr_tail: prepareResult.stderr.slice(-1200),
      nested_mission_id: missionId,
      steps,
      blockers: [missionId ? 'route_prepare_failed' : 'route_prepare_mission_id_missing'],
      unverified: [],
      next_action: 'inspect run-route-execution.json prepare stdout_tail/stderr_tail',
    };
  }
  const runArgs = run(missionId);
  const runResult = await runSks(root, runArgs);
  const runCommand = ['sks', ...runArgs].join(' ');
  steps.push(commandStep('run', runCommand, runResult));
  return routeExecutionResult(route, `${prepareCommand} && ${runCommand}`, runResult, {
    nestedMissionId: missionId,
    steps,
    okStatus: 'completed',
    trustStatus,
    executionKind,
    unverified: [
      'sks run --execute prepared and ran the selected route through its CLI; mock-safe fixtures do not claim live external source or UI coverage.',
    ],
  });
}

async function runSks(root: string, commandArgs: readonly string[]): Promise<RunProcessResult> {
  const packedBin = new URL('../../bin/sks.js', import.meta.url).pathname;
  const sourceBin = new URL('../../../bin/sks.js', import.meta.url).pathname;
  const entrypoint = (await exists(packedBin)) ? packedBin : sourceBin;
  return runProcess(process.execPath, [entrypoint, ...commandArgs], {
    cwd: root,
    timeoutMs: 180_000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
  });
}

function routeExecutionResult(
  route: RouteSelection,
  command: string,
  result: RunProcessResult,
  options: RouteExecutionOptions = {}
): RunRouteExecution {
  const nestedMissionId = parseMissionId(result.stdout);
  const ok = result.code === 0;
  const execution: RunRouteExecution = {
    schema: 'sks.run-route-execution.v1',
    ok,
    status: ok ? (options.okStatus || 'completed') : 'blocked',
    execution_kind: ok ? (options.executionKind || 'safe_deterministic') : 'blocked',
    route: route.command,
    command,
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-1200),
    stderr_tail: result.stderr.slice(-1200),
    nested_mission_id: options.nestedMissionId || nestedMissionId,
    trust_status: ok ? options.trustStatus || 'verified_partial' : 'blocked',
    blockers: ok ? [] : ['route_command_failed'],
    unverified: ok
      ? options.unverified || ['sks run --execute used the deterministic safe route command path; real external dependencies remain route-specific.']
      : [],
    next_action: ok ? 'review completion proof and trust report' : 'inspect run-route-execution.json stderr_tail',
  };
  if (options.steps) execution.steps = options.steps;
  return execution;
}

function classifyRunRoute(prompt: string, args: readonly string[]): RouteSelection {
  if (flag(args, '--visual')) return requireRoute(routePrompt('$Image-UX-Review'));
  if (flag(args, '--research')) return requireRoute(routePrompt('$Research'));
  if (flag(args, '--db')) return requireRoute(routePrompt('$DB'));
  const route = requireRoute(routePrompt(prompt));
  return route.command === '$SKS' ? requireRoute(routePrompt('$Team')) : route;
}

function runNextAction(route: RouteSelection, id: string, args: readonly string[]): string {
  if (flag(args, '--mock')) return 'mock run finalizes immediately for release fixture evidence';
  if (flag(args, '--execute') || flag(args, '--auto')) return 'execute selected safe route command and write completion proof/trust report';
  if (route.command === '$Research') return `sks research run ${id} --json`;
  if (route.command === '$QA-LOOP') return `sks qa-loop run ${id} --json`;
  return `continue ${route.command} mission ${id} through the selected SKS route`;
}

function safeRouteExecutionArgs(route: RouteSelection, prompt: string, { auto = false }: { auto?: boolean } = {}): string[] {
  if (route.command === '$DB') return ['db', 'check', '--sql', 'SELECT 1', '--json'];
  if (route.command === '$Wiki') return ['wiki', 'refresh', '--json'];
  return ['team', prompt, '--mock', '--json', ...(auto ? ['--no-open-zellij'] : [])];
}

function destructiveDbPrompt(prompt = ''): boolean {
  return /\b(drop|truncate|delete\s+from|update\s+\w+\s+set|reset|db\s+push|disable\s+rls)\b/i.test(prompt);
}

function parseMissionId(text = ''): string | null {
  try {
    const parsed = JSON.parse(text) as { mission_id?: unknown; proof?: { proof?: { mission_id?: unknown } } };
    const nested = parsed.proof?.proof?.mission_id;
    const value = parsed.mission_id || nested;
    return typeof value === 'string' ? value : null;
  } catch {
    return text.match(/\bM-\d{8}-\d{6}-[a-f0-9]{4}\b/)?.[0] || null;
  }
}

function requireRoute(value: unknown): RouteSelection {
  if (!value || typeof value !== 'object') throw new Error('SKS route classifier returned no route');
  const route = value as { id?: unknown; command?: unknown; description?: unknown };
  if (typeof route.id !== 'string' || typeof route.command !== 'string') {
    throw new Error('SKS route classifier returned an invalid route');
  }
  const selection: RouteSelection = {
    id: route.id,
    command: route.command,
  };
  if (typeof route.description === 'string') selection.description = route.description;
  return selection;
}

function runMode(args: readonly string[]): RunMode {
  if (flag(args, '--auto')) return 'auto';
  if (flag(args, '--execute')) return 'execute';
  if (flag(args, '--mock')) return 'mock';
  return 'prepare';
}

function commandStep(label: string, command: string, result: RunProcessResult): RunRouteStep {
  return {
    label,
    command,
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-1200),
    stderr_tail: result.stderr.slice(-1200),
  };
}

function commandTail(command: string, result: RunProcessResult): CommandTail {
  return {
    command,
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-1200),
    stderr_tail: result.stderr.slice(-1200),
  };
}

async function finalizeRoute(root: string, options: Record<string, unknown>): Promise<FinalizeResult> {
  return maybeFinalizeRoute(root, options) as Promise<FinalizeResult>;
}

async function loadTrustReport(root: string, missionId: string): Promise<TrustReportLike> {
  const report = await latestTrustReport(root, missionId);
  if (report && typeof report === 'object' && 'status' in report) return report as TrustReportLike;
  return { status: 'not_verified', ok: false, issues: ['trust_report_invalid'] };
}
