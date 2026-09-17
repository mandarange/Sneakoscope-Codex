import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nowIso, randomId, sha256, writeJsonAtomic } from '../fsx.js'
import { ensurePrivateDir, isInside, localDecisionPaths, type LocalDecisionPaths } from './paths.js'
import { LOCAL_DECISION_ENGINE_ORIGIN, LOCAL_DECISION_ENGINE_VERSION, readInstallReceipt } from './receipt.js'
import type { ModelInstallReceipt } from './types.js'
import {
  COMMIT_SHA_RE,
  InstallError,
  LICENSE_FILES,
  PYTHON_CANDIDATES,
  SUPPORTED_MODEL_TYPES,
  SUPPORTED_PYTHON_MINOR,
  TOKENIZER_FILES,
  UPSTREAM_ENGINE_REFERENCE,
  inspectLocalDecisionModel,
  quantizationLabel,
  type InspectDeps
} from './install-inspect.js'

export {
  COMMIT_SHA_RE, HF_API_BASE, InstallError, PYTHON_CANDIDATES, RECOMMENDED_WEIGHTS_MODEL_ID, RECOMMENDED_WEIGHTS_SOURCE, SUPPORTED_MODEL_TYPES, SUPPORTED_PYTHON_MINOR, TOKENIZER_FILES,
  UPSTREAM_ENGINE_REFERENCE, classifyRepo, inspectLocalDecisionModel, installCommandFor
} from './install-inspect.js'
export type { HfSibling, InspectDeps, InspectResult } from './install-inspect.js'

const MAX_SAFETENSORS_HEADER_BYTES = 100 * 1024 * 1024

// ---------------------------------------------------------------------------
// Install

export interface ProcessResult { code: number | null; stdout: string; stderr: string }
export type ProcessRunner = (file: string, args: string[], options: { env: Record<string, string>; cwd?: string; timeoutMs?: number }) => Promise<ProcessResult>

export interface InstallDeps extends InspectDeps {
  run?: ProcessRunner
  /** Overrides interpreter discovery (tests inject a fake interpreter). */
  pythonPath?: string
  /** Skips the pip step when the injected interpreter cannot install wheels (tests only). */
  skipPip?: boolean
  ownerUid?: number
  packageSourceDir?: string
  lockPath?: string
}

export interface InstallOptions {
  modelId: string
  revision: string
  acceptLicense: true
  runtimeRoot: string
  env?: NodeJS.ProcessEnv
  deps?: InstallDeps
  onProgress?: (step: string, detail?: Record<string, unknown>) => void
}

export function defaultProcessRunner(): ProcessRunner {
  return (file, args, options) => new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: options.env, cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    child.stderr?.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-64 * 1024) })
    const timer = options.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs) : null
    child.once('error', (error) => { if (timer) clearTimeout(timer); reject(error) })
    child.once('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}

export function packageSourceDir(): string {
  // dist/core/local-decision/install.js -> <package root>/python/local_decision
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'python', 'local_decision')
}

export function installEnvironment(env: NodeJS.ProcessEnv, stagingDir: string): Record<string, string> {
  const out: Record<string, string> = {
    PATH: env.PATH || '/usr/bin:/bin',
    HOME: path.join(stagingDir, 'home'),
    TMPDIR: path.join(stagingDir, 'tmp'),
    HF_HOME: path.join(stagingDir, 'hf-home'),
    HF_HUB_DISABLE_TELEMETRY: '1',
    PIP_CACHE_DIR: path.join(stagingDir, 'pip-cache'),
    PIP_NO_INPUT: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8'
  }
  // Install-time only: a proxy or a Hub token may be needed to fetch; the
  // resident worker never receives either.
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'HF_TOKEN', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE']) {
    if (env[key]) out[key] = String(env[key])
  }
  return out
}

async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
  })
}

/** sha256 over `name\0sha256(file)\n` for the sorted existing files (shared with Python snapshot.py). */
export async function digestFiles(dir: string, names: readonly string[]): Promise<string> {
  const hash = crypto.createHash('sha256')
  for (const name of [...names].sort()) {
    const file = path.join(dir, name)
    const stat = await fsp.lstat(file).catch(() => null)
    if (!stat || !stat.isFile()) continue
    hash.update(name, 'utf8')
    hash.update('\0')
    hash.update(await sha256File(file), 'ascii')
    hash.update('\n')
  }
  return hash.digest('hex')
}

