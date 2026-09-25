import fsp from 'node:fs/promises';
import path from 'node:path';
import { printJson } from '../../cli/output.js';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import { jevEnabled, readDecisionConfig, writeDecisionConfig, jevCapabilityActive } from './config.js';
import { buildEvaluationReport, type EvaluationTaskRow } from './evaluation.js';
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_DECISIONS_MODEL, requestOpenRouterDecision } from './openrouter.js';
import { buildDecisionBundle } from './questions.js';
import { RECOVERY_CAPABILITY } from './recovery.js';
import { DESIGN_DEFAULTS } from './types.js';

export const EXIT_USAGE = 2;
export const EXIT_FAILURE = 1;
export class UsageError extends Error {}

export const SUBCOMMANDS = ['status', 'enable', 'disable', 'probe', 'evaluate'] as const;
export type Subcommand = typeof SUBCOMMANDS[number];

export interface Parsed {
  subcommand: Subcommand;
  flags: Set<string>;
  values: Map<string, string>;
}

const OPTION_SPEC: Record<Subcommand, { booleans: readonly string[]; values: readonly string[] }> = {
  status: { booleans: ['--json'], values: [] },
  enable: { booleans: ['--json', '--consent-cloud'], values: ['--provider', '--model'] },
  disable: { booleans: ['--json'], values: [] },
  probe: { booleans: ['--json'], values: [] },
  evaluate: { booleans: ['--json'], values: ['--dataset', '--output'] }
};

export function parseDecisionArgs(args: readonly string[]): Parsed {
  const [first, ...rest] = args.map(String);
  if (!first || first === '--help' || first === '-h' || first === 'help') throw new UsageError('help');
  if (!SUBCOMMANDS.includes(first as Subcommand)) throw new UsageError(`unknown subcommand: ${first}`);
  const subcommand = first as Subcommand;
  const spec = OPTION_SPEC[subcommand];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (!arg.startsWith('--')) throw new UsageError(`unexpected argument: ${arg}`);
    const [name, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (spec.booleans.includes(name)) {
      if (inline !== undefined) throw new UsageError(`flag takes no value: ${name}`);
      flags.add(name);
      continue;
    }
    if (spec.values.includes(name)) {
      const value = inline !== undefined ? inline : rest[index + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`missing value for ${name}`);
      if (values.has(name)) throw new UsageError(`duplicate option: ${name}`);
      values.set(name, value);
      if (inline === undefined) index += 1;
      continue;
    }
    throw new UsageError(`unknown option for ${subcommand}: ${name}`);
  }
  return { subcommand, flags, values };
}

export function usage(): string {
  return [
    'Usage: sks decision <subcommand> [options]',
    '',
    'Optional Jev decisions through OpenRouter. Default mode is off: no network',
    'call, no model load, and no source hydration solely for Jev. A valid Jev',
    'answer is compiled into an existing SKS plan or context selection. There is',
    'no advisory mode and no second LLM judge.',
    '',
    '  status [--json]     local, non-billable readiness',
    '  enable --provider openrouter --model typesafe/jev-1.13 --consent-cloud [--json]',
    '  disable [--json]    return to the deterministic baseline',
    '  probe [--json]      explicit tiny synthetic Decisions request',
    '  evaluate --dataset <path> --output <path> [--json]',
    '',
    'Exit codes: 0 ok, 1 unavailable or failed, 2 usage error.'
  ].join('\n');
}

function output(result: Record<string, unknown>, json: boolean, textLines: () => string[]): void {
  if (json) {
    printJson(result, { failureExitCode: false });
    return;
  }
  for (const line of textLines()) console.log(line);
}

