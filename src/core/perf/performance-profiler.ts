import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { PACKAGE_VERSION, runProcess, writeJsonAtomic } from '../fsx.js'

export interface ProfiledCommand {
  name: string
  argv: string[]
  input?: string
}

export interface ProfiledCommandResult {
  name: string
  argv: string[]
  runs: number
  p50_ms: number
  p95_ms: number
  min_ms: number
  max_ms: number
  exit_ok: boolean
  exit_codes: Array<number | null>
}

export interface PerformanceBaselineReport {
  schema: 'sks.performance-baseline.v1'
  package_version: string
  git_head: string | null
  generated_at: string
  warmup_runs: number
  measured_runs: number
  commands: ProfiledCommandResult[]
  suspected_bottlenecks: string[]
  blockers: string[]
}

export const DEFAULT_PROFILE_COMMANDS: ProfiledCommand[] = [
  { name: 'version', argv: ['node', './dist/bin/sks.js', '--version'] },
  { name: 'commands-json', argv: ['node', './dist/bin/sks.js', 'commands', '--json'] },
  { name: 'root-json', argv: ['node', './dist/bin/sks.js', 'root', '--json'] },
  { name: 'doctor-json', argv: ['node', './dist/bin/sks.js', 'doctor', '--json'] },
  { name: 'super-search-doctor-json', argv: ['node', './dist/bin/sks.js', 'super-search', 'doctor', '--json'] },
  { name: 'dollar-commands-json', argv: ['node', './dist/bin/sks.js', 'dollar-commands', '--json'] },
  { name: 'route-status-json', argv: ['node', './dist/bin/sks.js', 'route', 'status', '--json'] },
  {
    name: 'hook-user-prompt-submit',
    argv: ['node', './dist/bin/sks.js', 'hook', 'user-prompt-submit'],
    input: JSON.stringify({ prompt: 'Answer only: ping', cwd: process.cwd() })
  },
  { name: 'naruto-help-json', argv: ['node', './dist/bin/sks.js', 'naruto', 'help', '--json'] }
]

export const DEFAULT_SUSPECTED_BOTTLENECKS = [
  'commands_json_imports_basic_cli_and_routes',
  'doctor_json_imports_repair_modules',
  'hook_reads_current_state_and_mission_files'
]

export async function runPerformanceProfile(root: string, commands: readonly ProfiledCommand[] = DEFAULT_PROFILE_COMMANDS, opts: {
  warmupRuns?: number
  measuredRuns?: number
  timeoutMs?: number
} = {}): Promise<PerformanceBaselineReport> {
  const warmupRuns = opts.warmupRuns ?? Number(process.env.SKS_PERF_WARMUP_RUNS || 1)
  const measuredRuns = opts.measuredRuns ?? Number(process.env.SKS_PERF_MEASURED_RUNS || 7)
  const timeoutMs = opts.timeoutMs ?? Number(process.env.SKS_PERF_TIMEOUT_MS || 30_000)
  const gitHead = await currentGitHead(root)
  const results: ProfiledCommandResult[] = []
  const blockers: string[] = []

  for (const command of commands) {
    for (let index = 0; index < warmupRuns; index++) {
      await runTimed(root, command, timeoutMs)
    }
    const runs: Array<{ code: number | null; duration_ms: number }> = []
    for (let index = 0; index < measuredRuns; index++) {
      runs.push(await runTimed(root, command, timeoutMs))
    }
    const durations = runs.map((run) => run.duration_ms).sort((a, b) => a - b)
    const exitCodes = runs.map((run) => run.code)
    const exitOk = exitCodes.every((code) => code === 0)
    if (!exitOk) blockers.push(`${command.name}:process_failed`)
    results.push({
      name: command.name,
      argv: command.argv,
      runs: measuredRuns,
      p50_ms: percentile(durations, 0.5),
      p95_ms: percentile(durations, 0.95),
      min_ms: durations[0] ?? 0,
      max_ms: durations[durations.length - 1] ?? 0,
      exit_ok: exitOk,
      exit_codes: exitCodes
    })
  }

  return {
    schema: 'sks.performance-baseline.v1',
    package_version: PACKAGE_VERSION,
    git_head: gitHead,
    generated_at: new Date().toISOString(),
    warmup_runs: warmupRuns,
    measured_runs: measuredRuns,
    commands: results,
    suspected_bottlenecks: DEFAULT_SUSPECTED_BOTTLENECKS,
    blockers: [...new Set(blockers)]
  }
}

export async function writePerformanceProfile(root: string, reportName: string, opts: {
  warmupRuns?: number
  measuredRuns?: number
  timeoutMs?: number
} = {}): Promise<PerformanceBaselineReport> {
  const report = await runPerformanceProfile(root, DEFAULT_PROFILE_COMMANDS, opts)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', reportName), report)
  return report
}

async function currentGitHead(root: string): Promise<string | null> {
  const result = await runProcess('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    timeoutMs: 5000,
    maxOutputBytes: 256
  }).catch(() => null)
  const head = result?.code === 0 ? result.stdout.trim() : ''
  return head || null
}

async function runTimed(root: string, command: ProfiledCommand, timeoutMs: number): Promise<{ code: number | null; duration_ms: number }> {
  const [bin, ...args] = command.argv
  if (!bin) return { code: -1, duration_ms: 0 }
  const started = performance.now()
  const processOpts = {
    cwd: root,
    timeoutMs,
    maxOutputBytes: 128 * 1024,
    env: {
      SKS_DISABLE_NETWORK: '1',
      SKS_DISABLE_UPDATE_CHECK: '1',
      SKS_PERF_MEASURE: '1'
    },
    ...(command.input !== undefined ? { input: command.input } : {})
  }
  const result = await runProcess(bin, args, {
    ...processOpts
  })
  return { code: result.code, duration_ms: Math.round(performance.now() - started) }
}

function percentile(values: readonly number[], pct: number): number {
  if (!values.length) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * pct) - 1))
  return values[index] ?? 0
}
