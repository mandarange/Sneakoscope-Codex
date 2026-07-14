import { COMMANDS, type CommandEntry, type CommandName } from '../../../cli/command-registry.js';
import type {
  CommandContractRegistryValidation,
  CommandContractV2,
  CommandLatency,
  CommandRisk
} from './types.js';

type JsonObject = Record<string, unknown>;
type ArgvBuilder = (input: JsonObject) => string[];

const EMPTY_SCHEMA = objectSchema({});
const JSON_SCHEMA = objectSchema({ json: { type: 'boolean' } });

const R3_COMMANDS = new Set<CommandName>([
  'commit-and-push',
  'mad-db',
  'mad-sks',
  'uninstall'
]);

const R1_COMMANDS = new Set<CommandName>([
  'check',
  'gates',
  'release',
  'review',
  'task',
  'validate-artifacts'
]);

const R0_OVERRIDES = new Set<CommandName>([
  'proof',
  'trust'
]);

const LONG_COMMANDS = new Set<CommandName>([
  'agent', 'autoresearch', 'bench', 'check', 'computer-use', 'dfix', 'eval', 'gates',
  'glm', 'harness', 'image-ux-review', 'loop', 'mad-db', 'mad-sks', 'naruto', 'perf',
  'postinstall', 'ppt', 'qa-loop', 'recallpulse', 'release', 'research', 'run', 'task',
  'team', 'uninstall', 'update'
]);

const REMOTE_ALLOWED = new Set<CommandName>([
  'gates',
  'paths',
  'pipeline',
  'proof',
  'stats',
  'status',
  'stop-gate',
  'trust',
  'update-check',
  'validate-artifacts'
]);

const TELEGRAM_ALLOWED = new Set<CommandName>([
  'gates',
  'proof',
  'status',
  'stop-gate',
  'trust'
]);

const REQUIRED_CAPABILITIES: Partial<Record<CommandName, readonly string[]>> = {
  gates: ['project.git', 'proof.gates'],
  paths: ['project.fs.read'],
  pipeline: ['proof.pipeline'],
  proof: ['proof.read'],
  stats: ['project.fs.read'],
  status: ['proof.read'],
  'stop-gate': ['proof.stop-gate'],
  trust: ['proof.trust'],
  'update-check': ['network.npm.read'],
  'validate-artifacts': ['proof.artifacts']
};

interface ArgumentProfile {
  schema: JsonObject;
  build: ArgvBuilder;
  supportsJson: boolean;
}

const ARGUMENT_PROFILES: Partial<Record<CommandName, ArgumentProfile>> = {
  status: jsonOnly(),
  'update-check': jsonOnly(),
  paths: {
    schema: objectSchema({
      action: { type: 'string', enum: ['managed', 'git-policy'] },
      json: { type: 'boolean' }
    }),
    build: (input) => [stringValue(input.action, 'managed'), ...jsonFlag(input)],
    supportsJson: true
  },
  pipeline: {
    schema: objectSchema({
      action: { type: 'string', enum: ['status'] },
      json: { type: 'boolean' }
    }),
    build: (input) => [stringValue(input.action, 'status'), ...jsonFlag(input)],
    supportsJson: true
  },
  stats: {
    schema: objectSchema({ full: { type: 'boolean' }, json: { type: 'boolean' } }),
    build: (input) => [...booleanFlag(input, 'full', '--full'), ...jsonFlag(input)],
    supportsJson: true
  },
  'stop-gate': {
    schema: objectSchema({
      route: boundedString(1, 80),
      mission: boundedString(1, 160),
      gate: boundedString(1, 1024),
      json: { type: 'boolean' }
    }),
    build: (input) => [
      'check',
      ...valueFlag(input, 'route', '--route'),
      ...valueFlag(input, 'mission', '--mission'),
      ...valueFlag(input, 'gate', '--gate'),
      ...jsonFlag(input)
    ],
    supportsJson: true
  },
  proof: {
    schema: objectSchema({
      action: { type: 'string', enum: ['show', 'latest', 'validate', 'route'] },
      mission: boundedString(1, 160),
      completion: { type: 'boolean' },
      json: { type: 'boolean' }
    }),
    build: (input) => {
      const action = stringValue(input.action, 'show');
      const mission = typeof input.mission === 'string' && action === 'route' ? [input.mission] : [];
      return [action, ...mission, ...booleanFlag(input, 'completion', '--completion'), ...jsonFlag(input)];
    },
    supportsJson: true
  },
  trust: {
    schema: objectSchema({
      action: { type: 'string', enum: ['report', 'status', 'explain'] },
      mission: boundedString(1, 160),
      json: { type: 'boolean' }
    }),
    build: (input) => [
      stringValue(input.action, 'status'),
      ...(typeof input.mission === 'string' ? [input.mission] : []),
      ...jsonFlag(input)
    ],
    supportsJson: true
  },
  gates: {
    schema: objectSchema({
      target: boundedString(1, 120),
      mode: { type: 'string', enum: ['preset', 'gate'] },
      full: { type: 'boolean' },
      json: { type: 'boolean' }
    }),
    build: (input) => {
      const target = stringValue(input.target, 'affected');
      const selector = input.mode === 'gate' ? ['--gate', target] : ['--preset', target];
      return ['run', ...selector, ...booleanFlag(input, 'full', '--full'), ...jsonFlag(input)];
    },
    supportsJson: true
  },
  'validate-artifacts': {
    schema: objectSchema({
      mission: boundedString(1, 160),
      required: {
        type: 'array',
        items: boundedString(1, 80),
        maxItems: 32
      },
      json: { type: 'boolean' }
    }),
    build: (input) => [
      ...(typeof input.mission === 'string' ? [input.mission] : []),
      ...(Array.isArray(input.required) && input.required.length > 0 ? ['--required', input.required.join(',')] : []),
      ...jsonFlag(input)
    ],
    supportsJson: true
  }
};

