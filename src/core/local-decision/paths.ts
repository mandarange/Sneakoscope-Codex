import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sha256 } from '../fsx.js'

/**
 * Private, user-owned paths. The runtime root lives under the SKS home
 * (`SKS_HOME` or `~/.sneakoscope`), never under a project checkout, so a
 * repository can never redirect the executable or model path. Tests inject a
 * temporary root through `env`.
 */
export const LOCAL_DECISION_DIRNAME = 'local-decision'
export const LOCAL_DECISION_CONFIG_FILENAME = 'config.json'
export const LOCAL_DECISION_RECEIPT_FILENAME = 'install-receipt.json'
export const LOCAL_DECISION_READINESS_FILENAME = 'runtime-readiness.json'
export const LOCAL_DECISION_SERVICE_METADATA_FILENAME = 'service.json'
export const LOCAL_DECISION_SHADOW_LEDGER_FILENAME = 'shadow.jsonl'
export const LOCAL_DECISION_DECISION_LEDGER_FILENAME = 'decisions.jsonl'

export interface LocalDecisionPaths {
  runtimeRoot: string
  configPath: string
  receiptPath: string
  readinessPath: string
  venvDir: string
  snapshotsDir: string
  stagingDir: string
  runtimeDir: string
  serviceMetadataPath: string
  logsDir: string
  shadowLedgerPath: string
  decisionLedgerPath: string
  workerHomeDir: string
  socketPath: string
}

export function sksHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope'))
}

export function localDecisionRuntimeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = String(env.SKS_LOCAL_DECISION_ROOT || '').trim()
  return explicit ? path.resolve(explicit) : path.join(sksHomeDir(env), LOCAL_DECISION_DIRNAME)
}

function ownerToken(): string {
  return typeof process.getuid === 'function'
    ? String(process.getuid())
    : sha256(os.userInfo().username).slice(0, 8)
}

/**
 * Unix domain socket paths are limited to ~104 bytes on macOS, so the socket
 * lives in a short per-user directory under the real /tmp and is namespaced by
 * the runtime root digest (one resident service per install root).
 */
export function localDecisionSocketDir(): string {
  const base = process.platform === 'win32' ? os.tmpdir() : fs.realpathSync.native('/tmp')
  return path.join(base, `sks-ld-${ownerToken()}`)
}

export function localDecisionSocketPath(runtimeRoot: string): string {
  return path.join(localDecisionSocketDir(), `${sha256(path.resolve(runtimeRoot)).slice(0, 16)}.sock`)
}

export function localDecisionPaths(env: NodeJS.ProcessEnv = process.env): LocalDecisionPaths {
  const runtimeRoot = localDecisionRuntimeRoot(env)
  const runtimeDir = path.join(runtimeRoot, 'runtime')
  const logsDir = path.join(runtimeRoot, 'logs')
  return {
    runtimeRoot,
    configPath: path.join(runtimeRoot, LOCAL_DECISION_CONFIG_FILENAME),
    receiptPath: path.join(runtimeRoot, LOCAL_DECISION_RECEIPT_FILENAME),
    readinessPath: path.join(runtimeRoot, LOCAL_DECISION_READINESS_FILENAME),
    venvDir: path.join(runtimeRoot, 'venv'),
    snapshotsDir: path.join(runtimeRoot, 'snapshots'),
    stagingDir: path.join(runtimeRoot, 'staging'),
    runtimeDir,
    serviceMetadataPath: path.join(runtimeDir, LOCAL_DECISION_SERVICE_METADATA_FILENAME),
    logsDir,
    shadowLedgerPath: path.join(logsDir, LOCAL_DECISION_SHADOW_LEDGER_FILENAME),
    decisionLedgerPath: path.join(logsDir, LOCAL_DECISION_DECISION_LEDGER_FILENAME),
    workerHomeDir: path.join(runtimeRoot, 'worker-home'),
    socketPath: localDecisionSocketPath(runtimeRoot)
  }
}

export class UnsafePathError extends Error {
  readonly code: string
  constructor(code: string, target: string) {
    super(`${code}:${target}`)
    this.name = 'UnsafePathError'
    this.code = code
  }
}

/** Directory must exist, be a real directory owned by the current user, and be private (0700). */
export async function ensurePrivateDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 })
  const stat = await fsp.lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UnsafePathError('unsafe_dir_type', dir)
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new UnsafePathError('unsafe_dir_owner', dir)
  if ((stat.mode & 0o077) !== 0) await fsp.chmod(dir, 0o700)
}

export function privateDirPresentSync(dir: string): boolean {
  try {
    const stat = fs.lstatSync(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return false
    if ((stat.mode & 0o077) !== 0) return false
    return true
  } catch {
    return false
  }
}

/** A regular file owned by the current user, not a symlink, readable by nobody else. */
export async function assertPrivateFile(file: string): Promise<void> {
  const stat = await fsp.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new UnsafePathError('unsafe_file_type', file)
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new UnsafePathError('unsafe_file_owner', file)
  if ((stat.mode & 0o077) !== 0) throw new UnsafePathError('unsafe_file_mode', file)
}

/** A regular file owned by the current user and not a symlink (mode may be shared, e.g. weights). */
export async function assertOwnedRegularFile(file: string): Promise<void> {
  const stat = await fsp.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new UnsafePathError('unsafe_file_type', file)
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new UnsafePathError('unsafe_file_owner', file)
}

export function isInside(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function removeSocketFileIfStale(socketPath: string): Promise<void> {
  const stat = await fsp.lstat(socketPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stat) return
  if (stat.isDirectory() && !stat.isSymbolicLink()) throw new UnsafePathError('unsafe_socket_path_directory', socketPath)
  await fsp.rm(socketPath, { force: true })
}
