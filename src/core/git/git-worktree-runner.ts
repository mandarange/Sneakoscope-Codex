import { runProcess, type RunProcessOptions, type RunProcessResult } from '../fsx.js'

export interface GitCommandResult {
  ok: boolean
  code: number | null
  args: string[]
  cwd: string
  stdout: string
  stderr: string
  stdout_tail: string
  stderr_tail: string
  timed_out: boolean
}

export async function runGitCommand(cwd: string, args: string[], opts: {
  timeoutMs?: number
  input?: string
  allowFailure?: boolean
} = {}): Promise<GitCommandResult> {
  const processOptions: RunProcessOptions = {
    cwd,
    timeoutMs: opts.timeoutMs ?? 30000,
    maxOutputBytes: 512 * 1024
  }
  if (opts.input !== undefined) processOptions.input = opts.input
  const result = await runProcess('git', args, processOptions)
  return normalizeGitResult(cwd, args, result)
}

export function normalizeGitResult(cwd: string, args: string[], result: RunProcessResult): GitCommandResult {
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  return {
    ok: result.code === 0,
    code: result.code,
    args,
    cwd,
    stdout,
    stderr,
    stdout_tail: stdout.slice(-4000),
    stderr_tail: stderr.slice(-4000),
    timed_out: result.timedOut
  }
}

export function gitOutputLine(result: GitCommandResult): string {
  return String(result.stdout || '').split(/\r?\n/).find((line) => line.trim())?.trim() || ''
}

export function gitBlocker(prefix: string, result: GitCommandResult): string {
  const combined = [result.stderr_tail || result.stderr, result.stdout_tail || result.stdout]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
  const detail = combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-3).join(' | ')
  const meta = `code=${result.code ?? 'null'} timed_out=${result.timed_out ? '1' : '0'} args=${result.args.join(' ')}`
  return detail ? `${prefix}:${meta}:${detail.slice(0, 320)}` : `${prefix}:${meta}`
}
