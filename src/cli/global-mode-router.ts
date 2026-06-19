export type GlobalMode =
  | { readonly kind: 'mad-glm'; readonly args: string[] }
  | { readonly kind: 'glm-without-mad'; readonly args: string[] };

const RESERVED_COMMANDS = new Set(['help', '--help', '-h', 'version', '--version', '-v']);

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
