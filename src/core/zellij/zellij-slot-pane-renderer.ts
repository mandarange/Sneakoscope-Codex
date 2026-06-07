import fs from 'node:fs'
import path from 'node:path'

export interface ZellijSlotPaneRenderInput {
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  status?: string | null
  currentTask?: string | null
  currentFile?: string | null
  patchStatus?: string | null
  verifyStatus?: string | null
  heartbeatAgeMs?: number | null
  worktreeId?: string | null
  mode?: 'compact-slots' | 'dashboard-plus-slots' | 'full-debug'
}

export function renderZellijSlotPane(input: ZellijSlotPaneRenderInput): string {
  const mode = input.mode || 'compact-slots'
  const maxLines = mode === 'compact-slots' ? 5 : mode === 'dashboard-plus-slots' ? 8 : 20
  const task = trimInline(input.currentFile || input.currentTask || '-', 56)
  const heartbeat = input.heartbeatAgeMs == null
    ? 'unknown'
    : input.heartbeatAgeMs < 1000
      ? 'now'
      : `${Math.max(1, Math.round(input.heartbeatAgeMs / 1000))}s ago`
  const rows = [
    `${input.slotId} gen-${Math.max(1, Math.floor(Number(input.generationIndex) || 1))}`,
    `${trimInline(input.role || 'worker', 18)} - ${trimInline(input.backend || 'codex-sdk', 18)} - ${trimInline(input.worktreeId || '-', 18)}`,
    `status: ${trimInline(input.status || 'running', 14)} ${task}`,
    `patch: ${trimInline(input.patchStatus || 'queued', 18)}  verify: ${trimInline(input.verifyStatus || 'queued', 18)}`,
    `heartbeat: ${heartbeat}`
  ]
  return rows.slice(0, maxLines).join('\n')
}

export async function renderZellijSlotPaneFromArtifacts(input: {
  artifactDir: string
  slotId: string
  generationIndex: number
  role?: string | null
  backend?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
}): Promise<string> {
  const artifactDir = path.resolve(input.artifactDir)
  const result = await readJson(path.join(artifactDir, 'worker-result.json'))
  const heartbeatPath = path.join(artifactDir, 'worker-heartbeat.jsonl')
  const heartbeatMtime = await statMtimeMs(heartbeatPath)
  const now = Date.now()
  return renderZellijSlotPane({
    slotId: input.slotId,
    generationIndex: input.generationIndex,
    role: input.role || result?.persona_id || result?.agent_id || null,
    backend: input.backend || result?.backend || null,
    status: result?.status || (heartbeatMtime ? 'running' : 'launching'),
    currentTask: result?.summary || null,
    currentFile: Array.isArray(result?.changed_files) ? result.changed_files[0] : null,
    patchStatus: Array.isArray(result?.patch_envelopes) && result.patch_envelopes.length ? 'candidate' : 'queued',
    verifyStatus: result?.verification?.status || 'queued',
    heartbeatAgeMs: heartbeatMtime ? now - heartbeatMtime : null,
    worktreeId: result?.worktree?.id || null,
    mode: input.mode || 'compact-slots'
  })
}

export function buildZellijSlotPaneCommand(input: {
  nodePath?: string
  cliPath: string
  missionId: string
  slotId: string
  generationIndex: number
  artifactDir: string
  backend?: string | null
  role?: string | null
  mode?: ZellijSlotPaneRenderInput['mode']
  watch?: boolean
}) {
  const args = [
    input.cliPath,
    'zellij-slot-pane',
    '--mission', input.missionId,
    '--slot', input.slotId,
    '--generation', String(Math.max(1, Math.floor(Number(input.generationIndex) || 1))),
    '--artifact-dir', input.artifactDir,
    '--mode', input.mode || 'compact-slots',
    ...(input.backend ? ['--backend', input.backend] : []),
    ...(input.role ? ['--role', input.role] : []),
    ...(input.watch ? ['--watch'] : [])
  ]
  return [input.nodePath || process.execPath, ...args].map(shellQuote).join(' ')
}

async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function statMtimeMs(file: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(file)).mtimeMs
  } catch {
    return null
  }
}

function trimInline(value: string, max: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, Math.max(1, max - 3)) + '...'
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
