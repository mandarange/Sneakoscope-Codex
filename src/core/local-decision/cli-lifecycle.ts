import fsp from 'node:fs/promises'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createLocalDecisionProvider, type LocalDecisionClient } from './client.js'
import { readLocalDecisionConfig, writeLocalDecisionConfig } from './config.js'
import { InstallError, RECOMMENDED_WEIGHTS_MODEL_ID, RECOMMENDED_WEIGHTS_SOURCE, inspectLocalDecisionModel, installLocalDecisionModel, uninstallLocalDecision } from './install.js'
import { DECISION_MODES, isDecisionMode } from './mode.js'
import { localDecisionPaths, type LocalDecisionPaths } from './paths.js'
import { readInstallReceipt, verifyReceiptForStart } from './receipt.js'
import { EXIT_FAILURE, START_READY_TIMEOUT_SECONDS, UsageError, output, type Parsed } from './cli-shared.js'

export function supportedPlatform(): { supported: boolean; reason: string | null } {
  if (process.platform !== 'darwin') return { supported: false, reason: `unsupported_platform:${process.platform}` }
  if (process.arch !== 'arm64') return { supported: false, reason: `unsupported_arch:${process.arch}` }
  return { supported: true, reason: null }
}

export function clientFor(paths: LocalDecisionPaths, requestTimeoutMs = 1_500): LocalDecisionClient {
  return createLocalDecisionProvider({ socketPath: paths.socketPath, metadataPath: paths.serviceMetadataPath, connectionTimeoutMs: 50, requestTimeoutMs })
}

export async function readReadiness(paths: LocalDecisionPaths): Promise<Record<string, any> | null> {
  return fsp.readFile(paths.readinessPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
}

export async function readServiceRecord(paths: LocalDecisionPaths): Promise<Record<string, any> | null> {
  return fsp.readFile(paths.serviceMetadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
}

export function pidAlive(pid: unknown): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) return false
  try { process.kill(Number(pid), 0); return true } catch (error: unknown) { return (error as NodeJS.ErrnoException)?.code === 'EPERM' }
}

export async function statusReport(env: NodeJS.ProcessEnv) {
  const paths = localDecisionPaths(env)
  const platform = supportedPlatform()
  const config = await readLocalDecisionConfig(env)
  let receipt: Awaited<ReturnType<typeof readInstallReceipt>> = null
  let receiptError: string | null = null
  try { receipt = await readInstallReceipt(paths) } catch (error: unknown) { receiptError = error instanceof Error ? error.message : String(error) }
  const readiness = await readReadiness(paths)
  const record = await readServiceRecord(paths)
  const running = Boolean(record && pidAlive(record.pid))
  const live = running ? await clientFor(paths).status() : null
  return {
    schema: 'sks.local-decision-status.v1',
    ok: true,
    platform: { supported: platform.supported, reason: platform.reason, os: process.platform, arch: process.arch },
    runtimeRoot: paths.runtimeRoot,
    mode: config.mode,
    shadowSampleRate: config.shadowSampleRate,
    installed: receipt !== null,
    receiptError,
    install: receipt ? {
      modelId: receipt.receipt.modelId,
      modelRevision: receipt.receipt.modelRevision,
      quantization: receipt.receipt.quantization,
      engineVersion: receipt.receipt.engineVersion,
      implementationOrigin: receipt.receipt.implementationOrigin,
      installedAt: receipt.receipt.installedAt,
      realModelVerified: receipt.receipt.realModelVerified,
      runtimeLockDigest: receipt.receipt.runtimeLockDigest,
      python: receipt.receipt.python.version,
      snapshotPath: receipt.receipt.localSnapshotPath,
      receiptDigest: receipt.digest
    } : null,
    readiness: readiness ? {
      verifiedAt: readiness.verified_at,
      realModelVerified: readiness.real_model_verified === true,
      receiptMatches: receipt ? readiness.receipt_digest === receipt.digest : false,
      warmup: readiness.warmup ?? null
    } : null,
    service: {
      running,
      pid: running ? record?.pid ?? null : null,
      socketPath: paths.socketPath,
      ready: live?.ready === true,
      live
    },
    recommended: { modelId: RECOMMENDED_WEIGHTS_MODEL_ID, source: RECOMMENDED_WEIGHTS_SOURCE, appliedAutomatically: false },
    nextStep: !platform.supported ? 'unsupported' : !receipt ? 'install' : !running ? 'start' : !(live?.ready === true) ? 'wait_ready' : config.mode === 'off' ? 'choose_mode' : 'ready',
    notes: [
      'status never downloads, installs, or starts anything',
      ...(platform.supported ? [] : ['this platform cannot run the MLX worker; every SKS route keeps its baseline behaviour'])
    ]
  }
}


