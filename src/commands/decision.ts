import { runDecisionCommand, usage, UsageError } from '../core/decisions/cli.js'

export { UsageError, parseDecisionArgs, runDecisionCommand, usage } from '../core/decisions/cli.js'

export async function run(_command: string, args: string[] = []): Promise<void> {
  const code = await runDecisionCommand(args)
  if (code !== 0) process.exitCode = code
}