export async function runDecisionCommand(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseDecisionArgs(args);
  } catch (error: unknown) {
    const message = error instanceof UsageError ? error.message : String(error);
    if (message !== 'help') console.error(`error: ${message}\n`);
    console.log(usage());
    return message === 'help' ? 0 : EXIT_USAGE;
  }
  const json = parsed.flags.has('--json');
  try {
    switch (parsed.subcommand) {
      case 'status': {
        const report = await statusReport(env);
        output(report, json, () => [
          `mode: ${report.mode}  consent: ${report.consentCloud}  credential: ${report.credential.present ? report.credential.source : 'missing'}`,
          `model: ${report.model}  endpoint: ${report.endpoint}`,
          `capabilities: context=${report.capabilities.context.ready ? 'ready' : 'off'} plan=${report.capabilities.plan.ready ? 'ready' : 'off'} recovery=${report.capabilities.recovery.reason}`
        ]);
        return 0;
      }
      case 'enable':
        return await runEnable(parsed, env);
      case 'disable':
        return await runDisable(env, json);
      case 'probe':
        return await runProbe(env, json);
      case 'evaluate':
        return await runEvaluate(parsed, env);
    }
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}\n`);
      console.log(usage());
      return EXIT_USAGE;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (json) printJson({ ok: false, error: message }, { failureExitCode: false });
    else console.error(`error: ${message}`);
    return EXIT_FAILURE;
  }
}

export async function statusReport(env: NodeJS.ProcessEnv) {
  const config = await readDecisionConfig(env);
  const resolved = await resolveOpenRouterApiKey({ env });
  const nextStep = !resolved.key
    ? 'missing_key'
    : !jevEnabled(config)
      ? 'enable'
      : 'ready';
  return {
    schema: 'sks.jev-decision-status.v1',
    ok: true,
    mode: config.mode,
    provider: config.provider,
    model: config.model,
    endpoint: OPENROUTER_DECISIONS_ENDPOINT,
    consentCloud: config.consentCloud,
    credential: {
      present: Boolean(resolved.key),
      source: resolved.source,
      preview: resolved.key_preview
    },
    // What Jev actually decides in this mode (derived), not stored flags.
    capabilities: {
      context: { ...config.capabilities.context, ready: jevCapabilityActive(config, 'context') },
      plan: { ...config.capabilities.plan, ready: jevCapabilityActive(config, 'plan') },
      recovery: config.capabilities.recovery
    },
    decision_points: jevEnabled(config)
      ? ['turn_route', 'turn_tier', 'spawn_tier', 'worker_tier', 'role_tiers', 'role_omission', 'plan', 'context', 'parent_edit_delegation', 'image_need', 'image_parameters', 'qa_effort_escalation']
      : [],
    recovery: RECOVERY_CAPABILITY,
    nextStep,
    notes: [
      'status never calls OpenRouter and never starts a service',
      'enabled Jev is consumed by official-subagent preparation: automatic plan variants and optional context',
      'recovery is unsupported: no SKS-owned ambiguous-failure handler exists'
    ],
    utilization: {
      officialSubagentPreparation: jevEnabled(config),
      planSelection: 'automatic_only',
      recovery: false
    }
  };
}

async function runEnable(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const provider = parsed.values.get('--provider');
  const model = parsed.values.get('--model');
  if (provider !== 'openrouter') throw new UsageError('--provider must be openrouter');
  if (model !== OPENROUTER_DECISIONS_MODEL) throw new UsageError(`--model must be ${OPENROUTER_DECISIONS_MODEL}`);
  if (!parsed.flags.has('--consent-cloud')) throw new UsageError('--consent-cloud is required to send bounded evidence to OpenRouter');
  const json = parsed.flags.has('--json');
  const config = await writeDecisionConfig({
    mode: 'jev',
    model,
    consentCloud: true,
    consentAt: nowIso(),
    capabilities: {
      context: { ready: true, promoted: false, reason: 'implementation_ready_not_workload_promoted' },
      plan: { ready: true, promoted: false, reason: 'implementation_ready_host_dispatch_unverified' },
      recovery: { ready: false, promoted: false, reason: RECOVERY_CAPABILITY.reason }
    }
  }, env);
  output({ schema: 'sks.jev-decision-enable.v1', ok: true, config }, json, () => [
    `enabled Jev via OpenRouter (${config.model})`,
    'context and SKS-owned plan selection are ready; recovery remains unsupported',
    'this is not a measured performance claim'
  ]);
  return 0;
}

async function runDisable(env: NodeJS.ProcessEnv, json: boolean): Promise<number> {
  const config = await writeDecisionConfig({
    mode: 'off',
    consentCloud: false,
    consentAt: null,
    capabilities: {
      context: { ready: false, promoted: false, reason: 'not_enabled' },
      plan: { ready: false, promoted: false, reason: 'not_enabled' },
      recovery: { ready: false, promoted: false, reason: RECOVERY_CAPABILITY.reason }
    }
  }, env);
  output({ schema: 'sks.jev-decision-disable.v1', ok: true, config }, json, () => [
    'mode: off'
  ]);
  return 0;
}

async function runProbe(env: NodeJS.ProcessEnv, json: boolean): Promise<number> {
  const resolved = await resolveOpenRouterApiKey({ env });
  if (!resolved.key) {
    output({ schema: 'sks.jev-decision-probe.v1', ok: false, error: 'missing_key', live: false }, json, () => [
      'probe skipped: OpenRouter key is missing'
    ]);
    return EXIT_FAILURE;
  }
  const bundle = buildDecisionBundle({
    projectId: 'probe',
    workflowRunId: 'probe',
    workflowRevision: 'probe',
    sourceDigest: 'probe',
    graphDigest: null,
    goal: 'Synthetic connectivity probe only. No repository or personal data.',
    facts: { notice: 'synthetic_probe' },
    recoveryCandidates: [{
      id: 'failed',
      summary: 'The recorded status is failed.',
      handlerId: 'none',
      authorized: true,
      readOnly: true
    }, {
      id: 'passed',
      summary: 'The recorded status is passed.',
      handlerId: 'none',
      authorized: true,
      readOnly: true
    }],
    recoveryDiagnostic: 'A synthetic test failed.'
  });
  bundle.request.state = {
    notice: 'Synthetic connectivity probe only. No repository or personal data.',
    status: 'failed',
    diagnostic: 'A synthetic test failed.'
  };
  bundle.request.questions = {
    status: {
      type: 'choice',
      instructions: 'Which status is explicitly recorded in state.status?',
      criteria: {
        passed: 'The recorded status is passed.',
        failed: 'The recorded status is failed.'
      }
    },
    has_failure: {
      type: 'noul',
      instructions: 'Does state.diagnostic explicitly describe a failure?'
    },
    severity: {
      type: 'score',
      instructions: 'How directly does state.diagnostic state a failure?',
      criteria: [
        'No failure is stated.',
        'A failure is implied but not explicit.',
        'A failure is explicitly stated.'
      ]
    }
  };
  const started = Date.now();
  const result = await requestOpenRouterDecision(bundle, { env, deadlineMs: DESIGN_DEFAULTS.deadlineMs });
  const receipt = {
    schema: 'sks.jev-decision-probe.v1',
    live: result.ok,
    ok: result.ok,
    endpoint: OPENROUTER_DECISIONS_ENDPOINT,
    requestedModel: OPENROUTER_DECISIONS_MODEL,
    responseModel: result.ok ? result.resolvedModel : null,
    timestamp: nowIso(),
    httpStatus: result.ok ? 200 : result.status,
    reason: result.ok ? 'connected' : result.reason,
    usage: result.ok ? result.usage : result.usage,
    elapsedMs: Date.now() - started,
    evidenceLevel: result.ok ? 'live_protocol' : 'failed_probe',
    note: 'A 200 response is connectivity evidence, not SKS task accuracy or a privacy audit.'
  };
  output(receipt, json, () => [
    result.ok
      ? `probe ok · model ${receipt.responseModel} · ${receipt.elapsedMs}ms`
      : `probe failed · ${receipt.reason}`
  ]);
  return result.ok ? 0 : EXIT_FAILURE;
}

async function runEvaluate(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const dataset = parsed.values.get('--dataset');
  const outputPath = parsed.values.get('--output');
  if (!dataset || !outputPath) throw new UsageError('--dataset and --output are required');
  const json = parsed.flags.has('--json');
  let rows: EvaluationTaskRow[] = [];
  try {
    const raw = JSON.parse(await fsp.readFile(dataset, 'utf8'));
    rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : [];
  } catch {
    throw new UsageError('invalid JSON dataset');
  }
  const report = buildEvaluationReport({
    rows,
    evidenceLevel: 'synthetic',
    live: false
  });
  await fsp.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeJsonAtomic(path.resolve(outputPath), report, { mode: 0o600 });
  output({ schema: 'sks.jev-decision-evaluate.v1', ok: true, reportPath: outputPath, report }, json, () => [
    `wrote ${outputPath}`,
    `tasks: ${report.taskCount}  live: ${report.live}`,
    ...(report.unavailableReasons.length ? [`unavailable: ${report.unavailableReasons.join(', ')}`] : [])
  ]);
  return 0;
}
