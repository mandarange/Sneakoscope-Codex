import path from 'node:path'
import { appendJsonl, ensureDir, exists, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export const ZELLIJ_LANE_RENDER_SCHEMA = 'sks.zellij-lane-render.v1'

export interface ZellijLaneRenderOptions {
  missionId: string
  slot: string
  ledgerRoot: string
  follow?: boolean
  once?: boolean
  intervalMs?: number
  maxIterations?: number
}

export async function renderZellijLaneFrame(opts: ZellijLaneRenderOptions) {
  const root = path.resolve(opts.ledgerRoot)
  const slot = normalizeSlot(opts.slot)
  const laneDir = path.join(root, 'lanes', slot)
  await ensureDir(laneDir)
  const laneJson = await readJson<any>(path.join(laneDir, 'lane.json'), null)
  const laneMd = await readText(path.join(laneDir, 'lane.md'), '')
  const dashboard = await buildLaneDashboard(root, slot, laneJson)
  const frame = [
    'SKS Lane',
    `Mission: ${opts.missionId}`,
    `Slot: ${slot}`,
    `updated: ${nowIso()}`,
    `Workers: ${dashboard.workers}`,
    `Patch queue: ${dashboard.patch_queue}`,
    `Current file: ${dashboard.current_file}`,
    `Blockers: ${dashboard.blockers}`,
    `Artifacts: ${dashboard.artifacts}`,
    laneMd ? `Lane note:\n${String(laneMd).trimEnd()}` : 'Lane note: no lane.md; rendering canonical ledger state',
    ''
  ].join('\n')
  const report = {
    schema: ZELLIJ_LANE_RENDER_SCHEMA,
    generated_at: nowIso(),
    mission_id: opts.missionId,
    slot,
    ledger_root: root,
    status: laneJson?.status || 'idle',
    dashboard,
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
      process.stdout.write('\u001b[2J\u001b[H')
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
  const workerSummary = [
    scheduler ? `active ${scheduler.active_slot_count ?? 'n/a'}/${scheduler.target_active_slots ?? 'n/a'}` : null,
    scheduler ? `pending ${scheduler.pending_count ?? 'n/a'}` : null,
    scheduler ? `completed ${scheduler.completed_count ?? 'n/a'}` : null,
    swarm ? `sessions ${arrayFrom(swarm, ['sessions', 'workers', 'items']).length}` : null,
    laneJson?.current_session_id ? `slot session ${laneJson.current_session_id}` : null
  ].filter(Boolean).join(', ') || 'idle'
  const patchSummary = [
    `${queueItems.length} queued`,
    apply ? `apply ${statusOf(apply)}` : null,
    verify ? `verify ${statusOf(verify)}` : null,
    rollback ? `rollback ${statusOf(rollback)}` : null
  ].filter(Boolean).join(', ')
  const blockerSummary = collectBlockers([scheduler, swarm, proof, queue, apply, verify, rollback, laneJson]).slice(0, 5).join('; ') || 'none'
  const presentArtifacts = artifacts.filter((name) => data[name])
  return {
    workers: workerSummary,
    patch_queue: patchSummary,
    current_file: currentFile,
    blockers: blockerSummary,
    artifacts: presentArtifacts.length ? presentArtifacts.join(', ') : 'none'
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