function objectSchema(properties: JsonObject): JsonObject {
  return { type: 'object', properties, additionalProperties: false };
}

function boundedString(minLength: number, maxLength: number): JsonObject {
  return { type: 'string', minLength, maxLength };
}

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

function jsonOnly(): ArgumentProfile {
  return { schema: JSON_SCHEMA, build: jsonFlag, supportsJson: true };
}

function riskFor(name: CommandName, command: CommandEntry): CommandRisk {
  if (R3_COMMANDS.has(name)) return 'R3';
  if (R0_OVERRIDES.has(name) || command.readonly === true) return 'R0';
  if (R1_COMMANDS.has(name)) return 'R1';
  return 'R2';
}

function latencyFor(name: CommandName, risk: CommandRisk): CommandLatency {
  if (LONG_COMMANDS.has(name)) return 'long';
  return risk === 'R0' ? 'fast' : 'normal';
}

function maturityFor(command: CommandEntry): CommandContractV2['maturity'] {
  return command.maturity === 'beta' ? 'preview' : command.maturity;
}

function profileFor(name: CommandName): ArgumentProfile {
  return ARGUMENT_PROFILES[name] ?? {
    schema: EMPTY_SCHEMA,
    build: () => [],
    supportsJson: false
  };
}

function buildContract(name: CommandName, command: CommandEntry): CommandContractV2 {
  const profile = profileFor(name);
  const risk = riskFor(name, command);
  const remoteAllowed = REMOTE_ALLOWED.has(name) && risk !== 'R3';
  return {
    schema: 'sks.command-contract.v2',
    name,
    description: command.summary,
    maturity: maturityFor(command),
    read_only: risk === 'R0',
    risk,
    latency: latencyFor(name, risk),
    supports_json: profile.supportsJson,
    remote_allowed: remoteAllowed,
    telegram_allowed: remoteAllowed && TELEGRAM_ALLOWED.has(name),
    input_schema: profile.schema,
    argv_builder: (input: unknown) => [name, ...profile.build((input ?? {}) as JsonObject)],
    required_capabilities: [...(REQUIRED_CAPABILITIES[name] ?? [])]
  };
}

let cachedContracts: Map<CommandName, CommandContractV2> | null = null;

export function commandContracts(): Map<CommandName, CommandContractV2> {
  if (cachedContracts) return cachedContracts;
  cachedContracts = new Map(
    (Object.keys(COMMANDS) as CommandName[])
      .sort()
      .map((name) => [name, buildContract(name, COMMANDS[name])])
  );
  return cachedContracts;
}

export function commandContract(name: string): CommandContractV2 | null {
  return commandContracts().get(name as CommandName) ?? null;
}

export function validateCommandContractRegistry(): CommandContractRegistryValidation {
  const expectedNames = (Object.keys(COMMANDS) as CommandName[]).sort();
  const contracts = commandContracts();
  const observedNames = [...contracts.keys()].sort();
  const issues: string[] = [];
  for (const name of expectedNames) {
    const contract = contracts.get(name);
    if (!contract) {
      issues.push(`missing_contract:${name}`);
      continue;
    }
    if (contract.schema !== 'sks.command-contract.v2') issues.push(`invalid_schema:${name}`);
    if (contract.name !== name) issues.push(`name_mismatch:${name}`);
    if (contract.risk === 'R3' && (contract.remote_allowed || contract.telegram_allowed)) issues.push(`r3_exposed:${name}`);
    if (contract.telegram_allowed && !contract.remote_allowed) issues.push(`telegram_without_remote:${name}`);
    if (contract.input_schema.type !== 'object' || contract.input_schema.additionalProperties !== false) issues.push(`unsafe_schema:${name}`);
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