export async function tokenizerDigest(dir: string): Promise<string> {
  return digestFiles(dir, TOKENIZER_FILES)
}

export async function weightManifestDigest(dir: string): Promise<string> {
  const names = (await fsp.readdir(dir)).filter((name) => name.endsWith('.safetensors') || name.endsWith('.safetensors.index.json'))
  return digestFiles(dir, names)
}

async function assertSafetensorsHeader(file: string): Promise<void> {
  const handle = await fsp.open(file, 'r')
  try {
    const prefix = Buffer.alloc(8)
    const { bytesRead } = await handle.read(prefix, 0, 8, 0)
    if (bytesRead !== 8) throw new InstallError('safetensors_header_truncated', { file })
    const headerLength = Number(prefix.readBigUInt64LE(0))
    if (!Number.isSafeInteger(headerLength) || headerLength <= 0 || headerLength > MAX_SAFETENSORS_HEADER_BYTES) throw new InstallError('safetensors_header_invalid', { file })
    const header = Buffer.alloc(headerLength)
    const read = await handle.read(header, 0, headerLength, 8)
    if (read.bytesRead !== headerLength) throw new InstallError('safetensors_header_truncated', { file })
    const parsed = JSON.parse(header.toString('utf8'))
    if (!parsed || typeof parsed !== 'object') throw new InstallError('safetensors_header_invalid', { file })
  } catch (error: unknown) {
    if (error instanceof InstallError) throw error
    throw new InstallError('safetensors_header_invalid', { file, message: error instanceof Error ? error.message : String(error) })
  } finally {
    await handle.close()
  }
}

function sanitizeSnapshotName(modelId: string, revision: string): string {
  return `${modelId.replace(/[^A-Za-z0-9._-]+/g, '__')}@${revision.slice(0, 12)}`
}

function parseJsonLine(stdout: string): any {
  const lines = stdout.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1]
  if (!last) return null
  try { return JSON.parse(last) } catch { return null }
}

async function findPython(run: ProcessRunner, env: Record<string, string>, explicit: string | undefined): Promise<{ path: string; version: string; platform: string; realpath: string }> {
  const candidates = explicit ? [explicit] : [...PYTHON_CANDIDATES]
  const failures: string[] = []
  for (const candidate of candidates) {
    const result = await run(candidate, ['-I', '-c', 'import sys,platform,os;print(sys.version_info[0],sys.version_info[1],sys.platform,platform.machine(),os.path.realpath(sys.executable))'], { env, timeoutMs: 30_000 }).catch((error: Error) => ({ code: null, stdout: '', stderr: error.message }))
    if (result.code !== 0) { failures.push(`${candidate}:${(result.stderr || '').trim().slice(0, 80)}`); continue }
    const [major, minor, platform, machine, realpath] = result.stdout.trim().split(/\s+/)
    const version = `${major}.${minor}`
    if (version !== SUPPORTED_PYTHON_MINOR) { failures.push(`${candidate}:python_${version}_unsupported`); continue }
    return { path: candidate, version, platform: `${platform}-${machine}`, realpath: realpath || candidate }
  }
  throw new InstallError('python_unavailable', { required: `CPython ${SUPPORTED_PYTHON_MINOR}`, tried: failures })
}

