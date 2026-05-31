import path from 'node:path'
import { appendJsonl, ensureDir, exists, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const ZELLIJ_LANE_RENDER_SCHEMA = 'sks.zellij-lane-render.v1'

// Default render width. Zellij panes are commonly 80/100/120 columns; the frame
// must stay readable (no wraps, no overflow) across that range.
export const ZELLIJ_LANE_DEFAULT_WIDTH = 80
export const ZELLIJ_LANE_MAX_BLOCKERS = 3

// Footer command palette. Every `sks ...` token here MUST be a real command
// (enforced by scripts/zellij-ui-design-check.mjs). `Ctrl+q` is a Zellij keybind.
export const ZELLIJ_LANE_FOOTER_KEYS = [
  'Ctrl+q detach',
  'sks doctor --fix',
  'sks zellij status',
  'sks agent rollback-patches'
]

// Canonical lane section sets (1.20.2 Area 5.2).
// ZELLIJ_LANE_SECTIONS is the full composed-frame superset the UI-design fixture
// gate enforces. ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS is the strict SUBSET that the
// runtime screen-proof reliably scrapes from a live terminal — the 7 extra
// sections (Fast, Codex child, Work, Patch, Lease, Protected, Rollback) are
// detail rows that may be elided/wrapped on a real pane, so requiring them in
// the live screen-proof would make it flaky. The subset relationship is asserted
// by zellij:doctor-readiness so the two layers can never silently diverge.
export const ZELLIJ_LANE_SECTIONS = [
  'SKS Lane', 'Mission', 'Mode', 'Fast', 'Workers', 'Codex child', 'Work', 'Current',
  'Queue', 'Patch', 'Safety', 'Lease', 'Protected', 'Rollback', 'Blockers', 'Reports', 'Keys:'
]

export const ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS = [
  'SKS Lane', 'Mission', 'Mode', 'Workers', 'Current', 'Queue', 'Safety', 'Blockers', 'Reports', 'Keys:'
]

export interface ZellijLaneRenderOptions {
  missionId: string
  slot: string
  ledgerRoot: string
  follow?: boolean
  once?: boolean
  intervalMs?: number
  maxIterations?: number
  width?: number
  color?: boolean
}

export interface ZellijLaneFrameView {
  missionId: string
  slot: string
  updatedAt: string
  mode: string
  fast: string
  workers: string
  codexChild: string
  currentFile: string
  queue: string
  patch: string
  lease: string
  protectedPaths: string
  rollback: string
  blockers: string[]
  reports: string
  laneNote?: string
}

interface ComposeOptions {
  width?: number | undefined
  color?: boolean | undefined
  maxBlockers?: number | undefined
}

const STATUS_COLORS: Record<string, string> = {
  ok: '[32m', // green
  active: '[36m', // cyan
  warning: '[33m', // yellow
  blocked: '[31m' // red
}
const RESET = '[0m'

function colorEnabled(opts: ComposeOptions): boolean {
  if (typeof opts.color === 'boolean') return opts.color
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false
  return Boolean((process.stdout as any)?.isTTY)
}

function paint(text: string, status: keyof typeof STATUS_COLORS | null, enabled: boolean): string {
  if (!enabled || !status || !STATUS_COLORS[status]) return text
  return `${STATUS_COLORS[status]}${text}${RESET}`
}

// Shorten a string to fit `max` visible chars, keeping head and tail (so long
// file paths stay recognizable). Pure on the visible (ANSI-free) string.
export function middleEllipsis(value: string, max: number): string {
  const text = String(value ?? '')
  if (max <= 1) return text.length > max ? text.slice(0, Math.max(0, max)) : text
  if (text.length <= max) return text
  if (max <= 3) return text.slice(0, max)
  const keep = max - 1 // room for the ellipsis char
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

function statusFor(value: string): keyof typeof STATUS_COLORS | null {
  const v = String(value || '').toLowerCase()
  if (!v || v === 'none' || v === 'n/a') return null
  if (/(blocked|fail|error|missing|denied|conflict)/.test(v)) return 'blocked'
  if (/(warn|stale|pending|optional|too[_ -]?old)/.test(v)) return 'warning'
  if (/(active|running|applying)/.test(v)) return 'active'
  if (/(ok|ready|on|verified|done|complete|clean)/.test(v)) return 'ok'
  return null
}

/**
 * Compose the lane frame from a plain view object. Pure (no IO) so gates can
 * render it deterministically at multiple widths. Guarantees:
 *  - no rendered line exceeds `width`
 *  - long paths use middle-ellipsis
 *  - at most `maxBlockers` blockers shown; the rest point at the report artifact
 *  - color is applied only to status tokens, and only when enabled
 *  - readable with color stripped (screen-proof strips ANSI)
 */
export function composeLaneFrame(view: ZellijLaneFrameView, opts: ComposeOptions = {}): string {
  const width = Math.max(40, Number(opts.width || ZELLIJ_LANE_DEFAULT_WIDTH))
  const maxBlockers = Math.max(1, Number(opts.maxBlockers || ZELLIJ_LANE_MAX_BLOCKERS))
  const color = colorEnabled(opts)
  const labelWidth = 13
  const valueWidth = Math.max(8, width - labelWidth - 1)
  const lines: string[] = []

  const header = `SKS Lane: ${view.slot}`
  lines.push(middleEllipsis(header, width))

  const row = (label: string, value: string, status?: keyof typeof STATUS_COLORS | null) => {
    const visible = middleEllipsis(String(value ?? ''), valueWidth)
    const st = status === undefined ? statusFor(visible) : status
    const padded = `${label}`.padEnd(labelWidth)
    lines.push(`${padded}${paint(visible, st ?? null, color)}`)
  }
  const section = (title: string) => {
    const dashes = Math.max(0, width - title.length - 2)
    lines.push(`${title} ${'─'.repeat(dashes)}`)
  }

  row('Mission', view.missionId)
  row('Mode', view.mode)
  row('Fast', view.fast)
  row('Workers', view.workers)
  row('Codex child', view.codexChild)

  section('Work')
  row('Current', view.currentFile)
  row('Queue', view.queue)
  row('Patch', view.patch)

  section('Safety')
  row('Lease', view.lease)
  row('Protected', view.protectedPaths)
  row('Rollback', view.rollback)

  section('Blockers')
  const blockers = (view.blockers || []).filter(Boolean)
  if (blockers.length === 0) {
    row('', 'none', 'ok')
  } else {
    for (const blocker of blockers.slice(0, maxBlockers)) {
      lines.push(`  ${paint(middleEllipsis(blocker, width - 2), 'blocked', color)}`)
    }
    if (blockers.length > maxBlockers) {
      const extra = blockers.length - maxBlockers
      lines.push(middleEllipsis(`  +${extra} more → ${view.reports}`, width))
    }
  }

  section('Reports')
  lines.push(middleEllipsis(`  proof: ${view.reports}`, width))

  section('Keys')
  // Footer: real commands only. Wrap onto multiple lines if needed for width.
  let current = 'Keys:'
  for (const key of ZELLIJ_LANE_FOOTER_KEYS) {
    const candidate = current === 'Keys:' ? `${current} ${key}` : `${current} · ${key}`
    if (candidate.length > width) {
      lines.push(current)
      current = `  ${key}`
    } else {
      current = candidate
    }
  }
  lines.push(current)

  if (view.laneNote) {
    section('Lane note')
    for (const noteLine of String(view.laneNote).trimEnd().split('\n')) {
      lines.push(middleEllipsis(noteLine, width))
    }
  }

  lines.push('')
  return lines.join('\n')
}

export async function renderZellijLaneFrame(opts: ZellijLaneRenderOptions) {
  const root = path.resolve(opts.ledgerRoot)
  const slot = normalizeSlot(opts.slot)
  const laneDir = path.join(root, 'lanes', slot)
  await ensureDir(laneDir)
  const laneJson = await readJson<any>(path.join(laneDir, 'lane.json'), null)
  const laneMd = await readText(path.join(laneDir, 'lane.md'), '')
  const dashboard = await buildLaneDashboard(root, slot, laneJson)
  const view: ZellijLaneFrameView = {
    missionId: opts.missionId,
    slot,
    updatedAt: nowIso(),
    mode: dashboard.mode,
    fast: dashboard.fast,
    workers: dashboard.workers,
    codexChild: dashboard.codex_child,
    currentFile: dashboard.current_file,
    queue: dashboard.queue,
    patch: dashboard.patch,
    lease: dashboard.lease,
    protectedPaths: dashboard.protected,
    rollback: dashboard.rollback,
    blockers: dashboard.blocker_list,
    reports: dashboard.reports,
    laneNote: laneMd ? String(laneMd) : 'no lane.md; rendering canonical ledger state'
  }
  const frame = composeLaneFrame(view, { width: opts.width, color: opts.color })
  const report = {
    schema: ZELLIJ_LANE_RENDER_SCHEMA,
    generated_at: nowIso(),
    mission_id: opts.missionId,
    slot,
    ledger_root: root,
    status: laneJson?.status || 'idle',
    dashboard,
    view,
    frame_bytes: Buffer.byteLength(frame),
    stdout_only: true,
    stderr_file_policy: 'reserved_for_errors_only'
  }
  await writeJsonAtomic(path.join(laneDir, 'zellij-lane-render.json'), report)
  await appendJsonl(path.join(root, 'zellij-lane-renderer-heartbeat.jsonl'), report)
  return { report, frame }
}

export async function runZellijLaneRenderer(opts: ZellijLaneRenderOptions) {
  const intervalMs = Math.max(250, Number(opts.intervalMs || 1500))
  const maxIterations = opts.once || opts.follow !== true ? 1 : Math.max(0, Number(opts.maxIterations || 0))
  let iterations = 0
  try {
    for (;;) {
      const { frame } = await renderZellijLaneFrame(opts)
      process.stdout.write('[2J[H')
      process.stdout.write(frame)
      iterations += 1
      if (opts.once || opts.follow !== true) return { ok: true, iterations }
      if (maxIterations > 0 && iterations >= maxIterations) return { ok: true, iterations }
      if (await exists(path.join(path.resolve(opts.ledgerRoot), 'lanes', '.drain'))) return { ok: true, iterations, drained: true }
      await sleep(intervalMs)
    }
  } catch (err: any) {
    const root = path.resolve(opts.ledgerRoot)
    const slot = normalizeSlot(opts.slot)
    const laneDir = path.join(root, 'lanes', slot)
    const report = {
      schema: 'sks.zellij-lane-error.v1',
      generated_at: nowIso(),
      mission_id: opts.missionId,
      slot,
      ok: false,
      error: err?.message || String(err)
    }
    await writeJsonAtomic(path.join(laneDir, 'lane-error.json'), report)
    return { ok: false, iterations, error: report.error }
  }
}

export async function seedZellijLane(root: string, slot: string, text: string) {
  const laneDir = path.join(root, 'lanes', normalizeSlot(slot))
  await ensureDir(laneDir)
  await writeTextAtomic(path.join(laneDir, 'lane.md'), text)
}

function normalizeSlot(value: unknown): string {
  const raw = String(value || 'slot-001')
  if (/^slot-\d{3,}$/.test(raw)) return raw
  const n = Number.parseInt(raw.replace(/\D+/g, ''), 10)
  return `slot-${String(Number.isFinite(n) && n > 0 ? n : 1).padStart(3, '0')}`
}

async function buildLaneDashboard(root: string, slot: string, laneJson: any) {
  const artifacts = [
    'agent-scheduler-state.json',
    'agent-native-cli-session-swarm.json',
    'real-codex-parallel-proof.json',
    'agent-patch-queue.json',
    'agent-patch-apply-results.json',
    'agent-patch-verification-results.json',
    'agent-patch-rollback-proof.json',
    'agent-proof-evidence.json'
  ]
  const data: Record<string, any> = {}
  for (const name of artifacts) data[name] = await readJson<any>(path.join(root, name), null)
  const scheduler = data['agent-scheduler-state.json']
  const swarm = data['agent-native-cli-session-swarm.json']
  const proof = data['agent-proof-evidence.json']
  const queue = data['agent-patch-queue.json']
  const apply = data['agent-patch-apply-results.json']
  const verify = data['agent-patch-verification-results.json']
  const rollback = data['agent-patch-rollback-proof.json']
  const queueItems = arrayFrom(queue, ['queue', 'items', 'patches', 'entries', 'pending'])
  const currentItem = queueItems.find((item) => item?.slot_id === slot || item?.slot === slot) || queueItems[0] || null
  const currentFile = firstString([
    laneJson?.current_file,
    laneJson?.current_patch_target,
    currentItem?.current_file,
    currentItem?.target_file,
    currentItem?.file,
    currentItem?.path,
    currentItem?.files?.[0],
    firstPatchFile(apply),
    firstPatchFile(verify)
  ]) || 'none'

  // Mode: Agent / Team / MAD / Naruto. Prefer explicit lane/scheduler hints.
  const mode = firstString([
    laneJson?.mode,
    scheduler?.mode,
    scheduler?.naruto_mode ? 'Naruto' : null,
    swarm?.mode
  ]) || 'Agent'

  // Fast service tier.
  const serviceTier = firstString([laneJson?.service_tier, scheduler?.service_tier, swarm?.service_tier])
  const fastMode = laneJson?.fast_mode ?? scheduler?.fast_mode ?? swarm?.fast_mode
  const fast = serviceTier === 'fast' || fastMode === true
    ? `on · service_tier=${serviceTier || 'fast'}`
    : (serviceTier ? `service_tier=${serviceTier}` : 'off')

  // Workers: live active/target + (naruto) clone fan-out.
  const cloneTotal = numberOf([scheduler?.clones, scheduler?.clone_count, swarm?.clones])
  const cloneActive = numberOf([scheduler?.active_clone, scheduler?.active_slot_count])
  const workers = [
    scheduler ? `active ${scheduler.active_slot_count ?? 'n/a'}/${scheduler.target_active_slots ?? scheduler.max_active_slots ?? 'n/a'}` : 'idle',
    cloneTotal ? `clone ${pad3(cloneActive || 0)}/${pad3(cloneTotal)}` : null,
    scheduler ? `pending ${scheduler.pending_count ?? 'n/a'}` : null
  ].filter(Boolean).join(' · ') || 'idle'

  // Codex child sessions.
  const sessions = arrayFrom(swarm, ['sessions', 'workers', 'items'])
  const codexChild = sessions.length > 0
    ? `active ${sessions.length}`
    : (swarm ? 'optional' : 'not-run')

  const queueSummary = scheduler
    ? `pending ${scheduler.pending_count ?? 0} · applying ${scheduler.active_slot_count ?? 0} · verified ${numberOf([scheduler.verified_count, scheduler.completed_count]) ?? 0} · blocked ${scheduler.blocked_count ?? 0}`
    : `pending ${queueItems.length}`
  const patchSummary = [
    apply ? `apply ${statusOf(apply)}` : null,
    verify ? `verify ${statusOf(verify)}` : null,
    rollback ? `rollback ${statusOf(rollback)}` : null,
    `model-authored ${countPatches(apply)}`
  ].filter(Boolean).join(' · ') || 'none'

  const lease = firstString([laneJson?.lease_status, apply?.lease_status]) || (apply ? statusOf(apply) : 'ok')
  const protectedPaths = firstString([laneJson?.protected_status, apply?.protected_status]) || 'ok'
  const rollbackStatus = rollback ? statusOf(rollback) : 'ready'

  const blockerList = collectBlockers([scheduler, swarm, proof, queue, apply, verify, rollback, laneJson])
  const presentArtifacts = artifacts.filter((name) => data[name])
  const reports = firstString([
    proof?.report_path,
    laneJson?.report_path,
    path.join(root, 'agent-proof-evidence.json')
  ]) || path.join(root, 'agent-proof-evidence.json')

  return {
    mode,
    fast,
    workers,
    codex_child: codexChild,
    current_file: currentFile,
    queue: queueSummary,
    patch: patchSummary,
    lease,
    protected: protectedPaths,
    rollback: rollbackStatus,
    blockers: blockerList.slice(0, 5).join('; ') || 'none',
    blocker_list: blockerList,
    artifacts: presentArtifacts.length ? presentArtifacts.join(', ') : 'none',
    reports
  }
}

function arrayFrom(value: any, keys: string[]): any[] {
  if (Array.isArray(value)) return value
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key]
  return []
}

function firstString(values: unknown[]): string | null {
  for (const value of values.flat()) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function numberOf(values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function pad3(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(3, '0')
}

function countPatches(value: any): number {
  return arrayFrom(value, ['results', 'items', 'patches', 'entries']).length
}

function firstPatchFile(value: any): string | null {
  const entries = arrayFrom(value, ['results', 'items', 'patches', 'entries'])
  return firstString(entries.flatMap((entry) => [entry?.file, entry?.path, entry?.target_file, entry?.files?.[0]]))
}

function statusOf(value: any): string {
  if (value?.ok === true) return 'ok'
  if (value?.ok === false) return 'blocked'
  return String(value?.status || 'recorded')
}

function collectBlockers(values: any[]): string[] {
  const blockers: string[] = []
  for (const value of values) collectBlockersInto(value, blockers, 0)
  return [...new Set(blockers.filter(Boolean).map((item) => item.slice(0, 160)))]
}

function collectBlockersInto(value: any, out: string[], depth: number) {
  if (!value || depth > 3) return
  if (Array.isArray(value)) {
    for (const item of value) collectBlockersInto(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  for (const key of ['blockers', 'errors', 'unresolved_items']) {
    const items = value[key]
    if (Array.isArray(items)) for (const item of items) out.push(String(item))
  }
  if (value.ok === false && value.status) out.push(String(value.status))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
