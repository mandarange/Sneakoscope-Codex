import test from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalDecisionProvider } from '../client.js'
import { localDecisionPaths } from '../paths.js'
import { startLocalDecisionService, type LocalDecisionServiceHandle } from '../service.js'
import { workerEnvironment } from '../receipt.js'
import { inputFixture } from './fixtures.js'
import type { DecisionInput, DecisionResult } from '../types.js'

const FAKE_WORKER = fileURLToPath(new URL('./fake-worker.js', import.meta.url))

async function tempRoot(t: test.TestContext): Promise<string> {
  // realpath: macOS aliases /var to /private/var and the service canonicalizes its root.
  const dir = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-ld-broker-')))
  t.after(async () => fsp.rm(dir, { recursive: true, force: true }))
  return path.join(dir, 'runtime')
}

async function startFake(t: test.TestContext, flags: string[] = [], limits: Record<string, number> = {}) {
  const runtimeRoot = await tempRoot(t)
  const paths = localDecisionPaths({ SKS_LOCAL_DECISION_ROOT: runtimeRoot } as NodeJS.ProcessEnv)
  const handle = await startLocalDecisionService({
    runtimeRoot,
    worker: { file: process.execPath, args: [FAKE_WORKER, ...flags], env: { ...workerEnvironment(paths), PATH: process.env.PATH || '' } },
    limits: { readyTimeoutMs: 5_000, ...limits }
  })
  t.after(async () => handle.close())
  const provider = createLocalDecisionProvider({
    socketPath: handle.socketPath,
    metadataPath: handle.metadataPath,
    connectionTimeoutMs: 200,
    requestTimeoutMs: 1_500
  })
  return { runtimeRoot, paths, handle, provider }
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`timeout waiting for ${label}`)
}

