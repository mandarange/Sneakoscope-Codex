import { runProcess, type RunProcessOptions } from '../fsx.js'

export interface ZellijCommandResult {
  ok: boolean
  command: 'zellij'
  args: string[]
  cwd: string
  exit_code: number | null
  stdout_tail: string
  stderr_tail: string
  stdout_bytes: number
  stderr_bytes: number
  timed_out: boolean
  duration_ms: number
  blockers: string[]
  warnings: string[]
}

export interface ZellijRunOptions extends Pick<RunProcessOptions, 'cwd' | 'env' | 'timeoutMs' | 'maxOutputBytes' | 'stdoutFile' | 'stderrFile'> {
  optional?: boolean
}

export async function runZellij(args: readonly string[] = [], opts: ZellijRunOptions = {}): Promise<ZellijCommandResult> {
  const started = Date.now()
  const runOpts: RunProcessOptions = {
    cwd: opts.cwd || process.cwd(),
    timeoutMs: opts.timeoutMs ?? 10000,
    maxOutputBytes: opts.maxOutputBytes ?? 64 * 1024
  }
  if (opts.env !== undefined) runOpts.env = opts.env
  if (opts.stdoutFile !== undefined) runOpts.stdoutFile = opts.stdoutFile
  if (opts.stderrFile !== undefined) runOpts.stderrFile = opts.stderrFile
  const result = await runProcess('zellij', args, runOpts)
  const ok = result.code === 0
  const stderr = String(result.stderr || '')
  const missing = result.code === -1 && /ENOENT|not found|spawn zellij/i.test(stderr)
  return {
    ok,
    command: 'zellij',
    args: [...args],
    cwd: opts.cwd || process.cwd(),
    exit_code: result.code,
    stdout_tail: String(result.stdout || '').slice(-8192),
    stderr_tail: stderr.slice(-8192),
    stdout_bytes: result.stdoutBytes,
    stderr_bytes: result.stderrBytes,
    timed_out: result.timedOut,
    duration_ms: Date.now() - started,
    blockers: ok ? [] : [missing ? 'zellij_missing' : result.timedOut ? 'zellij_command_timeout' : 'zellij_command_failed'],
    warnings: ok || opts.optional !== true ? [] : ['zellij_command_failed_optional']
  }
}

export function parseZellijVersionText(text: unknown): string | null {
  const match = String(text || '').match(/\b(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.-]+)?\b/)
  return match?.[1] ?? null
}

export function compareVersionLike(a: unknown, b: unknown): number {
  const pa = versionParts(a)
  const pb = versionParts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    const left = pa[i] ?? 0
    const right = pb[i] ?? 0
    if (left > right) return 1
    if (left < right) return -1
  }
  return 0
}

function versionParts(value: unknown): number[] {
  const parsed = parseZellijVersionText(value) || String(value || '0.0.0')
  return parsed.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)
}
