import fs from 'node:fs/promises'
import path from 'node:path'
import { runProcess, type RunProcessOptions } from '../fsx.js'

export const ZELLIJ_UNIX_SOCKET_PATH_LIMIT = 103

export type ZellijSocketDirSource = 'env' | 'sks_env' | 'sks_default' | 'none'

export interface ZellijProcessEnvMeta {
  zellij_socket_dir: string | null
  zellij_socket_dir_source: ZellijSocketDirSource
  zellij_socket_path_limit: number | null
}

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
  env: ZellijProcessEnvMeta
  blockers: string[]
  warnings: string[]
}

export interface ZellijRunOptions extends Pick<RunProcessOptions, 'cwd' | 'env' | 'timeoutMs' | 'maxOutputBytes' | 'stdoutFile' | 'stderrFile'> {
  optional?: boolean
}

export async function runZellij(args: readonly string[] = [], opts: ZellijRunOptions = {}): Promise<ZellijCommandResult> {
  const started = Date.now()
  const preparedEnv = await prepareZellijProcessEnv(opts.env)
  const runOpts: RunProcessOptions = {
    cwd: opts.cwd || process.cwd(),
    timeoutMs: opts.timeoutMs ?? 10000,
    maxOutputBytes: opts.maxOutputBytes ?? 64 * 1024
  }
  if (Object.keys(preparedEnv.env).length > 0) runOpts.env = preparedEnv.env
  if (opts.stdoutFile !== undefined) runOpts.stdoutFile = opts.stdoutFile
  if (opts.stderrFile !== undefined) runOpts.stderrFile = opts.stderrFile
  const result = await runProcess('zellij', args, runOpts)
  const ok = result.code === 0
  const stderr = String(result.stderr || '')
  const missing = result.code === -1 && /ENOENT|not found|spawn zellij/i.test(stderr)
  const socketPathTooLong = isZellijSocketPathTooLong(stderr)
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
    env: preparedEnv.meta,
    blockers: ok ? [] : [missing ? 'zellij_missing' : socketPathTooLong ? 'zellij_socket_path_too_long' : result.timedOut ? 'zellij_command_timeout' : 'zellij_command_failed'],
    warnings: [
      ...preparedEnv.warnings,
      ...(ok || opts.optional !== true ? [] : ['zellij_command_failed_optional'])
    ]
  }
}

export async function prepareZellijProcessEnv(envOverrides: NodeJS.ProcessEnv = {}): Promise<{ env: NodeJS.ProcessEnv; meta: ZellijProcessEnvMeta; warnings: string[] }> {
  const mergedEnv = { ...process.env, ...envOverrides }
  const meta = resolveZellijProcessEnvMeta(mergedEnv)
  const env: NodeJS.ProcessEnv = { ...envOverrides }
  const warnings: string[] = []
  if (meta.zellij_socket_dir && !env.ZELLIJ_SOCKET_DIR) env.ZELLIJ_SOCKET_DIR = meta.zellij_socket_dir
  if (meta.zellij_socket_dir) {
    try {
      await fs.mkdir(meta.zellij_socket_dir, { recursive: true, mode: 0o700 })
      await fs.chmod(meta.zellij_socket_dir, 0o700).catch(() => {})
    } catch (err: any) {
      warnings.push(`zellij_socket_dir_prepare_failed:${err?.code || err?.message || String(err)}`)
    }
  }
  return { env, meta, warnings }
}

export function resolveZellijProcessEnvMeta(env: NodeJS.ProcessEnv = process.env): ZellijProcessEnvMeta {
  const explicit = nonEmpty(env.ZELLIJ_SOCKET_DIR)
  if (explicit) return socketMeta(explicit, 'env')
  const sks = nonEmpty(env.SKS_ZELLIJ_SOCKET_DIR)
  if (sks) return socketMeta(sks, 'sks_env')
  if (process.platform === 'win32') {
    return { zellij_socket_dir: null, zellij_socket_dir_source: 'none', zellij_socket_path_limit: null }
  }
  return socketMeta(defaultZellijSocketDir(), 'sks_default')
}

export function defaultZellijSocketDir(): string {
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : 'user'
  return path.join('/tmp', `zj${uid}`)
}

export function estimateZellijSocketPathLength(socketDir: string, sessionName = ''): number {
  return path.join(socketDir, 'contract_version_1', sessionName).length
}

export function formatZellijCommand(args: readonly string[] = [], meta: ZellijProcessEnvMeta = resolveZellijProcessEnvMeta()): string {
  const command = ['zellij', ...args].map(shellQuote).join(' ')
  if (!meta.zellij_socket_dir) return command
  return `ZELLIJ_SOCKET_DIR=${shellQuote(meta.zellij_socket_dir)} ${command}`
}

export function isZellijSocketPathTooLong(text: unknown): boolean {
  return /IPC socket path is too long|socket path is too long/i.test(String(text || ''))
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

function socketMeta(socketDir: string, source: ZellijSocketDirSource): ZellijProcessEnvMeta {
  return {
    zellij_socket_dir: socketDir,
    zellij_socket_dir_source: source,
    zellij_socket_path_limit: ZELLIJ_UNIX_SOCKET_PATH_LIMIT
  }
}

function nonEmpty(value: unknown): string | null {
  const text = String(value || '').trim()
  return text ? text : null
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}