export async function installLocalDecisionModel(options: InstallOptions): Promise<ModelInstallReceipt> {
  if (options.acceptLicense !== true) throw new InstallError('license_not_accepted')
  if (!COMMIT_SHA_RE.test(options.revision)) throw new InstallError('revision_must_be_commit_sha', { revision: options.revision })
  const env = options.env || process.env
  const deps = options.deps || {}
  const run = deps.run || defaultProcessRunner()
  const progress = options.onProgress || (() => undefined)
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: options.runtimeRoot } as NodeJS.ProcessEnv)
  const ownerUid = deps.ownerUid ?? (typeof process.getuid === 'function' ? process.getuid() : null)

  const inspect = await inspectLocalDecisionModel(options.modelId, { revision: options.revision, deps })
  if (!inspect.compatible || inspect.kind !== 'weights' || !inspect.config) {
    throw new InstallError('model_incompatible', {
      modelId: options.modelId,
      revision: options.revision,
      kind: inspect.kind,
      blockers: inspect.blockers,
      cardMentionedRepos: inspect.cardMentionedRepos,
      note: 'No substitute model is selected automatically; pass a weights repository explicitly.'
    })
  }
  progress('inspected', { kind: inspect.kind, downloadBytes: inspect.downloadBytes })

  await ensurePrivateDir(paths.runtimeRoot)
  for (const dir of [paths.snapshotsDir, paths.stagingDir, paths.logsDir, paths.runtimeDir, paths.workerHomeDir]) await ensurePrivateDir(dir)
  const serviceRecord = await fsp.readFile(paths.serviceMetadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
  if (serviceRecord && Number.isInteger(serviceRecord.pid)) {
    try { process.kill(serviceRecord.pid, 0); throw new InstallError('service_running_stop_first', { pid: serviceRecord.pid }) } catch (error: unknown) {
      if (error instanceof InstallError) throw error
    }
  }

  const stagingDir = path.join(paths.stagingDir, `install-${Date.now().toString(36)}-${randomId(6)}`)
  await ensurePrivateDir(stagingDir)
  for (const sub of ['home', 'tmp', 'hf-home', 'pip-cache']) await ensurePrivateDir(path.join(stagingDir, sub))
  const installEnv = installEnvironment(env, stagingDir)
  const sourceDir = deps.packageSourceDir || packageSourceDir()
  const lockPath = deps.lockPath || path.join(sourceDir, 'requirements.lock')
  const lockText = await fsp.readFile(lockPath, 'utf8')
  const runtimeLockDigest = sha256(lockText)

  try {
    // 1. interpreter + virtualenv (recreated when the lock changed)
    const python = await findPython(run, installEnv, deps.pythonPath)
    progress('python', { path: python.path, version: python.version })
    const venvMarker = path.join(paths.venvDir, '.sks-lock-digest')
    const venvPython = path.join(paths.venvDir, 'bin', 'python')
    const existingMarker = await fsp.readFile(venvMarker, 'utf8').catch(() => '')
    if (existingMarker.trim() !== runtimeLockDigest || !fs.existsSync(venvPython)) {
      await fsp.rm(paths.venvDir, { recursive: true, force: true })
      const venv = await run(python.path, ['-I', '-m', 'venv', paths.venvDir], { env: installEnv, timeoutMs: 120_000 })
      if (venv.code !== 0) throw new InstallError('venv_create_failed', { stderr: venv.stderr.slice(-400) })
      if (!deps.skipPip) {
        progress('pip_install', { lock: lockPath })
        const pip = await run(venvPython, ['-I', '-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:', '--no-input', '--disable-pip-version-check', '-r', lockPath], { env: installEnv, timeoutMs: 20 * 60_000 })
        if (pip.code !== 0) throw new InstallError('pip_install_failed', { stderr: pip.stderr.slice(-800) })
      }
      await fsp.writeFile(venvMarker, `${runtimeLockDigest}\n`, { mode: 0o600 })
    }
    // 2. worker package copied into the venv (digest recorded; no build backend, no repo import path)
    const purelib = await run(venvPython, ['-I', '-c', 'import sysconfig;print(sysconfig.get_paths()["purelib"])'], { env: installEnv, timeoutMs: 30_000 })
    if (purelib.code !== 0 || !purelib.stdout.trim()) throw new InstallError('venv_purelib_unavailable', { stderr: purelib.stderr.slice(-300) })
    const packageDest = path.join(purelib.stdout.trim(), 'sks_local_decision')
    if (!isInside(paths.venvDir, packageDest)) throw new InstallError('venv_purelib_outside_venv', { packageDest })
    await fsp.rm(packageDest, { recursive: true, force: true })
    await fsp.mkdir(packageDest, { recursive: true, mode: 0o700 })
    const packageFiles = (await fsp.readdir(path.join(sourceDir, 'sks_local_decision'))).filter((name) => name.endsWith('.py')).sort()
    const packageHash = crypto.createHash('sha256')
    for (const name of packageFiles) {
      const text = await fsp.readFile(path.join(sourceDir, 'sks_local_decision', name))
      await fsp.writeFile(path.join(packageDest, name), text, { mode: 0o600 })
      packageHash.update(name).update('\0').update(sha256(text)).update('\n')
    }
    const packageDigest = packageHash.digest('hex')
    progress('package_installed', { files: packageFiles.length })

    // 3. explicit download into staging (the only networked model step)
    const snapshotStaging = path.join(stagingDir, 'snapshot')
    const download = await run(venvPython, ['-I', '-m', 'sks_local_decision.snapshot', 'download', '--repo', options.modelId, '--revision', options.revision, '--dest', snapshotStaging], { env: installEnv, cwd: stagingDir, timeoutMs: 60 * 60_000 })
    const downloadReport = parseJsonLine(download.stdout)
    if (download.code !== 0 || !downloadReport?.ok) throw new InstallError('download_failed', { error: downloadReport?.error || download.stderr.slice(-400) })
    progress('downloaded', { files: downloadReport.files?.length ?? null })

    // 4. verification: presence, ownership, no symlinks, sizes and LFS sha256 from the Hub manifest, safetensors headers
    const expectedByName = new Map(inspect.files.map((file) => [file.name, file]))
    const required = ['config.json', 'tokenizer.json']
    const entries = (await fsp.readdir(snapshotStaging, { withFileTypes: true })).filter((entry) => entry.name !== '.cache')
    const present = new Set(entries.map((entry) => entry.name))
    for (const name of required) if (!present.has(name)) throw new InstallError('snapshot_incomplete', { missing: name })
    const expectedWeights = inspect.files.filter((file) => file.name.endsWith('.safetensors')).map((file) => file.name)
    for (const name of expectedWeights) if (!present.has(name)) throw new InstallError('snapshot_incomplete', { missing: name })
    for (const entry of entries) {
      const file = path.join(snapshotStaging, entry.name)
      const stat = await fsp.lstat(file)
      if (stat.isSymbolicLink()) throw new InstallError('snapshot_symlink_rejected', { file: entry.name })
      if (!stat.isFile()) throw new InstallError('snapshot_unexpected_entry', { file: entry.name })
      if (ownerUid !== null && stat.uid !== ownerUid) throw new InstallError('snapshot_owner_mismatch', { file: entry.name })
      const expected = expectedByName.get(entry.name)
      if (expected?.size !== null && expected?.size !== undefined && stat.size !== expected.size) throw new InstallError('snapshot_size_mismatch', { file: entry.name, expected: expected.size, actual: stat.size })
      if (expected?.sha256) {
        const actual = await sha256File(file)
        if (actual !== expected.sha256) throw new InstallError('weight_digest_mismatch', { file: entry.name })
      }
      if (entry.name.endsWith('.safetensors')) await assertSafetensorsHeader(file)
      if (entry.name.endsWith('.py')) throw new InstallError('snapshot_python_source_rejected', { file: entry.name })
    }
    const configRaw = JSON.parse(await fsp.readFile(path.join(snapshotStaging, 'config.json'), 'utf8'))
    if (!SUPPORTED_MODEL_TYPES.includes(String(configRaw.model_type))) throw new InstallError('model_incompatible', { modelType: configRaw.model_type })
    const quantization = quantizationLabel(configRaw)
    const tokDigest = await tokenizerDigest(snapshotStaging)
    const weightsDigest = await weightManifestDigest(snapshotStaging)
    const licenseEvidence = entries.map((entry) => entry.name).filter((name) => LICENSE_FILES.includes(name))
    await writeJsonAtomic(path.join(snapshotStaging, 'LICENSE-EVIDENCE.json'), {
      schema: 'sks.local-decision-license-evidence.v1',
      modelId: options.modelId,
      revision: options.revision,
      license: inspect.license,
      licenseLink: inspect.licenseLink,
      baseModel: inspect.baseModel,
      acceptedAt: nowIso(),
      files: licenseEvidence
    }, { mode: 0o600 })
    progress('verified', { tokenizerDigest: tokDigest, weightManifestDigest: weightsDigest, quantization })

    // 5. atomic promotion: snapshot dir rename, then receipt replace
    const snapshotDir = path.join(paths.snapshotsDir, sanitizeSnapshotName(options.modelId, options.revision))
    const previous = await readInstallReceipt(paths).catch(() => null)
    if (fs.existsSync(snapshotDir)) {
      const existingTok = await tokenizerDigest(snapshotDir)
      const existingWeights = await weightManifestDigest(snapshotDir)
      if (existingTok !== tokDigest || existingWeights !== weightsDigest) {
        // Never overwrite a snapshot a running worker may hold; a differing
        // snapshot at the same name is promoted under a distinct directory.
        const distinct = `${snapshotDir}-${randomId(6)}`
        await fsp.rename(snapshotStaging, distinct)
        return await writeReceipt(distinct)
      }
      await fsp.rm(snapshotStaging, { recursive: true, force: true })
      return await writeReceipt(snapshotDir)
    }
    await fsp.rename(snapshotStaging, snapshotDir)
    return await writeReceipt(snapshotDir)

    async function writeReceipt(finalSnapshotDir: string): Promise<ModelInstallReceipt> {
      const receipt: ModelInstallReceipt = {
        schemaVersion: 1,
        modelId: options.modelId,
        modelRevision: options.revision,
        localSnapshotPath: finalSnapshotDir,
        tokenizerDigest: tokDigest,
        weightManifestDigest: weightsDigest,
        quantization,
        runtimeLockDigest,
        engineVersion: LOCAL_DECISION_ENGINE_VERSION,
        implementationOrigin: LOCAL_DECISION_ENGINE_ORIGIN,
        licenseEvidencePaths: [...licenseEvidence.map((name) => path.join(finalSnapshotDir, name)), path.join(finalSnapshotDir, 'LICENSE-EVIDENCE.json')],
        installedAt: nowIso(),
        realModelVerified: false,
        engineReference: { ...UPSTREAM_ENGINE_REFERENCE, sourceDigests: { ...UPSTREAM_ENGINE_REFERENCE.sourceDigests } },
        python: {
          venvPython,
          basePythonRealpath: await fsp.realpath(venvPython),
          version: python.version,
          platform: python.platform
        },
        packageDigest,
        inventory: [paths.venvDir, finalSnapshotDir, paths.receiptPath, paths.readinessPath, paths.configPath, paths.logsDir, paths.runtimeDir, paths.workerHomeDir, paths.stagingDir]
      }
      if (previous && previous.receipt.modelRevision !== options.revision) {
        progress('revision_changed', { previous: previous.receipt.modelRevision, next: options.revision })
      }
      await writeJsonAtomic(paths.receiptPath, receipt, { mode: 0o600 })
      // A previous snapshot that no receipt references anymore is left in place
      // (an explicit uninstall removes the whole inventory); it is reported.
      if (previous && previous.receipt.localSnapshotPath !== finalSnapshotDir) progress('previous_snapshot_retained', { path: previous.receipt.localSnapshotPath })
      return receipt
    }
  } finally {
    await fsp.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export interface UninstallReport {
  schema: 'sks.local-decision-uninstall.v1'
  ok: boolean
  removed: string[]
  retained: string[]
  blockers: string[]
}

/** Removes only the inventory the receipt claims, plus SKS-owned bookkeeping under the runtime root. */
export async function uninstallLocalDecision(runtimeRoot: string): Promise<UninstallReport> {
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const removed: string[] = []
  const retained: string[] = []
  const blockers: string[] = []
  const serviceRecord = await fsp.readFile(paths.serviceMetadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
  if (serviceRecord && Number.isInteger(serviceRecord.pid)) {
    let alive = false
    try { process.kill(serviceRecord.pid, 0); alive = true } catch {}
    if (alive) return { schema: 'sks.local-decision-uninstall.v1', ok: false, removed, retained, blockers: ['service_running_stop_first'] }
  }
  const found = await readInstallReceipt(paths).catch((error: Error) => { blockers.push(`receipt_unreadable:${error.message}`); return null })
  const owned = new Set<string>([
    paths.receiptPath, paths.readinessPath, paths.configPath, paths.logsDir, paths.runtimeDir, paths.workerHomeDir, paths.stagingDir, paths.venvDir, paths.snapshotsDir
  ])
  for (const entry of found?.receipt.inventory || []) owned.add(entry)
  for (const target of owned) {
    if (!isInside(paths.runtimeRoot, target)) { retained.push(target); blockers.push(`inventory_outside_root:${target}`); continue }
    const stat = await fsp.lstat(target).catch(() => null)
    if (!stat) continue
    await fsp.rm(target, { recursive: true, force: true })
    removed.push(target)
  }
  const leftovers = await fsp.readdir(paths.runtimeRoot).catch(() => [] as string[])
  for (const name of leftovers) retained.push(path.join(paths.runtimeRoot, name))
  if (leftovers.length === 0) await fsp.rmdir(paths.runtimeRoot).catch(() => undefined)
  return { schema: 'sks.local-decision-uninstall.v1', ok: blockers.length === 0, removed, retained, blockers }
}

export function localDecisionPathsForRoot(runtimeRoot: string): LocalDecisionPaths {
  return localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
}
