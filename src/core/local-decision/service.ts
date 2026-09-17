import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import {
  ensurePrivateDir,
  localDecisionPaths,
  localDecisionSocketDir,
  localDecisionSocketPath,
  removeSocketFileIfStale
} from './paths.js'
import { evaluateDecisionPolicy } from './policy.js'
import { DecisionValidationError, validateDecisionInput, validateDecisionResult } from './schema.js'
import type { DecisionFailureCode, DecisionInput, DecisionResult } from './types.js'
import { WorkerClient, WorkerError, type WorkerReadyInfo } from './worker-client.js'

import {
  LOCAL_DECISION_READINESS_SCHEMA,
  LOCAL_DECISION_REQUEST_SCHEMA,
  LOCAL_DECISION_RESPONSE_SCHEMA,
  LOCAL_DECISION_SERVICE_METADATA_SCHEMA,
  type DecisionRequestMode
} from './protocol.js'
export { LOCAL_DECISION_REQUEST_SCHEMA, LOCAL_DECISION_RESPONSE_SCHEMA, LOCAL_DECISION_SERVICE_METADATA_SCHEMA, LOCAL_DECISION_READINESS_SCHEMA }
export type { DecisionRequestMode }
export const MAX_SERVICE_LINE_BYTES = 64 * 1024

import {
  DEFAULT_SERVICE_LIMITS,
  appendDecisionLedger,
  decisionIdentityKey,
  pidAlive,
  pruneDecisionLedger,
  safeEqual,
  sameModel,
  unavailable,
  writeReadinessReceipt,
  writeServiceMetadata,
  type LocalDecisionServiceHandle,
  type ServiceFileContext,
  type LocalDecisionServiceOptions,
  type QueuedRequest,
  type ServiceLimits,
  type ServiceStatus
} from './service-support.js'

export { DEFAULT_SERVICE_LIMITS, decisionIdentityKey } from './service-support.js'
export type { LocalDecisionServiceHandle, LocalDecisionServiceOptions, ServiceLimits, ServiceStatus } from './service-support.js'

/**
 * Resident broker: one Unix domain socket (0600 in a 0700 dir), one Python
 * worker, one inference at a time. Node owns every timeout so a long GPU step
 * can never block `status` or `shutdown`.
 */
