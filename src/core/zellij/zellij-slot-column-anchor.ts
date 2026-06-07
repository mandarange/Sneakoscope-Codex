import fs from 'node:fs'
import path from 'node:path'

export interface ZellijSlotColumnAnchorInput {
  activeWorkers?: number
  visiblePaneCap?: number
  headlessWorkers?: number
  queueDepth?: number
  mode?: string
}

export function renderZellijSlotColumnAnchor(input: ZellijSlotColumnAnchorInput = {}): string {
  const active = nonNegativeInt(input.activeWorkers, 0)
  const visible = Math.max(1, nonNegativeInt(input.visiblePaneCap, active || 1))
  const headless = nonNegativeInt(input.headlessWorkers, 0)
  const queue = nonNegativeInt(input.queueDepth, 0)
  return `SLOTS active ${active}/${visible} · headless ${headless} · q ${queue}`
}

export async function renderZellijSlotColumnAnchorFromArtifacts(input: {
  artifactRoot: string
  missionId: string
  mode?: string
}): Promise<string> {
  const root = path.resolve(input.artifactRoot)
  const missionDir = inferMissionDir(root, input.missionId)
  const snapshot = await readJson(path.join(missionDir, 'zellij-dashboard-snapshot.json'))
  const rightColumn = await readJson(path.join(missionDir, 'zellij-right-column-state.json'))
  const activeWorkers = Number(snapshot?.active_workers ?? rightColumn?.visible_worker_panes?.filter((row: any) => row?.status === 'running' || row?.status === 'launching').length ?? 0)
  const visiblePaneCap = Number(snapshot?.visible_panes ?? Math.max(1, rightColumn?.visible_worker_panes?.length || activeWorkers || 1))
  const headlessWorkers = Number(snapshot?.headless_workers ?? rightColumn?.headless_workers?.filter((row: any) => !row?.status || row?.status === 'running').length ?? 0)
  const queueDepth = Number(snapshot?.queue_depth ?? 0)
  const anchorInput: ZellijSlotColumnAnchorInput = { activeWorkers, visiblePaneCap, headlessWorkers, queueDepth }
  if (input.mode !== undefined) anchorInput.mode = input.mode
  return renderZellijSlotColumnAnchor(anchorInput)
}

export function buildZellijSlotColumnAnchorCommand(input: {
  nodePath?: string
  cliPath: string
  missionId: string
  mode: string
  artifactRoot: string
  watch?: boolean
}) {
  const args = [
    input.cliPath,
    'zellij-slot-column-anchor',
    '--mission', input.missionId,
    '--mode', input.mode,
    '--artifact-root', input.artifactRoot,
    ...(input.watch ? ['--watch'] : [])
  ]
  return [input.nodePath || process.execPath, ...args].map(shellQuote).join(' ')
}

function inferMissionDir(root: string, missionId: string) {
  if (path.basename(root) === 'agents' && path.basename(path.dirname(root)) === missionId) return path.dirname(root)
  if (path.basename(root) === missionId && path.basename(path.dirname(root)) === 'missions') return root
  return path.join(root, '.sneakoscope', 'missions', missionId)
}

async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
