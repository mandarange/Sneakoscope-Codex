import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { validateDecisionModelEvidence } from './schema.js'
import type { DecisionInput, DecisionModelEvidence } from './types.js'

export const WORKER_PROTOCOL_VERSION = 1 as const
export const MAX_WORKER_LINE_BYTES = 64 * 1024
const STDERR_RING_BYTES = 4 * 1024

export interface WorkerCommand {
  file: string
  args: readonly string[]
  /** Minimal allowlisted environment. Never the parent's full env. */
  env: Readonly<Record<string, string>>
  cwd?: string
}

export interface WorkerReadyInfo {
  generationId: string
  realModelVerified: boolean
  model: DecisionModelEvidence
  warmup: Record<string, unknown>
  loadMs: number | null
}

export class WorkerError extends Error {
  readonly code: 'worker_crashed' | 'timeout' | 'invalid_response' | 'service_not_ready'
  constructor(code: WorkerError['code'], detail?: string) {
    super(detail ? `${code}:${detail}` : code)
    this.name = 'WorkerError'
    this.code = code
  }
}

interface PendingInfer {
  requestId: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout | null
}

/**
 * One resident worker process speaking UTF-8 NDJSON on stdin/stdout. stdout
 * is protocol only; stderr is kept in a small ring buffer for diagnostics.
 * The client binds every response to the worker generation announced by the
 * `ready` frame, discards frames for unknown or expired request ids, and kills
 * the process when a hard deadline passes so no GPU work keeps queueing behind
 * a request the caller already abandoned.
 */
export class WorkerClient extends EventEmitter {
  readonly command: WorkerCommand
  private child: ChildProcess | null = null
  private buffer = ''
  private stderrRing = ''
  private pending: PendingInfer | null = null
  private ready: WorkerReadyInfo | null = null
  private exited = false
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null
  private lateFrames = 0
  private readyResolver: { resolve: (value: WorkerReadyInfo) => void; reject: (error: Error) => void } | null = null

  constructor(command: WorkerCommand) {
    super()
    this.command = command
  }

  get alive(): boolean {
    return this.child !== null && !this.exited
  }

  get pid(): number | null {
    return this.child?.pid ?? null
  }

  get generationId(): string | null {
    return this.ready?.generationId ?? null
  }

  get readyInfo(): WorkerReadyInfo | null {
    return this.ready
  }

  get lateFrameCount(): number {
    return this.lateFrames
  }

  get recentStderr(): string {
    return this.stderrRing
  }

