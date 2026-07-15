import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLatencySamples } from '../release-latency-slo.js'

test('release latency SLO uses a strict less-than ceiling', () => {
  const below = evaluateLatencySamples('menubar_first_state_render', 250, 'fixture', [249.999])
  assert.equal(below.ok, true)
  assert.equal(below.blocker, null)

  const equal = evaluateLatencySamples('menubar_first_state_render', 250, 'fixture', [250])
  assert.equal(equal.ok, false)
  assert.equal(equal.blocker, 'release_latency_slo_exceeded:menubar_first_state_render')
})

test('release latency SLO fails closed when a producer has no samples', () => {
  const result = evaluateLatencySamples('update_cache_read', 50, 'fixture', [])
  assert.equal(result.status, 'producer_failed')
  assert.equal(result.ok, false)
  assert.equal(result.p95_ms, null)
  assert.equal(result.blocker, 'release_latency_producer_failed:update_cache_read')
})
