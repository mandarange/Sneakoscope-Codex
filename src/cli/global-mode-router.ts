export type GlobalMode =
  | { readonly kind: 'mad-glm'; readonly args: string[] }
  | { readonly kind: 'glm-without-mad'; readonly args: string[] };

const RESERVED_COMMANDS = new Set(['help', '--help', '-h', 'version', '--version', '-v']);
const RETIRED_AGENT_OPTION = ['--', 'agent'].join('');

const RETIRED_GLOBAL_EXECUTION_OPTION_NAMES = new Set([
  '--naruto',
  RETIRED_AGENT_OPTION,
  '--clones',
  '--mad-db',
  '--mad-native-swarm',
  '--mad-swarm',
  '--no-swarm',
  '--no-mad-swarm',
  '--mad-agents',
  '--mad-swarm-agents',
  '--mad-swarm-work-items',
  '--mad-swarm-backend',
  '--mad-swarm-prompt',
  '--tmux-smoke',
  '--require-tmux-smoke'
]);

export function detectGlobalMode(args: readonly string[] = []): GlobalMode | null {
  if (!args.length || RESERVED_COMMANDS.has(String(args[0]))) return null;
  const hasMad = args.includes('--mad');
  const hasGlm = args.includes('--glm');
  if (hasMad && hasGlm) return { kind: 'mad-glm', args: stripGlobalModeFlags(args) };
  if (hasGlm && !hasMad && String(args[0]).startsWith('-')) {
    return { kind: 'glm-without-mad', args: stripGlobalModeFlags(args) };
  }
  return null;
}

export function stripGlobalModeFlags(args: readonly string[]): string[] {
  return args.filter((arg) => arg !== '--mad' && arg !== '--glm');
}

export function findRetiredGlobalExecutionArgumentErrors(args: readonly string[] = []): string[] {
  const errors: string[] = [];
  for (const value of args) {
    const arg = String(value);
    const separator = arg.indexOf('=');
    const name = separator >= 0 ? arg.slice(0, separator) : arg;
    if (RETIRED_GLOBAL_EXECUTION_OPTION_NAMES.has(name)) errors.push(`unsupported_argument:${name}`);
  }
  return [...new Set(errors)];
}

export interface GlobalModeBlockedResult {
  readonly ok: false;
  readonly status: 'blocked';
  readonly mode: 'glm';
  readonly reason: 'glm_requires_mad';
  readonly hint: 'use sks --mad --glm';
}

export function glmWithoutMadResult(): GlobalModeBlockedResult {
  return {
    ok: false,
    status: 'blocked',
    mode: 'glm',
    reason: 'glm_requires_mad',
    hint: 'use sks --mad --glm'
  };
}
