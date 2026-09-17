import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import type { LocalDecisionPaths } from './paths.js'
import type { DecisionFailureCode, DecisionInput, DecisionModelEvidence, DecisionResult } from './types.js'
import type { WorkerCommand, WorkerReadyInfo } from './worker-client.js'
import { LOCAL_DECISION_READINESS_SCHEMA, LOCAL_DECISION_SERVICE_METADATA_SCHEMA, type DecisionRequestMode } from './protocol.js'

/** Design defaults (§9). These are first-version budgets, not measured performance. */
export const DEFAULT_SERVICE_LIMITS = Object.freeze({
  queueLimit: 8,
  queueWaitMs: 100,
  requestTimeoutMs: 1_500,
  inferenceHardDeadlineMs: 5_000,
  readyTimeoutMs: 90_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 60_000,
  maxWorkerRestartsPerWindow: 3,
  ledgerMaxBytes: 10 * 1024 * 1024,
  ledgerRetentionDays: 7
})

export type ServiceLimits = { -readonly [K in keyof typeof DEFAULT_SERVICE_LIMITS]: number }

export interface LocalDecisionServiceOptions {
  runtimeRoot: string
  worker: WorkerCommand
  /** Model evidence from the install receipt; the worker's ready frame must match it. */
  expectedModel?: DecisionModelEvidence | null
  receiptDigest?: string | null
  socketPath?: string
  limits?: Partial<ServiceLimits>
  exitOnShutdown?: boolean
  now?: () => number
}

export interface ServiceStatus {
  schema: typeof LOCAL_DECISION_SERVICE_METADATA_SCHEMA
  ready: boolean
  generationId: string | null
  realModelVerified: boolean
  model: DecisionModelEvidence | null
  worker: {
    pid: number | null
    alive: boolean
    restarts: number
    consecutiveFailures: number
    lateFramesDiscarded: number
  }
  circuit: { open: boolean; openUntil: string | null; reason: string | null }
  queue: { depth: number; limit: number; inflight: number }
  counters: Record<string, number>
  limits: ServiceLimits
  startedAt: string
}

export interface LocalDecisionServiceHandle {
  socketPath: string
  metadataPath: string
  status(): ServiceStatus
  close(): Promise<void>
  /** Resolves true once the worker is warm; used only by the explicit start command and tests. */
  awaitReady(timeoutMs: number): Promise<boolean>
}

export interface QueuedRequest {
  input: DecisionInput
  mode: DecisionRequestMode
  enqueuedAt: number
  identity: string
  resolve: (result: DecisionResult) => void
}

export function unavailable(requestId: string, reason: DecisionFailureCode): DecisionResult {
  return { status: 'unavailable', requestId, reason }
}

export function sameModel(left: DecisionModelEvidence, right: DecisionModelEvidence): boolean {
  return left.modelId === right.modelId
    && left.modelRevision === right.modelRevision
    && left.tokenizerDigest === right.tokenizerDigest
    && left.quantization === right.quantization
    && left.implementationOrigin === right.implementationOrigin
    && left.engineVersion === right.engineVersion
}

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function decisionIdentityKey(input: DecisionInput, model: DecisionModelEvidence | null): string {
  const { requestId: _requestId, ...rest } = input
  return sha256(JSON.stringify({
    schema: input.schemaVersion,
    modelRevision: model?.modelRevision ?? null,
    tokenizerDigest: model?.tokenizerDigest ?? null,
    engineVersion: model?.engineVersion ?? null,
    input: rest
  }))
}


export interface ServiceFileContext {
  paths: LocalDecisionPaths
  socketPath: string
  nonce: string
  runtimeRoot: string
  startedAt: string
  receiptDigest: string | null
  limits: ServiceLimits
  now: () => number
}

/** Private (0600) metadata: pid, socket, handshake nonce, readiness, model evidence. */
export async function writeServiceMetadata(ctx: ServiceFileContext, readyInfo: WorkerReadyInfo | null): Promise<void> {
  await writeJsonAtomic(ctx.paths.serviceMetadataPath, {
    schema: LOCAL_DECISION_SERVICE_METADATA_SCHEMA,
    pid: process.pid,
    socket_path: ctx.socketPath,
    nonce: ctx.nonce,
    runtime_root: ctx.runtimeRoot,
    started_at: ctx.startedAt,
    ready: readyInfo !== null,
    generation_id: readyInfo?.generationId ?? null,
    real_model_verified: readyInfo?.realModelVerified === true,
    model: readyInfo?.model ?? null,
    receipt_digest: ctx.receiptDigest
  }, { mode: 0o600 })
}

/** Runtime readiness receipt: links a real warm-up to the install receipt digest it verified. */
export async function writeReadinessReceipt(ctx: ServiceFileContext, info: WorkerReadyInfo): Promise<void> {
  await writeJsonAtomic(ctx.paths.readinessPath, {
    schema: LOCAL_DECISION_READINESS_SCHEMA,
    verified_at: nowIso(),
    generation_id: info.generationId,
    real_model_verified: info.realModelVerified,
    model: info.model,
    warmup: info.warmup,
    load_ms: info.loadMs,
    receipt_digest: ctx.receiptDigest
  }, { mode: 0o600 })
}

/** Bounded JSONL ledger (rotate at the byte limit, keep one previous file). Never affects a result. */
export async function appendDecisionLedger(ctx: ServiceFileContext, row: Record<string, unknown>): Promise<void> {
  const file = ctx.paths.decisionLedgerPath
  try {
    const stat = await fsp.stat(file).catch(() => null)
    if (stat && stat.size >= ctx.limits.ledgerMaxBytes) await fsp.rename(file, `${file}.1`).catch(() => undefined)
    await fsp.appendFile(file, `${JSON.stringify(row)}\n`, { mode: 0o600 })
  } catch {}
}

export async function pruneDecisionLedger(ctx: ServiceFileContext): Promise<void> {
  const cutoff = ctx.now() - ctx.limits.ledgerRetentionDays * 24 * 60 * 60 * 1000
  for (const name of [`${ctx.paths.decisionLedgerPath}.1`, ctx.paths.decisionLedgerPath]) {
    const stat = await fsp.stat(name).catch(() => null)
    if (stat && stat.mtimeMs < cutoff) await fsp.rm(name, { force: true }).catch(() => undefined)
  }
}
