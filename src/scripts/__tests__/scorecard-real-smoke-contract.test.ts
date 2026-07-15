import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreEntry } from '../command-performance-scorecard-check.js'
import { commandRouteSmokeFor, scoreDollarEntry } from '../dollar-performance-scorecard-check.js'

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

test('critical command fixture smoke is capped below production score', () => {
  const row = scoreEntry(
    { name: 'setup', summary: 'Setup project', maturity: 'stable' },
    { kind: 'fixture', ok: true, generated_at: NOW, p95_ms: 0, json_contract: true },
    { now: NOW }
  )
  assert.equal(row.score, 70)
  assert.equal(row.evidence_tier, 'fixture')
})

test('critical dollar command requires routePrompt smoke and command/route smoke', () => {
  const entry = { command: '$Naruto', route: 'hardware-safe official subagent workflow', description: 'work route' }
  const onlyRoutePrompt = scoreDollarEntry(
    entry,
    { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed: { id: 'Naruto', command: '$Naruto', stopGate: 'naruto' } },
    undefined,
    { now: NOW }
  )
  assert.equal(onlyRoutePrompt.score, 0)
  assert.equal(onlyRoutePrompt.command_route_smoke, 'missing')

  const metadataOnlyCommandRoute = scoreDollarEntry(
    entry,
    { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed: { id: 'Naruto', command: '$Naruto', stopGate: 'naruto' } },
    { kind: 'command_route', ok: true, generated_at: NOW },
    { now: NOW }
  )
  assert.equal(metadataOnlyCommandRoute.score, 0)
  assert.equal(metadataOnlyCommandRoute.command_evidence_tier, 'metadata')

  const complete = scoreDollarEntry(
    entry,
    { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed: { id: 'Naruto', command: '$Naruto', stopGate: 'naruto' } },
    { kind: 'read_only', ok: true, generated_at: NOW, metadata_synced: true },
    { now: NOW }
  )
  assert.ok(complete.score > 0)
  assert.equal(complete.route_prompt_smoke, 'pass')
  assert.equal(complete.command_route_smoke, 'pass')
  assert.equal(complete.command_evidence_tier, 'read_only')
})

test('noncritical dollar aliases can score from route prompt metadata contract', () => {
  const entry = { command: '$Help', route: 'command help', description: 'Show command help' }
  const routed = { id: 'Help', command: '$Help', coverageExemptReason: 'help route is metadata backed' }
  const routePrompt = { kind: 'route_prompt', ok: true, generated_at: NOW, p95_ms: 1, routed }
  const commandSmoke = commandRouteSmokeFor(entry as any, routed as any)
  const row = scoreDollarEntry(entry, routePrompt, commandSmoke, { now: NOW })
  assert.equal(row.critical, false)
  assert.equal(row.score, 100)
  assert.equal(row.command_route_smoke, 'pass')
})