export async function runInspect(parsed: Parsed): Promise<number> {
  const modelId = parsed.values.get('--model')
  if (!modelId) throw new UsageError('--model is required')
  const result = await inspectLocalDecisionModel(modelId, { revision: parsed.values.get('--revision') ?? null })
  output(result, parsed.flags.has('--json'), () => [
    `model: ${result.modelId} (${result.kind})`,
    `resolved revision: ${result.resolvedRevision ?? 'unavailable'}`,
    `license: ${result.license ?? 'unknown'}  download: ${result.downloadBytes} bytes  quantization: ${result.config?.quantization ?? 'n/a'}`,
    `compatible: ${result.compatible}${result.blockers.length ? ` (${result.blockers.join(', ')})` : ''}`,
    ...(result.cardMentionedRepos.length ? [`card mentions: ${result.cardMentionedRepos.join(', ')} (not applied automatically)`] : []),
    ...(result.installCommand ? [`install: ${result.installCommand}`] : [])
  ])
  return result.compatible ? 0 : EXIT_FAILURE
}

export async function runInstall(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const modelId = parsed.values.get('--model')
  const revision = parsed.values.get('--revision')
  if (!modelId || !revision) throw new UsageError('--model and --revision are required')
  if (!parsed.flags.has('--accept-license')) throw new UsageError('--accept-license is required (read the model license first)')
  if (!parsed.flags.has('--yes')) throw new UsageError('--yes is required: install creates a virtualenv and downloads model weights')
  const platform = supportedPlatform()
  if (!platform.supported) {
    output({ ok: false, error: platform.reason }, parsed.flags.has('--json'), () => [`install refused: ${platform.reason}`])
    return EXIT_FAILURE
  }
  const paths = localDecisionPaths(env)
  const steps: Array<Record<string, unknown>> = []
  try {
    const receipt = await installLocalDecisionModel({
      modelId,
      revision,
      acceptLicense: true,
      runtimeRoot: paths.runtimeRoot,
      env,
      deps: parsed.values.has('--python') ? { pythonPath: parsed.values.get('--python')! } : {},
      onProgress: (step, detail) => steps.push({ step, ...(detail || {}) })
    })
    const result = { schema: 'sks.local-decision-install.v1', ok: true, steps, receipt }
    output(result, parsed.flags.has('--json'), () => [
      `installed ${receipt.modelId}@${receipt.modelRevision} (${receipt.quantization}) into ${receipt.localSnapshotPath}`,
      `engine ${receipt.engineVersion} origin=${receipt.implementationOrigin}; realModelVerified=${receipt.realModelVerified} (run: sks decision start)`
    ])
    return 0
  } catch (error: unknown) {
    const detail = error instanceof InstallError ? { code: error.code, ...error.detail } : { code: 'install_failed', message: error instanceof Error ? error.message : String(error) }
    output({ schema: 'sks.local-decision-install.v1', ok: false, steps, error: detail }, parsed.flags.has('--json'), () => [`install failed: ${JSON.stringify(detail)}`])
    return EXIT_FAILURE
  }
}

function entrypointPath(): string {
  return fileURLToPath(new URL('./service-entrypoint.js', import.meta.url))
}

async function waitForReady(paths: LocalDecisionPaths, timeoutMs: number): Promise<{ ready: boolean; status: any }> {
  const client = clientFor(paths)
  const deadline = Date.now() + timeoutMs
  let last: any = null
  while (Date.now() < deadline) {
    last = await client.status()
    if (last?.ready) return { ready: true, status: last }
    if (last?.circuit?.open && String(last.circuit.reason || '').startsWith('model_incompatible')) return { ready: false, status: last }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return { ready: false, status: last }
}

export async function runStart(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const json = parsed.flags.has('--json')
  const platform = supportedPlatform()
  if (!platform.supported) {
    output({ ok: false, error: platform.reason }, json, () => [`start refused: ${platform.reason}`])
    return EXIT_FAILURE
  }
  const paths = localDecisionPaths(env)
  const found = await readInstallReceipt(paths)
  if (!found) {
    output({ ok: false, error: 'model_missing', hint: 'run sks decision inspect, then sks decision install' }, json, () => ['no installed model: run sks decision install first'])
    return EXIT_FAILURE
  }
  await verifyReceiptForStart(found.receipt, paths)
  const timeoutSeconds = Number(parsed.values.get('--timeout-seconds') ?? START_READY_TIMEOUT_SECONDS)
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) throw new UsageError('--timeout-seconds must be a positive number')
  const record = await readServiceRecord(paths)
  let spawnedPid: number | null = null
  if (!(record && pidAlive(record.pid))) {
    await fsp.mkdir(paths.workerHomeDir, { recursive: true, mode: 0o700 })
    const child = spawn(process.execPath, [entrypointPath(), '--runtime-root', paths.runtimeRoot], {
      detached: true,
      stdio: 'ignore',
      env: { PATH: env.PATH || '/usr/bin:/bin', HOME: env.HOME || os.homedir(), ...(env.SKS_HOME ? { SKS_HOME: env.SKS_HOME } : {}), ...(env.SKS_LOCAL_DECISION_ROOT ? { SKS_LOCAL_DECISION_ROOT: env.SKS_LOCAL_DECISION_ROOT } : {}) }
    })
    spawnedPid = child.pid ?? null
    child.unref()
  }
  const waited = await waitForReady(paths, timeoutSeconds * 1000)
  const readiness = await readReadiness(paths)
  if (!waited.ready) {
    // Deterministic state on timeout: stop what we started rather than leaving a half-loaded service.
    if (spawnedPid) await clientFor(paths).shutdown()
    output({ schema: 'sks.local-decision-start.v1', ok: false, error: 'service_not_ready', timeoutSeconds, status: waited.status }, json, () => [`start failed: service not ready within ${timeoutSeconds}s`])
    return EXIT_FAILURE
  }
  const result = {
    schema: 'sks.local-decision-start.v1',
    ok: true,
    pid: waited.status?.worker ? (await readServiceRecord(paths))?.pid ?? spawnedPid : spawnedPid,
    socketPath: paths.socketPath,
    model: waited.status?.model ?? null,
    realModelVerified: readiness?.real_model_verified === true,
    warmup: readiness?.warmup ?? null,
    loadMs: readiness?.load_ms ?? null,
    receiptMatches: readiness?.receipt_digest === found.digest
  }
  output(result, json, () => [
    `service ready (pid ${result.pid}) model ${result.model?.modelId}@${result.model?.modelRevision}`,
    `realModelVerified=${result.realModelVerified} warmup=${JSON.stringify(result.warmup)}`
  ])
  return 0
}

