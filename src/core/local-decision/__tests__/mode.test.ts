import test from 'node:test'
import assert from 'node:assert/strict'
import { adviseDecision } from '../mode.js'
import { inputFixture, okFixture } from './fixtures.js'
import type { LocalDecisionProvider } from '../types.js'

test('off never calls a provider', async () => {
  let calls = 0
  const input = inputFixture()
  const provider: LocalDecisionProvider = {
    async decide() { calls++; return okFixture(input) }
  }
  const out = await adviseDecision(input, 'off', provider, new AbortController().signal)
  assert.equal(calls, 0)
  assert.equal(out.action, 'keep_baseline')
  assert.equal(out.reason, 'disabled')
})

test('shadow through the await wrapper never changes the baseline and never calls the provider', async () => {
  let calls = 0
  const input = inputFixture()
  const provider: LocalDecisionProvider = {
    async decide() { calls++; return okFixture(input) }
  }
  const out = await adviseDecision(input, 'shadow', provider, new AbortController().signal)
  assert.equal(calls, 0)
  assert.equal(out.action, 'keep_baseline')
})

test('unavailable does not schedule a replacement model call', async () => {
  let calls = 0
  const input = inputFixture()
  const provider: LocalDecisionProvider = {
    async decide() {
      calls++
      return { status: 'unavailable', requestId: input.requestId, reason: 'timeout' }
    }
  }
  const out = await adviseDecision(input, 'advisory', provider, new AbortController().signal)
  assert.equal(out.action, 'keep_baseline')
  assert.equal(out.reason, 'timeout')
  assert.equal(calls, 1)
})

test('advisory validates the raw provider payload before policy and survives provider throws', async () => {
  const input = inputFixture()
  const garbage: LocalDecisionProvider = { async decide() { return { status: 'ok', requestId: input.requestId } as any } }
  const invalid = await adviseDecision(input, 'advisory', garbage, new AbortController().signal)
  assert.equal(invalid.action, 'keep_baseline')
  assert.match(invalid.reason, /^invalid_response:/)
  const throwing: LocalDecisionProvider = { async decide() { throw new Error('socket exploded') } }
  const thrown = await adviseDecision(input, 'advisory', throwing, new AbortController().signal)
  assert.equal(thrown.action, 'keep_baseline')
  assert.match(thrown.reason, /^provider_error:socket exploded/)
  const good: LocalDecisionProvider = { async decide() { return okFixture(input) } }
  const offered = await adviseDecision(input, 'advisory', good, new AbortController().signal)
  assert.equal(offered.action, 'offer_advisory')
  assert.equal(offered.advice.workloadClass, 'bounded')
  const aborted = new AbortController()
  aborted.abort()
  let calls = 0
  const counting: LocalDecisionProvider = { async decide() { calls++; return okFixture(input) } }
  const cancelled = await adviseDecision(input, 'advisory', counting, aborted.signal)
  assert.equal(cancelled.reason, 'cancelled')
  assert.equal(calls, 0)
})
