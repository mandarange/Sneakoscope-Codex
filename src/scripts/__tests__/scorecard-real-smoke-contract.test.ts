import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreEntry } from '../command-performance-scorecard-check.js'
import { scoreDollarEntry } from '../dollar-performance-scorecard-check.js'

const NOW = '2026-07-08T00:00:00.000Z'

test('critical command scores 0 without real smoke evidence', () => {
  const row = scoreEntry({ name: 'doctor', summary: 'Check install', maturity: 'stable' }, undefined, { now: NOW })
  assert.equal(row.critical, true)
  assert.equal(row.score, 0)
  assert.equal(row.smoke_status, 'missing')
})

test('stale command smoke cannot score a critical command', () => {
  const row = scoreEntry(
    { name: 'doctor', summary: 'Check install', maturity: 'stable' },
    { kind: 'read_only', ok: true, generated_at: '2026-07-07T00:00:00.000Z', p95_ms: 10, json_contract: true },
    { now: NOW }
  )
  assert.equal(row.score, 0)
  assert.equal(row.smoke_status, 'stale')
})

test('hidden or deprecated command without reason is penalized', () => {
  const visible = scoreEntry(
    { name: 'example', summary: 'Example', maturity: 'beta' },
    { kind: 'read_only', ok: true, generated_at: NOW, p95_ms: 10, json_contract: true },
    { now: NOW }
  )
  const deprecated = scoreEntry(
    { name: 'example', summary: 'Example', maturity: 'beta', deprecated: true },
    { kind: 'read_only', ok: true, generated_at: NOW, p95_ms: 10, json_contract: true },
    { now: NOW }
  )
  assert.equal(deprecated.score, visible.score - 25)
})

test('failed critical command smoke scores 0', () => {
  const row = scoreEntry(
    { name: 'super-search', summary: 'Source intelligence', maturity: 'beta' },
    { kind: 'read_only', ok: false, generated_at: NOW, p95_ms: 10, json_contract: true },
    { now: NOW }
  )
  assert.equal(row.score, 0)
  assert.equal(row.smoke_status, 'failed')
})

test('critical dollar command requires routePrompt smoke and command/route smoke', () => {
  const entry = { command: '$Naruto', route: 'hardware-safe massive parallel work swarm', description: 'work route' }
  const onlyRoutePrompt = scoreDollarEntry(
    entry,
    { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed: { id: 'Naruto', command: '$Naruto', stopGate: 'naruto' } },
    undefined,
    { now: NOW }
  )
  assert.equal(onlyRoutePrompt.score, 0)
  assert.equal(onlyRoutePrompt.command_route_smoke, 'missing')

  const complete = scoreDollarEntry(
    entry,
    { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed: { id: 'Naruto', command: '$Naruto', stopGate: 'naruto' } },
    { kind: 'command_route', ok: true, generated_at: NOW },
    { now: NOW }
  )
  assert.ok(complete.score > 0)
  assert.equal(complete.route_prompt_smoke, 'pass')
  assert.equal(complete.command_route_smoke, 'pass')
})