async function processIdentityMatches(pid: number, runtimeRoot: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('ps', ['-p', String(pid), '-o', 'command='], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout?.on('data', (chunk) => { out += String(chunk) })
    child.on('error', () => resolve(false))
    child.on('close', () => resolve(out.includes('service-entrypoint.js') && out.includes(runtimeRoot)))
  })
}

export async function runStop(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const json = parsed.flags.has('--json')
  const paths = localDecisionPaths(env)
  const record = await readServiceRecord(paths)
  if (!record || !pidAlive(record.pid)) {
    output({ schema: 'sks.local-decision-stop.v1', ok: true, stopped: false, reason: 'not_running' }, json, () => ['service not running'])
    return 0
  }
  const pid = Number(record.pid)
  const requested = await clientFor(paths).shutdown()
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && pidAlive(pid)) await new Promise((resolve) => setTimeout(resolve, 100))
  let signalled = false
  if (pidAlive(pid)) {
    // Only a process that is verifiably our entrypoint on this runtime root is signalled.
    if (await processIdentityMatches(pid, paths.runtimeRoot)) {
      try { process.kill(pid, 'SIGTERM'); signalled = true } catch {}
      const grace = Date.now() + 5_000
      while (Date.now() < grace && pidAlive(pid)) await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  const stopped = !pidAlive(pid)
  output({ schema: 'sks.local-decision-stop.v1', ok: stopped, stopped, pid, requested, signalled }, json, () => [stopped ? `service stopped (pid ${pid})` : `service still running (pid ${pid}); identity check failed, not signalled`])
  return stopped ? 0 : EXIT_FAILURE
}

export async function runMode(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  const json = parsed.flags.has('--json')
  const requested = parsed.positionals[0]
  if (requested === undefined) {
    const current = await readLocalDecisionConfig(env)
    output({ schema: 'sks.local-decision-mode.v1', ok: true, mode: current.mode, shadowSampleRate: current.shadowSampleRate }, json, () => [`mode: ${current.mode} (shadow sample rate ${current.shadowSampleRate})`])
    return 0
  }
  if (!isDecisionMode(requested)) throw new UsageError(`mode must be one of ${DECISION_MODES.join('|')}`)
  const rate = parsed.values.has('--sample-rate') ? Number(parsed.values.get('--sample-rate')) : undefined
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > 1)) throw new UsageError('--sample-rate must be between 0 and 1')
  const next = await writeLocalDecisionConfig({ mode: requested, ...(rate === undefined ? {} : { shadowSampleRate: rate }) }, env)
  const paths = localDecisionPaths(env)
  const receipt = requested === 'off' ? null : await readInstallReceipt(paths).catch(() => null)
  const record = requested === 'off' ? null : await readServiceRecord(paths)
  const warnings = requested === 'off' ? [] : [
    ...(receipt ? [] : ['no model installed: routes keep the baseline until sks decision install and start']),
    ...(record && pidAlive(record.pid) ? [] : ['service not running: routes keep the baseline until sks decision start'])
  ]
  output({ schema: 'sks.local-decision-mode.v1', ok: true, mode: next.mode, shadowSampleRate: next.shadowSampleRate, warnings }, json, () => [`mode set to ${next.mode}`, ...warnings.map((line) => `warning: ${line}`)])
  return 0
}

export async function runUninstall(parsed: Parsed, env: NodeJS.ProcessEnv): Promise<number> {
  if (!parsed.flags.has('--yes')) throw new UsageError('--yes is required: uninstall removes the virtualenv and model snapshot')
  const paths = localDecisionPaths(env)
  const report = await uninstallLocalDecision(paths.runtimeRoot)
  output(report, parsed.flags.has('--json'), () => [
    `uninstall ${report.ok ? 'complete' : 'blocked'}: removed ${report.removed.length} entries, retained ${report.retained.length}`,
    ...report.blockers.map((line) => `blocker: ${line}`)
  ])
  return report.ok ? 0 : EXIT_FAILURE
}

