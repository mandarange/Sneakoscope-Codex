import type { ZellijSlotTelemetrySnapshot } from './zellij-slot-telemetry.js'

export interface ViewportPin {
  viewport: number
  slot_key: string
}

export interface ViewportBindingInput {
  snapshot: ZellijSlotTelemetrySnapshot | null
  pins: ViewportPin[]
  previous: Array<string | null>
  viewportCount: number
}

export interface ViewportBinding {
  slotKey: string | null
  reason: 'pinned' | 'kept' | 'assigned' | 'idle'
}

const ACTIVE = new Set(['running', 'verifying', 'launching'])
const ATTENTION = new Set(['failed', 'blocked', 'timed_out'])

function scoreSlot(s: any, now: number): number {
  const ts = Date.parse(String(s.latest_ts || '')) || 0
  const age = Math.max(0, now - ts)
  const st = String(s.status || '').toLowerCase()
  if (ATTENTION.has(st) && age < 3 * 60_000) return 4_000_000 - age / 1000
  if (st === 'running') return 3_000_000 - age / 1000
  if (st === 'verifying') return 2_000_000 - age / 1000
  if (st === 'queued' || st === 'launching') return 1_000_000 - age / 1000
  return -1
}

export function bindViewports(input: ViewportBindingInput): ViewportBinding[] {
  const count = Math.max(0, Math.floor(Number(input.viewportCount) || 0))
  const now = Date.now()
  const slots = Object.entries(input.snapshot?.slots || {})
    .map(([key, s]) => ({ key, s, score: scoreSlot(s, now) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
  const taken = new Set<string>()
  const out: ViewportBinding[] = Array.from({ length: count }, () => ({ slotKey: null, reason: 'idle' }))

  for (const pin of input.pins || []) {
    const i = Math.floor(Number(pin.viewport) || 0) - 1
    if (i < 0 || i >= count) continue
    if (!input.snapshot?.slots?.[pin.slot_key]) continue
    out[i] = { slotKey: pin.slot_key, reason: 'pinned' }
    taken.add(pin.slot_key)
  }

  for (let i = 0; i < count; i += 1) {
    if (out[i]?.slotKey) continue
    const prev = input.previous[i]
    if (!prev || taken.has(prev)) continue
    const st = String(input.snapshot?.slots?.[prev]?.status || '').toLowerCase()
    if (ACTIVE.has(st)) {
      out[i] = { slotKey: prev, reason: 'kept' }
      taken.add(prev)
    }
  }

  const rest = slots.filter((row) => !taken.has(row.key))
  for (let i = 0; i < count; i += 1) {
    if (out[i]?.slotKey) continue
    const next = rest.shift()
    if (!next) break
    out[i] = { slotKey: next.key, reason: 'assigned' }
    taken.add(next.key)
  }

  return out
}
