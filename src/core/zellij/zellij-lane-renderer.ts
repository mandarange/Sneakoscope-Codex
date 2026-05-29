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
  const frame = [
    `SKS ${opts.missionId} ${slot}`,
    `updated: ${nowIso()}`,
    laneMd ? String(laneMd).trimEnd() : 'idle',
    ''
  ].join('\n')
  const report = {
    schema: ZELLIJ_LANE_RENDER_SCHEMA,
    generated_at: nowIso(),
    mission_id: opts.missionId,
    slot,
    ledger_root: root,
    status: laneJson?.status || 'idle',
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
  const maxIterations = opts.once || opts.follow !== true ? 1 : Math.max(1, Number(opts.maxIterations || 0))
  let iterations = 0
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
