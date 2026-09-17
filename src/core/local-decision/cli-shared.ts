import { printJson } from '../../cli/output.js'

export const EXIT_USAGE = 2
export const EXIT_FAILURE = 1
export const START_READY_TIMEOUT_SECONDS = 90
export const EXPLICIT_EVALUATE_TIMEOUT_MS = 5_000

export class UsageError extends Error {}

export const SUBCOMMANDS = ['status', 'inspect', 'install', 'start', 'stop', 'mode', 'evaluate', 'benchmark', 'uninstall'] as const
export type Subcommand = typeof SUBCOMMANDS[number]

export interface Parsed {
  subcommand: Subcommand
  flags: Set<string>
  values: Map<string, string>
  positionals: string[]
}

export function output(result: Record<string, any>, json: boolean, textLines: () => string[]): void {
  if (json) { printJson(result, { failureExitCode: false }); return }
  for (const line of textLines()) console.log(line)
}