function pidAlive(pid: number | null): boolean {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

function request(index: number, patch: Partial<DecisionInput['facts']> = {}): DecisionInput {
  return inputFixture(patch, { requestId: `req-${index}`, summary: `Request ${index}: two bounded changes.` })
}

test('a warm fake worker answers through the private socket with validated results and hardened files', async (t) => {
  const { handle, provider, paths } = await startFake(t)
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const socketStat = await fsp.lstat(handle.socketPath)
  assert.equal(socketStat.mode & 0o077, 0)
  const metadataStat = await fsp.lstat(handle.metadataPath)
  assert.equal(metadataStat.mode & 0o077, 0)
  const runtimeDirStat = await fsp.lstat(paths.runtimeDir)
  assert.equal(runtimeDirStat.mode & 0o077, 0)
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return
  assert.equal(result.requestId, 'req-1')
  assert.equal(result.model.modelId, 'test-only-model')
  assert.equal(Object.keys(result.fields).sort().join(','), 'effortAdvice,fanoutAdvice,workloadClass')
  const status = await provider.status()
  assert.equal(status?.ready, true)
  assert.equal(status?.counters.ok, 1)
  const ledger = await fsp.readFile(paths.decisionLedgerPath, 'utf8')
  const row = JSON.parse(ledger.trim().split('\n').pop()!)
  assert.equal(row.request_id, 'req-1')
  assert.equal(row.mode, 'advisory')
  assert.equal(row.summary, undefined)
  assert.equal(typeof row.summary_digest, 'string')
})

test('requests before ready return service_not_ready immediately instead of waiting for cold load', async (t) => {
  const { handle, provider } = await startFake(t, ['--ready-delay-ms', '1500'])
  assert.equal(handle.status().ready, false)
  const started = Date.now()
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.deepEqual(result, { status: 'unavailable', requestId: 'req-1', reason: 'service_not_ready' })
  assert.ok(Date.now() - started < 700, `waited ${Date.now() - started}ms`)
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const later = await provider.decide(request(2), new AbortController().signal)
  assert.equal(later.status, 'ok')
})

test('a slow worker trips the client budget; the late result is discarded and never re-requested', async (t) => {
  const { handle, paths } = await startFake(t, ['--result-delay-ms', '900'])
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const provider = createLocalDecisionProvider({ socketPath: handle.socketPath, metadataPath: handle.metadataPath, connectionTimeoutMs: 100, requestTimeoutMs: 200 })
  const started = Date.now()
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.deepEqual(result, { status: 'unavailable', requestId: 'req-1', reason: 'timeout' })
  assert.ok(Date.now() - started < 600)
  await waitFor(() => handle.status().counters.ok === 1, 5_000, 'late completion recorded once')
  assert.equal(handle.status().counters.requests, 1)
  const ledger = await fsp.readFile(paths.decisionLedgerPath, 'utf8')
  assert.equal(ledger.trim().split('\n').length, 1)
})

test('one hundred concurrent requests stay bounded: each settles exactly once as ok or busy', async (t) => {
  const { handle, provider } = await startFake(t, ['--result-delay-ms', '30'])
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  let maxDepth = 0
  const sampler = setInterval(() => { maxDepth = Math.max(maxDepth, handle.status().queue.depth) }, 5)
  const settled = new Map<string, number>()
  const results = await Promise.all(Array.from({ length: 100 }, (_, index) => provider.decide(request(index), new AbortController().signal).then((result) => {
    settled.set(result.requestId, (settled.get(result.requestId) || 0) + 1)
    return result
  })))
  clearInterval(sampler)
  assert.equal(results.length, 100)
  assert.ok([...settled.values()].every((count) => count === 1))
  const outcomes = new Set(results.map((result) => result.status === 'ok' ? 'ok' : result.reason))
  for (const outcome of outcomes) assert.ok(['ok', 'busy', 'timeout'].includes(outcome), outcome)
  assert.ok(results.some((result) => result.status === 'ok'))
  assert.ok(maxDepth <= 8, `queue depth ${maxDepth}`)
  const status = handle.status()
  assert.equal(status.queue.depth, 0)
  assert.equal(status.queue.inflight, 0)
})

test('a worker crash completes the pending request exactly once and a bounded restart serves the next one', async (t) => {
  const { handle, provider } = await startFake(t, ['--crash-after', '2'])
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const firstPid = handle.status().worker.pid
  const first = await provider.decide(request(1), new AbortController().signal)
  assert.equal(first.status, 'ok')
  let settledCount = 0
  const second = await provider.decide(request(2), new AbortController().signal).then((result) => { settledCount += 1; return result })
  assert.deepEqual(second, { status: 'unavailable', requestId: 'req-2', reason: 'worker_crashed' })
  await waitFor(() => handle.status().ready && handle.status().worker.pid !== firstPid, 5_000, 'restart')
  assert.equal(handle.status().worker.restarts, 1)
  const third = await provider.decide(request(3), new AbortController().signal)
  assert.equal(third.status, 'ok')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(settledCount, 1)
})

test('request id mismatch is invalid_response, three failures open the circuit for the window', async (t) => {
  const { handle, provider } = await startFake(t, ['--wrong-request-id'], { circuitOpenMs: 600 })
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const outcomes: DecisionResult[] = []
  for (let index = 0; index < 3; index += 1) {
    await waitFor(() => handle.status().ready, 5_000, 'worker ready')
    outcomes.push(await provider.decide(request(index), new AbortController().signal))
  }
  assert.deepEqual(outcomes.map((row) => row.status === 'ok' ? 'ok' : row.reason), ['invalid_response', 'invalid_response', 'invalid_response'])
  assert.equal(handle.status().circuit.open, true)
  const blocked = await provider.decide(request(9), new AbortController().signal)
  assert.deepEqual(blocked, { status: 'unavailable', requestId: 'req-9', reason: 'service_not_ready' })
  await waitFor(() => !handle.status().circuit.open, 3_000, 'circuit closes')
})

test('truncated JSON and oversize frames are invalid_response and the misbehaving worker is replaced', async (t) => {
  for (const flag of ['--garbage', '--oversize']) {
    const { handle, provider } = await startFake(t, [flag])
    await waitFor(() => handle.status().ready, 5_000, 'ready')
    const pid = handle.status().worker.pid
    const result = await provider.decide(request(1), new AbortController().signal)
    assert.deepEqual(result, { status: 'unavailable', requestId: 'req-1', reason: 'invalid_response' }, flag)
    await waitFor(() => !pidAlive(pid), 3_000, `${flag} worker killed`)
  }
})

test('a hung inference passes the hard deadline: the owned worker is killed, nothing else is signalled', async (t) => {
  const { handle } = await startFake(t, ['--hang-on-infer'], { inferenceHardDeadlineMs: 300 })
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const pid = handle.status().worker.pid
  const provider = createLocalDecisionProvider({ socketPath: handle.socketPath, metadataPath: handle.metadataPath, connectionTimeoutMs: 100, requestTimeoutMs: 150 })
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.equal(result.status, 'unavailable')
  await waitFor(() => !pidAlive(pid), 3_000, 'hung worker killed')
  await waitFor(() => handle.status().worker.pid !== pid && handle.status().ready, 5_000, 'restarted')
  assert.equal(handle.status().counters.timeout, 1)
})

test('a wrong nonce is rejected without inference and a second instance cannot start on the same root', async (t) => {
  const { handle, runtimeRoot } = await startFake(t)
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const tampered = path.join(path.dirname(handle.metadataPath), 'tampered.json')
  const record = JSON.parse(await fsp.readFile(handle.metadataPath, 'utf8'))
  await fsp.writeFile(tampered, JSON.stringify({ ...record, nonce: 'wrong' }), { mode: 0o600 })
  const provider = createLocalDecisionProvider({ socketPath: handle.socketPath, metadataPath: tampered, connectionTimeoutMs: 100, requestTimeoutMs: 500 })
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.deepEqual(result, { status: 'unavailable', requestId: 'req-1', reason: 'invalid_response' })
  assert.equal(handle.status().counters.nonce_rejected, 1)
  assert.equal(handle.status().counters.requests, 0)
  await assert.rejects(startLocalDecisionService({
    runtimeRoot,
    worker: { file: process.execPath, args: [FAKE_WORKER], env: {} }
  }), /service_already_running/)
})

test('identical in-flight requests are coalesced into one inference', async (t) => {
  const { handle, provider } = await startFake(t, ['--result-delay-ms', '150'])
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const same = inputFixture({}, { requestId: 'req-a', summary: 'identical' })
  const twin = inputFixture({}, { requestId: 'req-b', summary: 'identical' })
  const [left, right] = await Promise.all([
    provider.decide(same, new AbortController().signal),
    provider.decide(twin, new AbortController().signal)
  ])
  assert.equal(left.status, 'ok')
  assert.equal(right.status, 'ok')
  assert.equal(left.requestId, 'req-a')
  assert.equal(right.requestId, 'req-b')
  assert.equal(handle.status().counters.coalesced, 1)
  assert.equal(handle.status().counters.ok, 1)
})

test('shadow submit never holds the caller and the broker records the sample without the summary text', async (t) => {
  const { handle, provider, paths } = await startFake(t, ['--result-delay-ms', '100'])
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const started = Date.now()
  provider.submitShadow(inputFixture({}, { requestId: 'req-shadow', summary: 'SECRET-LOOKING-TEXT sk-abcdef' }))
  assert.ok(Date.now() - started < 50)
  await waitFor(() => handle.status().counters.shadow === 1 && handle.status().counters.ok === 1, 5_000, 'shadow sample')
  await new Promise((resolve) => setTimeout(resolve, 50))
  const ledger = await fsp.readFile(paths.decisionLedgerPath, 'utf8')
  assert.match(ledger, /"mode":"shadow"/)
  assert.doesNotMatch(ledger, /SECRET-LOOKING-TEXT/)
  assert.match(ledger, /"policy_action":"/)
})

test('a fatal worker and a never-ready worker leave the service not ready without any cloud fallback', async (t) => {
  const fatal = await startFake(t, ['--fatal'], { readyTimeoutMs: 1_000, circuitOpenMs: 60_000 })
  const fatalResult = await fatal.provider.decide(request(1), new AbortController().signal)
  assert.equal(fatalResult.status, 'unavailable')
  assert.equal(fatalResult.reason, 'service_not_ready')
  const silent = await startFake(t, ['--no-ready'], { readyTimeoutMs: 300 })
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal(silent.handle.status().ready, false)
  const silentResult = await silent.provider.decide(request(2), new AbortController().signal)
  assert.equal(silentResult.status, 'unavailable')
})

test('close removes the socket and metadata and terminates the owned worker', async (t) => {
  const { handle } = await startFake(t)
  await waitFor(() => handle.status().ready, 5_000, 'ready')
  const pid = handle.status().worker.pid
  await handle.close()
  await assert.rejects(fsp.lstat(handle.socketPath))
  await assert.rejects(fsp.lstat(handle.metadataPath))
  await waitFor(() => !pidAlive(pid), 3_000, 'worker exit')
  const provider = createLocalDecisionProvider({ socketPath: handle.socketPath, metadataPath: handle.metadataPath, connectionTimeoutMs: 50, requestTimeoutMs: 200 })
  const result = await provider.decide(request(1), new AbortController().signal)
  assert.deepEqual(result, { status: 'unavailable', requestId: 'req-1', reason: 'service_not_ready' })
  const closedHandle: LocalDecisionServiceHandle = handle
  assert.equal(closedHandle.status().worker.alive, false)
})
