import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import { validateDecisionResult } from './schema.js'
import { LOCAL_DECISION_REQUEST_SCHEMA, LOCAL_DECISION_RESPONSE_SCHEMA, type DecisionRequestMode } from './protocol.js'
import type { ServiceStatus } from './service.js'
import type { DecisionFailureCode, DecisionInput, DecisionResult, LocalDecisionProvider } from './types.js'

/** Design defaults (§9): 50ms connect, 1500ms warm request including queue. */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 50
export const DEFAULT_REQUEST_TIMEOUT_MS = 1_500
const MAX_RESPONSE_BYTES = 64 * 1024

export interface LocalDecisionClientOptions {
  /** Unix domain socket path only. There is no TCP endpoint option by design. */
  socketPath: string
  /** Private metadata file holding the handshake nonce; read on every call, never cached across processes. */
  metadataPath: string
  connectionTimeoutMs: number
  requestTimeoutMs: number
}

export interface LocalDecisionClient extends LocalDecisionProvider {
  /** Best-effort shadow submit: never holds the caller, errors are swallowed. */
  submitShadow(input: DecisionInput): void
  /** Explicit CLI evaluation: same budget rules, recorded as `explicit` in the ledger. */
  evaluate(input: DecisionInput, signal: AbortSignal, timeoutMs?: number): Promise<DecisionResult>
  status(): Promise<ServiceStatus | null>
  shutdown(): Promise<boolean>
}

class ClientFailure extends Error {
  readonly code: DecisionFailureCode
  constructor(code: DecisionFailureCode, detail?: string) {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

async function readNonce(metadataPath: string, socketPath: string): Promise<string> {
  const stat = await fsp.lstat(metadataPath).catch(() => null)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new ClientFailure('service_not_ready', 'metadata_missing')
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new ClientFailure('service_not_ready', 'metadata_owner')
  if ((stat.mode & 0o077) !== 0) throw new ClientFailure('service_not_ready', 'metadata_mode')
  const record = await fsp.readFile(metadataPath, 'utf8').then((raw) => JSON.parse(raw), () => null)
  if (!record || typeof record.nonce !== 'string' || !record.nonce) throw new ClientFailure('service_not_ready', 'metadata_invalid')
  if (typeof record.socket_path === 'string' && record.socket_path !== socketPath) throw new ClientFailure('service_not_ready', 'metadata_socket_mismatch')
  return record.nonce
}

function socketPresent(socketPath: string): boolean {
  try {
    const stat = fs.lstatSync(socketPath)
    return stat.isSocket() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

interface RoundTripOptions {
  connectionTimeoutMs: number
  requestTimeoutMs: number
  signal?: AbortSignal
  /** Detach from the event loop once the request is flushed (shadow submits). */
  detachAfterWrite?: boolean
}

function roundTrip(socketPath: string, payload: Record<string, unknown>, options: RoundTripOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new ClientFailure('cancelled')); return }
    if (!socketPresent(socketPath)) { reject(new ClientFailure('service_not_ready', 'socket_missing')); return }
    const socket = net.createConnection(socketPath)
    let settled = false
    let buffer = ''
    const finish = (error: Error | null, value?: any) => {
      if (settled) return
      settled = true
      clearTimeout(connectTimer)
      clearTimeout(requestTimer)
      options.signal?.removeEventListener('abort', onAbort)
      socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => finish(new ClientFailure('cancelled'))
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const connectTimer = setTimeout(() => finish(new ClientFailure('service_not_ready', 'connect_timeout')), options.connectionTimeoutMs)
    const requestTimer = setTimeout(() => finish(new ClientFailure('timeout', `request_timeout:${options.requestTimeoutMs}`)), options.requestTimeoutMs)
    socket.setEncoding('utf8')
    socket.once('connect', () => {
      clearTimeout(connectTimer)
      socket.write(`${JSON.stringify(payload)}\n`, () => {
        if (options.detachAfterWrite) socket.unref()
      })
    })
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (Buffer.byteLength(buffer, 'utf8') > MAX_RESPONSE_BYTES) { finish(new ClientFailure('invalid_response', 'response_too_large')); return }
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      let parsed: any
      try {
        parsed = JSON.parse(buffer.slice(0, newline))
      } catch {
        finish(new ClientFailure('invalid_response', 'malformed_response'))
        return
      }
      if (!parsed || parsed.schema !== LOCAL_DECISION_RESPONSE_SCHEMA) { finish(new ClientFailure('invalid_response', 'response_schema')); return }
      finish(null, parsed)
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      finish(new ClientFailure(error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ? 'service_not_ready' : 'worker_crashed', error.code || error.message))
    })
    socket.once('close', () => finish(new ClientFailure('service_not_ready', 'closed_without_response')))
  })
}

export function createLocalDecisionProvider(options: LocalDecisionClientOptions): LocalDecisionClient {
  const socketPath = options.socketPath
  const connectionTimeoutMs = options.connectionTimeoutMs
  const requestTimeoutMs = options.requestTimeoutMs

  async function decideWith(input: DecisionInput, mode: DecisionRequestMode, signal: AbortSignal, timeoutMs: number): Promise<DecisionResult> {
    const startedAt = Date.now()
    try {
      const nonce = await readNonce(options.metadataPath, socketPath)
      const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt))
      const response = await roundTrip(socketPath, { schema: LOCAL_DECISION_REQUEST_SCHEMA, nonce, op: 'decide', mode, input }, {
        connectionTimeoutMs,
        requestTimeoutMs: remaining,
        signal
      })
      if (response.ok !== true) throw new ClientFailure('invalid_response', String(response.error || 'error'))
      return validateDecisionResult(input, response.result)
    } catch (error: unknown) {
      if (error instanceof ClientFailure) return { status: 'unavailable', requestId: input.requestId, reason: error.code }
      return { status: 'unavailable', requestId: input.requestId, reason: 'invalid_response' }
    }
  }

  return {
    decide: (input, signal) => decideWith(input, 'advisory', signal, requestTimeoutMs),
    evaluate: (input, signal, timeoutMs = requestTimeoutMs) => decideWith(input, 'explicit', signal, timeoutMs),
    submitShadow(input) {
      void (async () => {
        try {
          const nonce = await readNonce(options.metadataPath, socketPath)
          await roundTrip(socketPath, { schema: LOCAL_DECISION_REQUEST_SCHEMA, nonce, op: 'decide', mode: 'shadow', input }, {
            connectionTimeoutMs,
            // The broker records the sample itself; the submitter only needs the request flushed.
            requestTimeoutMs: Math.max(requestTimeoutMs, 10_000),
            detachAfterWrite: true
          })
        } catch {
          // Sample loss is counted by the broker's absence of a ledger row; never surface here.
        }
      })()
    },
    async status() {
      try {
        const nonce = await readNonce(options.metadataPath, socketPath)
        const response = await roundTrip(socketPath, { schema: LOCAL_DECISION_REQUEST_SCHEMA, nonce, op: 'status' }, { connectionTimeoutMs, requestTimeoutMs })
        return response.ok === true && response.status ? response.status as ServiceStatus : null
      } catch {
        return null
      }
    },
    async shutdown() {
      try {
        const nonce = await readNonce(options.metadataPath, socketPath)
        const response = await roundTrip(socketPath, { schema: LOCAL_DECISION_REQUEST_SCHEMA, nonce, op: 'shutdown' }, { connectionTimeoutMs, requestTimeoutMs })
        return response.ok === true
      } catch {
        return false
      }
    }
  }
}
