import { runEvaluate, runBenchmark } from '../core/local-decision/cli-evaluate.js'
import {
  runInspect, runInstall, runMode, runStart, runStop, runUninstall, statusReport
} from '../core/local-decision/cli-lifecycle.js'
import { EXIT_FAILURE, EXIT_USAGE, SUBCOMMANDS, UsageError, output, type Parsed, type Subcommand } from '../core/local-decision/cli-shared.js'
import { printJson } from '../cli/output.js'

export { UsageError }

const OPTION_SPEC: Record<Subcommand, { booleans: readonly string[]; values: readonly string[]; positionals: number }> = {
  status: { booleans: ['--json'], values: [], positionals: 0 },
  inspect: { booleans: ['--json'], values: ['--model', '--revision'], positionals: 0 },
  install: { booleans: ['--json', '--accept-license', '--yes'], values: ['--model', '--revision', '--python'], positionals: 0 },
  start: { booleans: ['--json'], values: ['--timeout-seconds'], positionals: 0 },
  stop: { booleans: ['--json'], values: [], positionals: 0 },
  mode: { booleans: ['--json'], values: ['--sample-rate'], positionals: 1 },
  evaluate: { booleans: ['--json'], values: ['--kind', '--input', '--timeout-ms'], positionals: 0 },
  benchmark: { booleans: ['--json'], values: ['--dataset', '--output', '--timeout-ms'], positionals: 0 },
  uninstall: { booleans: ['--json', '--yes'], values: [], positionals: 0 }
}

export function parseDecisionArgs(args: readonly string[]): Parsed {
  const [first, ...rest] = args.map(String)
  if (!first || first === '--help' || first === '-h' || first === 'help') throw new UsageError('help')
  if (!SUBCOMMANDS.includes(first as Subcommand)) throw new UsageError(`unknown subcommand: ${first}`)
  const subcommand = first as Subcommand
  const spec = OPTION_SPEC[subcommand]
  const flags = new Set<string>()
  const values = new Map<string, string>()
  const positionals: string[] = []
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!
    if (arg.startsWith('--')) {
      const [name, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
      if (spec.booleans.includes(name)) {
        if (inline !== undefined) throw new UsageError(`flag takes no value: ${name}`)
        flags.add(name)
        continue
      }
      if (spec.values.includes(name)) {
        const value = inline !== undefined ? inline : rest[index + 1]
        if (value === undefined || value.startsWith('--')) throw new UsageError(`missing value for ${name}`)
        if (values.has(name)) throw new UsageError(`duplicate option: ${name}`)
        values.set(name, value)
        if (inline === undefined) index += 1
        continue
      }
      throw new UsageError(`unknown option for ${subcommand}: ${name}`)
    }
    positionals.push(arg)
  }
  if (positionals.length > spec.positionals) throw new UsageError(`unexpected argument: ${positionals[spec.positionals]}`)
  return { subcommand, flags, values, positionals }
}

export function usage(_command = 'decision'): string {
  return [
    'Usage: sks decision <subcommand> [options]',
    '',
    'Optional local decision provider (labs). Default mode is off: no process, model, or',
    'download exists until you run install and start explicitly. Advice is non-authoritative',
    'and never changes the model, counts, effort, gates, or evidence.',
    '',
    '  status [--json]                                   installation, mode and service state (no download, no inference)',
    '  inspect --model <repo> [--revision <sha>] [--json] online metadata only: files, size, license, resolved revision',
    '  install --model <repo> --revision <sha> --accept-license --yes [--python <path>] [--json]',
    '                                                    explicit venv + pinned snapshot install (network)',
    '  start [--timeout-seconds N] [--json]              load the model, run warm-up, verify readiness',
    '  mode off|shadow|advisory [--sample-rate R] [--json]',
    '  stop [--json]                                     stop the owned broker and worker',
    '  evaluate --kind planning|recovery --input <file> [--timeout-ms N] [--json]',
    '  benchmark --dataset <file> --output <dir> [--json]',
    '  uninstall --yes [--json]                          remove only the SKS-owned inventory',
    '',
    'Example flow (the revision comes from inspect; never type a placeholder):',
    '  sks decision inspect --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --json',
    '  sks decision install --model mlx-community/Qwen2.5-1.5B-Instruct-4bit --revision <resolvedRevision> --accept-license --yes --json',
    '  sks decision start --json && sks decision mode shadow --json',
    '  sks decision mode advisory --json   # later: sks decision mode off --json; sks decision stop --json',
    '',
    'Exit codes: 0 ok, 1 unavailable or failed, 2 usage error.'
  ].join('\n')
}

export async function runDecisionCommand(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let parsed: Parsed
  try {
    parsed = parseDecisionArgs(args)
  } catch (error: unknown) {
    const message = error instanceof UsageError ? error.message : String(error)
    if (message !== 'help') console.error(`error: ${message}\n`)
    console.log(usage())
    return message === 'help' ? 0 : EXIT_USAGE
  }
  try {
    switch (parsed.subcommand) {
      case 'status': {
        const report = await statusReport(env)
        output(report, parsed.flags.has('--json'), () => [
          `mode: ${report.mode}  installed: ${report.installed}  service: ${report.service.running ? (report.service.ready ? 'ready' : 'running (not ready)') : 'stopped'}`,
          `platform: ${report.platform.supported ? 'supported' : report.platform.reason}`,
          ...(report.install ? [`model: ${report.install.modelId}@${report.install.modelRevision} (${report.install.quantization}) realModelVerified=${report.readiness?.realModelVerified === true && report.readiness.receiptMatches}`] : [])
        ])
        return 0
      }
      case 'inspect': return await runInspect(parsed)
      case 'install': return await runInstall(parsed, env)
      case 'start': return await runStart(parsed, env)
      case 'stop': return await runStop(parsed, env)
      case 'mode': return await runMode(parsed, env)
      case 'evaluate': return await runEvaluate(parsed, env)
      case 'benchmark': return await runBenchmark(parsed, env)
      case 'uninstall': return await runUninstall(parsed, env)
    }
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}\n`)
      console.log(usage())
      return EXIT_USAGE
    }
    const message = error instanceof Error ? error.message : String(error)
    if (parsed.flags.has('--json')) printJson({ ok: false, error: message }, { failureExitCode: false })
    else console.error(`error: ${message}`)
    return EXIT_FAILURE
  }
}

export async function run(_command: string, args: string[] = []): Promise<void> {
  const code = await runDecisionCommand(args)
  if (code !== 0) process.exitCode = code
}
