import {
  COMMANDS,
  type CommandEntry,
  type CommandInputProfile,
  type CommandName
} from '../../../cli/command-registry.js';
import type {
  CommandContractRegistryValidation,
  CommandContractV3,
  CommandLatency
} from './types.js';
import { commandInputSchema } from '../../../cli/command-manifest-lite.js';

type JsonObject = Record<string, unknown>;
type ArgvBuilder = (input: JsonObject) => string[];

const ARGUMENT_BUILDERS: Record<CommandInputProfile, ArgvBuilder> = {
  none: () => [],
  'json-only': jsonFlag,
  naruto: (input) => {
    const task = typeof input.prompt === 'string'
      ? input.prompt
      : typeof input.task === 'string'
        ? input.task
        : '';
    const action = stringValue(input.action, task ? 'run' : 'help');
    return [
      action,
      ...(task ? [task] : []),
      ...valueFlag(input, 'mission', '--mission'),
      ...numberFlag(input, 'agents', '--agents'),
      ...numberFlag(input, 'max_threads', '--max-threads'),
      ...booleanFlag(input, 'stdin', '--stdin'),
      ...booleanFlag(input, 'readonly', '--readonly'),
      ...booleanFlag(input, 'trusted_project', '--trusted-project'),
      ...valueFlag(input, 'auth_mode', '--auth-mode'),
      ...valueFlag(input, 'model_provider', '--model-provider'),
      ...valueFlag(input, 'provider_env_key', '--provider-env-key'),
      ...valueFlag(input, 'parent_model', '--parent-model'),
      ...valueFlag(input, 'parent_effort', '--parent-effort'),
      ...valueFlag(input, 'subagent_model', '--subagent-model'),
      ...valueFlag(input, 'subagent_effort', '--subagent-effort'),
      ...booleanFlag(input, 'no_forced_login_method', '--no-forced-login-method'),
      ...jsonFlag(input)
    ];
  },
  paths: (input) => [stringValue(input.action, 'managed'), ...jsonFlag(input)],
  'pipeline-status': (input) => [stringValue(input.action, 'status'), ...jsonFlag(input)],
  stats: (input) => [...booleanFlag(input, 'full', '--full'), ...jsonFlag(input)],
  proof: (input) => {
    const action = stringValue(input.action, 'show');
    if (action === 'trust') {
      return [
        'trust',
        stringValue(input.trust_action, 'status'),
        ...(typeof input.mission === 'string' ? [input.mission] : []),
        ...jsonFlag(input)
      ];
    }
    if (action === 'stop-gate') {
      return [
        'stop-gate',
        'check',
        ...valueFlag(input, 'route', '--route'),
        ...valueFlag(input, 'mission', '--mission'),
        ...valueFlag(input, 'gate', '--gate'),
        ...jsonFlag(input)
      ];
    }
    const mission = typeof input.mission === 'string' && action === 'route' ? [input.mission] : [];
    return [action, ...mission, ...booleanFlag(input, 'completion', '--completion'), ...jsonFlag(input)];
  }
};

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function jsonFlag(input: JsonObject): string[] {
  return input.json === true ? ['--json'] : [];
}

function booleanFlag(input: JsonObject, key: string, flag: string): string[] {
  return input[key] === true ? [flag] : [];
}

function valueFlag(input: JsonObject, key: string, flag: string): string[] {
  return typeof input[key] === 'string' ? [flag, input[key] as string] : [];
}

function numberFlag(input: JsonObject, key: string, flag: string): string[] {
  return typeof input[key] === 'number' ? [flag, String(input[key])] : [];
}

function maturityFor(command: CommandEntry): CommandContractV3['maturity'] {
  return command.maturity === 'beta' ? 'preview' : command.maturity;
}

function buildContract(name: CommandName, command: CommandEntry): CommandContractV3 {
  const build = ARGUMENT_BUILDERS[command.inputProfile];
  const r3Denied = command.risk === 'R3';
  const remoteAllowed = !r3Denied && command.remoteAllowed;
  return {
    schema: 'sks.command-contract.v3',
    name,
    description: command.summary,
    maturity: maturityFor(command),
    read_only: command.risk === 'R0',
    risk: command.risk,
    latency: command.latency,
    supports_json: command.supportsJson,
    remote_allowed: remoteAllowed,
    input_schema: commandInputSchema(command.inputProfile),
    argv_builder: (input: unknown) => [name, ...build((input ?? {}) as JsonObject)],
    required_capabilities: [...command.requiredCapabilities]
  };
}

let cachedContracts: Map<CommandName, CommandContractV3> | null = null;

export function commandContracts(): Map<CommandName, CommandContractV3> {
  if (cachedContracts) return cachedContracts;
  cachedContracts = new Map(
    (Object.keys(COMMANDS) as CommandName[])
      .sort()
      .map((name) => [name, buildContract(name, COMMANDS[name])])
  );
  return cachedContracts;
}

export function commandContract(name: string): CommandContractV3 | null {
  return commandContracts().get(name as CommandName) ?? null;
}

export function validateCommandContractRegistry(): CommandContractRegistryValidation {
  const expectedNames = (Object.keys(COMMANDS) as CommandName[]).sort();
  const contracts = commandContracts();
  const observedNames = [...contracts.keys()].sort();
  const issues: string[] = [];
  for (const name of expectedNames) {
    const command = COMMANDS[name];
    const contract = contracts.get(name);
    if (!contract) {
      issues.push(`missing_contract:${name}`);
      continue;
    }
    if (contract.schema !== 'sks.command-contract.v3') issues.push(`invalid_schema:${name}`);
    if (contract.name !== name) issues.push(`name_mismatch:${name}`);
    if (contract.risk !== command.risk) issues.push(`risk_mismatch:${name}`);
    if (contract.latency !== command.latency) issues.push(`latency_mismatch:${name}`);
    if (contract.supports_json !== command.supportsJson) issues.push(`json_support_mismatch:${name}`);
    if (command.risk === 'R3' && command.remoteAllowed) issues.push(`r3_metadata_exposed:${name}`);
    if (contract.risk === 'R3' && contract.remote_allowed) issues.push(`r3_exposed:${name}`);
    if (contract.input_schema.type !== 'object' || contract.input_schema.additionalProperties !== false) issues.push(`unsafe_schema:${name}`);
    if (command.supportsJson && command.inputProfile === 'none') issues.push(`json_support_without_input_profile:${name}`);
    if (command.inputProfile !== 'none' && !command.supportsJson) issues.push(`profile_without_json_support:${name}`);
    if (command.remoteAllowed && command.inputProfile === 'none') issues.push(`remote_without_input_profile:${name}`);
  }
  for (const name of observedNames) {
    if (!(name in COMMANDS)) issues.push(`unexpected_contract:${name}`);
  }
  return { ok: issues.length === 0, issues, expected_names: expectedNames, observed_names: observedNames };
}

export function timeoutFor(latency: CommandLatency): number {
  if (latency === 'fast') return 15_000;
  if (latency === 'normal') return 60_000;
  return 180_000;
}

export function outputCapFor(latency: CommandLatency): number {
  if (latency === 'fast') return 128 * 1024;
  if (latency === 'normal') return 512 * 1024;
  return 1024 * 1024;
}
