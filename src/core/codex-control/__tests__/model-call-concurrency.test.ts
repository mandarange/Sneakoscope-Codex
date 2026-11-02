import test from 'node:test'
import assert from 'node:assert/strict'
import { getModelCallSemaphore } from '../model-call-concurrency.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

for (const budget of [1, 3]) {
  test(`model-call handoff reserves the released slot for a queued call (budget ${budget})`, async () => {
    const semaphore = getModelCallSemaphore(`handoff-${budget}`, budget)
    const releaseFirst = deferred()
    const releaseOthers = deferred()
    const queuedStarted = deferred()
    const starts: string[] = []
    let running = 0
    let maxRunning = 0
    const work = (name: string, hold: Promise<void>) => {
      starts.push(name)
      running += 1
      maxRunning = Math.max(maxRunning, running)
      if (name === 'queued') queuedStarted.resolve()
      void hold.then(() => { running -= 1 })
      return hold
    }

    const holders = Array.from({ length: budget }, (_, index) =>
      semaphore.run(() => work(`holder-${index}`, index === 0 ? releaseFirst.promise : releaseOthers.promise)))
    await Promise.resolve()
    const queued = semaphore.run(() => work('queued', releaseOthers.promise))
    let newcomer: Promise<void> | undefined
    try {
      assert.equal(running, budget)
      assert.equal(semaphore.queued, 1)
      releaseFirst.resolve()
      // Arrive after the holder releases, before the queued acquire resumes.
      // Timers would miss this Promise/microtask ordering.
      queueMicrotask(() => { newcomer = semaphore.run(() => work('newcomer', releaseOthers.promise)) })
      await queuedStarted.promise
      assert.equal(maxRunning, budget)
      assert.equal(semaphore.active, budget)
      assert.equal(semaphore.maxObserved, budget)
      assert.equal(semaphore.queued, 1)
      assert.equal(starts.includes('newcomer'), false)
    } finally {
      releaseFirst.resolve()
      releaseOthers.resolve()
      await Promise.all([...holders, queued, newcomer])
    }
    assert.deepEqual(starts.slice(budget), ['queued', 'newcomer'])
    assert.equal(running, 0)
    assert.equal(semaphore.active, 0)
    assert.equal(semaphore.queued, 0)
  })
}

test('model-call rejection hands off in FIFO order and leaves the slot reusable', async () => {
  const semaphore = getModelCallSemaphore('handoff-rejection', 1)
  const release = deferred()
  const starts: number[] = []
  const failure = new Error('model call failed')
  const first = semaphore.run(() => release.promise)
  const second = semaphore.run(() => { starts.push(2); throw failure })
  const rejected = assert.rejects(second, (error) => error === failure)
  const third = semaphore.run(async () => { starts.push(3) })
  release.resolve()
  await Promise.all([first, rejected, third])
  await semaphore.run(async () => { starts.push(4) })
  assert.deepEqual(starts, [2, 3, 4])
  assert.equal(semaphore.maxObserved, 1)
  assert.equal(semaphore.active, 0)
  assert.equal(semaphore.queued, 0)
})