  start(readyTimeoutMs: number): Promise<WorkerReadyInfo> {
    if (this.child) return Promise.reject(new WorkerError('service_not_ready', 'worker_already_started'))
    return new Promise<WorkerReadyInfo>((resolve, reject) => {
      const child = spawn(this.command.file, [...this.command.args], {
        cwd: this.command.cwd,
        env: { ...this.command.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true
      })
      this.child = child
      const timer = setTimeout(() => {
        this.settleReady(new WorkerError('service_not_ready', `ready_timeout:${readyTimeoutMs}`))
        this.kill()
      }, readyTimeoutMs)
      timer.unref()
      this.readyResolver = {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) }
      }
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => this.onStdout(chunk))
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        this.stderrRing = (this.stderrRing + chunk).slice(-STDERR_RING_BYTES)
      })
      child.once('error', (error) => this.onExit(null, null, error))
      child.once('exit', (code, signal) => this.onExit(code, signal, null))
    })
  }

  private settleReady(error: Error | null, info?: WorkerReadyInfo): void {
    const resolver = this.readyResolver
    this.readyResolver = null
    if (!resolver) return
    if (error) resolver.reject(error)
    else if (info) resolver.resolve(info)
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (Buffer.byteLength(line, 'utf8') > MAX_WORKER_LINE_BYTES) {
        this.protocolViolation('frame_too_large')
        return
      }
      this.onFrame(line)
      newline = this.buffer.indexOf('\n')
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > MAX_WORKER_LINE_BYTES) this.protocolViolation('frame_too_large')
  }

  private protocolViolation(detail: string): void {
    const error = new WorkerError('invalid_response', detail)
    this.emit('protocol_violation', error)
    this.settleReady(error)
    this.failPending(error)
    this.kill()
  }

  private onFrame(line: string): void {
    if (!line.trim()) return
    let frame: any
    try {
      frame = JSON.parse(line)
    } catch {
      this.protocolViolation('malformed_json')
      return
    }
    if (!frame || typeof frame !== 'object' || frame.protocolVersion !== WORKER_PROTOCOL_VERSION) {
      this.protocolViolation('protocol_version')
      return
    }
    switch (frame.type) {
      case 'ready': {
        if (this.ready) { this.protocolViolation('duplicate_ready'); return }
        let model: DecisionModelEvidence
        try {
          model = validateDecisionModelEvidence(frame.model, 'ready.model')
        } catch (error: unknown) {
          this.protocolViolation(`ready_model:${error instanceof Error ? error.message : String(error)}`)
          return
        }
        const generationId = typeof frame.generationId === 'string' && frame.generationId.trim() ? frame.generationId.trim() : ''
        if (!generationId) { this.protocolViolation('ready_generation_missing'); return }
        this.ready = {
          generationId,
          realModelVerified: frame.realModelVerified === true,
          model,
          warmup: frame.warmup && typeof frame.warmup === 'object' ? frame.warmup : {},
          loadMs: typeof frame.loadMs === 'number' && Number.isFinite(frame.loadMs) ? frame.loadMs : null
        }
        this.settleReady(null, this.ready)
        return
      }
      case 'fatal': {
        const error = new WorkerError('service_not_ready', `worker_fatal:${String(frame.reason || 'unknown')}`)
        this.settleReady(error)
        this.failPending(new WorkerError('worker_crashed', 'worker_fatal'))
        this.kill()
        return
      }
      case 'result':
      case 'error': {
        const pending = this.pending
        if (!this.ready || frame.generationId !== this.ready.generationId) { this.lateFrames += 1; return }
        if (!pending || pending.requestId !== frame.requestId) { this.lateFrames += 1; return }
        this.pending = null
        if (pending.timer) clearTimeout(pending.timer)
        if (frame.type === 'error') {
          pending.reject(new WorkerError('invalid_response', `worker_error:${String(frame.reason || 'unknown')}`))
        } else {
          pending.resolve(frame.result)
        }
        return
      }
      case 'pong':
        this.emit('pong')
        return
      default:
        this.protocolViolation(`unknown_frame:${String(frame.type)}`)
    }
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null, error: Error | null): void {
    if (this.exited) return
    this.exited = true
    this.exitInfo = { code, signal }
    const detail = error ? `spawn_error:${error.message}` : `exit:${code ?? 'null'}:${signal ?? 'null'}`
    this.settleReady(new WorkerError('service_not_ready', detail))
    this.failPending(new WorkerError('worker_crashed', detail))
    this.emit('exit', this.exitInfo)
  }

  private failPending(error: Error): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    if (pending.timer) clearTimeout(pending.timer)
    pending.reject(error)
  }

  /** One request at a time; the caller (broker scheduler) guarantees serialization. */
  infer(input: DecisionInput, hardDeadlineMs: number): Promise<unknown> {
    if (!this.alive || !this.ready) return Promise.reject(new WorkerError('service_not_ready', 'worker_not_ready'))
    if (this.pending) return Promise.reject(new WorkerError('service_not_ready', 'worker_busy'))
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.requestId !== input.requestId) return
        this.pending = null
        reject(new WorkerError('timeout', `hard_deadline:${hardDeadlineMs}`))
        // The GPU work does not stop because the caller gave up; only killing
        // the worker guarantees nothing stays queued behind it.
        this.kill()
      }, hardDeadlineMs)
      timer.unref()
      this.pending = { requestId: input.requestId, resolve, reject, timer }
      const frame = JSON.stringify({ protocolVersion: WORKER_PROTOCOL_VERSION, type: 'infer', requestId: input.requestId, input })
      if (!this.write(frame)) {
        this.pending = null
        clearTimeout(timer)
        reject(new WorkerError('worker_crashed', 'stdin_closed'))
      }
    })
  }

  ping(): boolean {
    return this.write(JSON.stringify({ protocolVersion: WORKER_PROTOCOL_VERSION, type: 'ping' }))
  }

  private write(line: string): boolean {
    const stdin = this.child?.stdin
    if (!stdin || !this.alive || stdin.destroyed) return false
    try {
      stdin.write(`${line}\n`)
      return true
    } catch {
      return false
    }
  }

  async shutdown(graceMs = 2_000): Promise<void> {
    if (!this.child || this.exited) return
    this.write(JSON.stringify({ protocolVersion: WORKER_PROTOCOL_VERSION, type: 'shutdown' }))
    try { this.child.stdin?.end() } catch {}
    const exited = await this.waitForExit(graceMs)
    if (!exited) {
      this.kill('SIGTERM')
      if (!(await this.waitForExit(graceMs))) this.kill('SIGKILL')
      await this.waitForExit(graceMs)
    }
  }

  kill(signal: NodeJS.Signals = 'SIGKILL'): void {
    if (!this.child || this.exited) return
    try { this.child.kill(signal) } catch {}
  }

  waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.exited || !this.child) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.removeListener('exit', onExit); resolve(false) }, timeoutMs)
      timer.unref()
      const onExit = () => { clearTimeout(timer); resolve(true) }
      this.once('exit', onExit)
    })
  }
}