export async function startLocalDecisionService(options: LocalDecisionServiceOptions): Promise<LocalDecisionServiceHandle> {
  const limits: ServiceLimits = { ...DEFAULT_SERVICE_LIMITS, ...(options.limits || {}) }
  const now = options.now || (() => Date.now())
  await ensurePrivateDir(path.resolve(options.runtimeRoot))
  // Canonical root: macOS aliases /var to /private/var, and every derived
  // path (socket digest, metadata, ledger) must agree with what clients compute.
  const runtimeRoot = await fsp.realpath(path.resolve(options.runtimeRoot))
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const socketPath = options.socketPath || localDecisionSocketPath(runtimeRoot)
  const metadataPath = paths.serviceMetadataPath
  await ensurePrivateDir(runtimeRoot)
  await ensurePrivateDir(paths.runtimeDir)
  await ensurePrivateDir(paths.logsDir)
  await ensurePrivateDir(path.dirname(socketPath) === localDecisionSocketDir() ? localDecisionSocketDir() : path.dirname(socketPath))

  // Single-instance lock: a live metadata record with a live pid refuses a
  // second service. A stale pid is replaced, never signalled.
  const existing = await fsp.readFile(metadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
  if (existing && Number.isInteger(existing.pid) && (existing.pid === process.pid || pidAlive(existing.pid))) {
    throw new Error(`service_already_running:${existing.pid}`)
  }
  await removeSocketFileIfStale(socketPath)

  const nonce = crypto.randomBytes(24).toString('hex')
  const startedAt = nowIso()
  const counters: Record<string, number> = {
    requests: 0, ok: 0, abstain: 0, unavailable: 0, busy: 0, timeout: 0,
    invalid_request: 0, invalid_response: 0, worker_crashed: 0, not_ready: 0,
    coalesced: 0, late_results_discarded: 0, nonce_rejected: 0, shadow: 0, advisory: 0, explicit: 0
  }
  let worker: WorkerClient | null = null
  let readyInfo: WorkerReadyInfo | null = null
  let restarts = 0
  let restartTimestamps: number[] = []
  let consecutiveFailures = 0
  let circuitOpenUntil = 0
  let circuitReason: string | null = null
  let closing = false
  let expectedExit: WorkerClient | null = null
  let closePromise: Promise<void> | null = null
  let readyWaiters: Array<() => void> = []

  function notifyReady(): void {
    const waiters = readyWaiters
    readyWaiters = []
    for (const waiter of waiters) waiter()
  }

  function retireWorker(client: WorkerClient): void {
    // The broker itself decided this worker must go: its exit is expected and
    // must not count toward the circuit, but readiness drops right now so the
    // next request sees a restart in progress instead of a dead pipe.
    expectedExit = client
    readyInfo = null
    client.kill()
  }
  const queue: QueuedRequest[] = []
  const inflight = new Map<string, Promise<DecisionResult>>()
  let running = false

  const fileContext: ServiceFileContext = { paths, socketPath, nonce, runtimeRoot, startedAt, receiptDigest: options.receiptDigest ?? null, limits, now }
  const writeMetadata = () => writeServiceMetadata(fileContext, readyInfo)
  const writeReadiness = (info: WorkerReadyInfo) => writeReadinessReceipt(fileContext, info)
  const appendLedger = (row: Record<string, unknown>) => appendDecisionLedger(fileContext, row)
  const pruneLedger = () => pruneDecisionLedger(fileContext)

  function circuitOpen(): boolean {
    return circuitOpenUntil > now()
  }

  function recordFailure(reason: string): void {
    consecutiveFailures += 1
    if (consecutiveFailures >= limits.circuitFailureThreshold) {
      circuitOpenUntil = now() + limits.circuitOpenMs
      circuitReason = reason
      consecutiveFailures = 0
    }
  }

  function recordSuccess(): void {
    consecutiveFailures = 0
  }

  async function spawnWorker(): Promise<void> {
    if (closing) return
    const client = new WorkerClient(options.worker)
    worker = client
    readyInfo = null
    client.on('exit', () => {
      if (worker !== client) return
      readyInfo = null
      void writeMetadata()
      if (closing) return
      if (expectedExit === client) expectedExit = null
      else recordFailure('worker_exit')
      scheduleRestart()
    })
    try {
      const info = await client.start(limits.readyTimeoutMs)
      if (worker !== client) return
      if (options.expectedModel && !sameModel(options.expectedModel, info.model)) {
        circuitOpenUntil = Number.MAX_SAFE_INTEGER
        circuitReason = 'model_incompatible:worker_model_differs_from_receipt'
        await client.shutdown()
        return
      }
      readyInfo = info
      await writeReadiness(info)
      await writeMetadata()
      notifyReady()
    } catch (error: unknown) {
      if (worker === client) {
        readyInfo = null
        recordFailure(error instanceof Error ? error.message : String(error))
      }
    }
  }

  function scheduleRestart(): void {
    const windowStart = now() - limits.circuitOpenMs
    restartTimestamps = restartTimestamps.filter((at) => at >= windowStart)
    if (restartTimestamps.length >= limits.maxWorkerRestartsPerWindow) {
      circuitOpenUntil = now() + limits.circuitOpenMs
      circuitReason = 'worker_restart_budget_exhausted'
      return
    }
    restartTimestamps.push(now())
    restarts += 1
    void spawnWorker()
  }

  function classify(error: unknown): DecisionFailureCode {
    if (error instanceof WorkerError) return error.code === 'service_not_ready' ? 'service_not_ready' : error.code
    if (error instanceof DecisionValidationError) return 'invalid_response'
    return 'worker_crashed'
  }

  async function runOne(request: QueuedRequest): Promise<DecisionResult> {
    const waited = now() - request.enqueuedAt
    if (waited > limits.queueWaitMs) {
      counters.busy = (counters.busy ?? 0) + 1
      return unavailable(request.input.requestId, 'busy')
    }
    const client = worker
    if (!client || !readyInfo || !client.alive) {
      counters.not_ready = (counters.not_ready ?? 0) + 1
      return unavailable(request.input.requestId, 'service_not_ready')
    }
    try {
      const raw = await client.infer(request.input, limits.inferenceHardDeadlineMs).catch((error: unknown) => {
        if (error instanceof WorkerError && error.code === 'timeout') { expectedExit = client; readyInfo = null }
        throw error
      })
      const result = validateDecisionResult(request.input, raw)
      if (result.status === 'ok') {
        if (!sameModel(result.model, readyInfo.model)) throw new DecisionValidationError('model_evidence_mismatch')
        recordSuccess()
        counters.ok = (counters.ok ?? 0) + 1
        return {
          ...result,
          timing: { ...result.timing, queueMs: Math.max(0, waited), totalMs: Math.max(0, now() - request.enqueuedAt) }
        }
      }
      counters.abstain = (counters.abstain ?? 0) + 1
      recordSuccess()
      return result
    } catch (error: unknown) {
      const code = classify(error)
      counters[code] = (counters[code] ?? 0) + 1
      recordFailure(`${code}:${error instanceof Error ? error.message : String(error)}`)
      if (code === 'invalid_response' && client.alive) {
        // A worker that violates the contract is not trusted for the next request either.
        retireWorker(client)
      }
      return unavailable(request.input.requestId, code === 'service_not_ready' ? 'service_not_ready' : code)
    }
  }

  async function pump(): Promise<void> {
    if (running) return
    running = true
    try {
      while (queue.length) {
        const next = queue.shift()!
        const result = await runOne(next)
        next.resolve(result)
      }
    } finally {
      running = false
    }
  }

  function submit(input: DecisionInput, mode: DecisionRequestMode): Promise<DecisionResult> {
    counters.requests = (counters.requests ?? 0) + 1
    counters[mode] = (counters[mode] ?? 0) + 1
    if (closing) return Promise.resolve(unavailable(input.requestId, 'service_not_ready'))
    if (!readyInfo || !worker?.alive) {
      counters.not_ready = (counters.not_ready ?? 0) + 1
      if (!circuitOpen() && !worker && !closing) scheduleRestart()
      return Promise.resolve(unavailable(input.requestId, 'service_not_ready'))
    }
    if (circuitOpen()) {
      counters.not_ready = (counters.not_ready ?? 0) + 1
      return Promise.resolve(unavailable(input.requestId, 'service_not_ready'))
    }
    const identity = decisionIdentityKey(input, readyInfo.model)
    const shared = inflight.get(identity)
    if (shared) {
      counters.coalesced = (counters.coalesced ?? 0) + 1
      return shared.then((result) => result.status === 'ok'
        ? { ...result, requestId: input.requestId }
        : { ...result, requestId: input.requestId })
    }
    if (queue.length >= limits.queueLimit) {
      counters.busy = (counters.busy ?? 0) + 1
      return Promise.resolve(unavailable(input.requestId, 'busy'))
    }
    const promise = new Promise<DecisionResult>((resolve) => {
      queue.push({ input, mode, enqueuedAt: now(), identity, resolve })
    }).finally(() => { inflight.delete(identity) })
    inflight.set(identity, promise)
    void pump()
    return promise
  }

  function status(): ServiceStatus {
    return {
      schema: LOCAL_DECISION_SERVICE_METADATA_SCHEMA,
      ready: readyInfo !== null && worker?.alive === true && !circuitOpen(),
      generationId: readyInfo?.generationId ?? null,
      realModelVerified: readyInfo?.realModelVerified === true,
      model: readyInfo?.model ?? null,
      worker: {
        pid: worker?.pid ?? null,
        alive: worker?.alive === true,
        restarts,
        consecutiveFailures,
        lateFramesDiscarded: worker?.lateFrameCount ?? 0
      },
      circuit: {
        open: circuitOpen(),
        openUntil: circuitOpen() ? new Date(Math.min(circuitOpenUntil, 8.64e15)).toISOString() : null,
        reason: circuitOpen() ? circuitReason : null
      },
      queue: { depth: queue.length, limit: limits.queueLimit, inflight: inflight.size },
      counters: { ...counters, late_results_discarded: worker?.lateFrameCount ?? counters.late_results_discarded ?? 0 },
      limits,
      startedAt
    }
  }

  function respond(socket: net.Socket, payload: Record<string, unknown>): void {
    try {
      socket.write(`${JSON.stringify({ schema: LOCAL_DECISION_RESPONSE_SCHEMA, ...payload })}\n`)
    } catch {}
    socket.end()
  }

  const server = net.createServer((socket) => {
    let buffer = ''
    let handled = false
    socket.setEncoding('utf8')
    socket.on('error', () => undefined)
    socket.on('data', (chunk: string) => {
      if (handled) return
      buffer += chunk
      if (Buffer.byteLength(buffer, 'utf8') > MAX_SERVICE_LINE_BYTES) {
        handled = true
        respond(socket, { ok: false, error: 'request_too_large' })
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      handled = true
      const line = buffer.slice(0, newline)
      void handle(socket, line)
    })
  })

  async function handle(socket: net.Socket, line: string): Promise<void> {
    let request: any
    try {
      request = JSON.parse(line)
    } catch {
      respond(socket, { ok: false, error: 'malformed_request' })
      return
    }
    if (!request || request.schema !== LOCAL_DECISION_REQUEST_SCHEMA || typeof request.nonce !== 'string' || !safeEqual(request.nonce, nonce)) {
      counters.nonce_rejected = (counters.nonce_rejected ?? 0) + 1
      respond(socket, { ok: false, error: 'unauthorized' })
      return
    }
    if (request.op === 'status') {
      respond(socket, { ok: true, status: status() })
      return
    }
    if (request.op === 'shutdown') {
      respond(socket, { ok: true, stopping: true })
      void close().then(() => { if (options.exitOnShutdown) process.exit(0) })
      return
    }
    if (request.op !== 'decide') {
      respond(socket, { ok: false, error: 'unknown_op' })
      return
    }
    const mode: DecisionRequestMode = request.mode === 'shadow' ? 'shadow' : request.mode === 'explicit' ? 'explicit' : 'advisory'
    let input: DecisionInput
    try {
      input = validateDecisionInput(request.input)
    } catch (error: unknown) {
      counters.invalid_request = (counters.invalid_request ?? 0) + 1
      respond(socket, { ok: false, error: `invalid_request:${error instanceof Error ? error.message : String(error)}` })
      return
    }
    const result = await submit(input, mode)
    const policy = evaluateDecisionPolicy(input, result)
    void appendLedger({
      ts: nowIso(),
      mode,
      request_id: input.requestId,
      kind: input.kind,
      scope: input.scope,
      facts: input.facts,
      summary_digest: sha256(input.summary),
      outcome: result.status,
      reason: result.status === 'ok' ? null : result.reason,
      fields: result.status === 'ok' ? result.fields : null,
      timing: result.status === 'ok' ? result.timing : null,
      compute: result.status === 'ok' ? result.compute : null,
      model_revision: result.status === 'ok' ? result.model.modelRevision : readyInfo?.model.modelRevision ?? null,
      policy_action: policy.action,
      policy_reason: policy.reason,
      policy_advice: policy.advice
    })
    respond(socket, { ok: true, result })
  }

  async function close(): Promise<void> {
    if (closePromise) return closePromise
    closePromise = (async () => {
      closing = true
      for (const pending of queue.splice(0)) pending.resolve(unavailable(pending.input.requestId, 'service_not_ready'))
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
      const client = worker
      worker = null
      if (client) await client.shutdown()
      await fsp.rm(socketPath, { force: true }).catch(() => undefined)
      const record = await fsp.readFile(metadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
      if (record?.pid === process.pid) await fsp.rm(metadataPath, { force: true }).catch(() => undefined)
    })()
    return closePromise
  }

  await writeMetadata()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => { server.removeListener('error', reject); resolve() })
    })
    await fsp.chmod(socketPath, 0o600)
  } catch (error) {
    await fsp.rm(metadataPath, { force: true }).catch(() => undefined)
    throw error
  }
  await pruneLedger()
  restartTimestamps.push(now())
  void spawnWorker()
  if (!fs.existsSync(socketPath)) throw new Error('socket_missing_after_listen')
  return { socketPath, metadataPath, status, close, awaitReady }

  function awaitReady(timeoutMs: number): Promise<boolean> {
    if (status().ready) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => { readyWaiters = readyWaiters.filter((entry) => entry !== waiter); resolve(false) }, timeoutMs)
      timer.unref()
      const waiter = () => { clearTimeout(timer); resolve(status().ready) }
      readyWaiters.push(waiter)
    })
  }
}
