import fsp from 'node:fs/promises'
import path from 'node:path'
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { normalizeAgentSessionRows } from './agent-session-rows.js'

export interface AgentJanitorReport {
  schema: 'sks.agent-janitor-report.v1'
  generated_at: string
  ok: boolean
  mission_id: string | null
  project_hash: string | null
  stale_heartbeat_sessions: string[]
  zombie_process_sessions: string[]
  stale_tmux_sessions: string[]
  active_generation_sessions: string[]
  orphan_generation_dirs: string[]
  slot_generation_cleanup: string[]
  orphan_temp_dirs: string[]
  stale_locks: string[]
  cleaned: string[]
  blockers: string[]
}

export async function runAgentJanitor(input: {
  missionDir: string
  missionId?: string | null
  projectHash?: string | null
  staleMs?: number
  cleanup?: boolean
}): Promise<AgentJanitorReport> {
  const staleMs = input.staleMs ?? 30 * 60 * 1000
  const agentRoot = path.join(input.missionDir, 'agents')
  const sessions = await readJson<any>(path.join(agentRoot, 'agent-sessions.json'), null)
  const namespace = await readJson<any>(path.join(input.missionDir, 'project-session-namespace.json'), null)
  const projectHash = input.projectHash || namespace?.root_hash || null
  const rows = normalizeAgentSessionRows(sessions)
  const generations = await readJson<any>(path.join(agentRoot, 'agent-session-generations.json'), null)
  const generationRows = generations?.generations ? Object.values<any>(generations.generations) : []
  const activeGenerationSessions = generationRows
    .filter((row) => !row.closed_at && ['running', 'launching', 'collecting'].includes(String(row.status || 'running')))
    .map((row) => String(row.session_id))
  const now = Date.now()
  const staleHeartbeat: string[] = rows
    .filter((row: any) => {
      const status = String(row.status || row.lifecycle_state || '')
      if (['closed', 'completed', 'done'].includes(status)) return false
      const heartbeat = Date.parse(String(row.heartbeat_at || row.last_heartbeat_at || row.updated_at || ''))
      return !Number.isFinite(heartbeat) || now - heartbeat > staleMs
    })
    .map((row: any) => String(row.session_id || row.id || row.agent_id))
  const statusByAgent = new Map<string, string>()
  const statusBySession = new Map<string, string>()
  for (const row of rows) {
    const status = String(row.status || row.lifecycle_state || '')
    if (row.agent_id || row.id) statusByAgent.set(String(row.agent_id || row.id), status)
    if (row.session_id) statusBySession.set(String(row.session_id), status)
  }
  const zombieProcesses = await detectZombieProcessSessions(agentRoot, statusByAgent, statusBySession)
  const staleTmuxSessions = await detectStaleTmuxSessions(agentRoot, staleMs)
  const orphanGenerationDirs = await detectOrphanGenerationDirs(agentRoot, new Set(generationRows.map((row) => String(row.artifact_dir || ''))))
  const orphanTempDirs = await scopedExistingPaths(Array.isArray(namespace?.orphan_temp_dirs) ? namespace.orphan_temp_dirs : [], projectHash)
  const staleLocks = await scopedStaleLockPaths(namespace?.lock_dir ? [namespace.lock_dir] : [], projectHash, staleMs)
  const cleaned: string[] = []
  if (input.cleanup) {
    for (const dir of orphanGenerationDirs) {
      await fsp.rm(path.join(agentRoot, dir), { recursive: true, force: true }).catch(() => {})
      cleaned.push(path.join(agentRoot, dir))
    }
    for (const dir of orphanTempDirs) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
      cleaned.push(dir)
    }
  }
  const blockers = [
    ...staleHeartbeat.map((id) => `stale_heartbeat:${id}`),
    ...zombieProcesses.map((id) => `zombie_process:${id}`),
    ...staleTmuxSessions.map((id) => `stale_tmux:${id}`),
    ...staleLocks.map((id) => `stale_lock:${id}`),
  ]
  const report: AgentJanitorReport = {
    schema: 'sks.agent-janitor-report.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: input.missionId || namespace?.mission_id || null,
    project_hash: projectHash,
    stale_heartbeat_sessions: staleHeartbeat,
    zombie_process_sessions: zombieProcesses,
    stale_tmux_sessions: staleTmuxSessions,
    active_generation_sessions: activeGenerationSessions,
    orphan_generation_dirs: orphanGenerationDirs,
    slot_generation_cleanup: cleaned.filter((entry) => entry.includes(`${path.sep}sessions${path.sep}`)),
    orphan_temp_dirs: orphanTempDirs,
    stale_locks: staleLocks,
    cleaned,
    blockers,
  }
  await writeAgentJanitorReport(input.missionDir, report)
  return report
}

async function detectOrphanGenerationDirs(agentRoot: string, knownGenerationDirs: Set<string>): Promise<string[]> {
  const sessionsDir = path.join(agentRoot, 'sessions')
  const out: string[] = []
  if (!(await exists(sessionsDir))) return out
  for (const slot of await fsp.readdir(sessionsDir, { withFileTypes: true }).catch(() => [])) {
    if (!slot.isDirectory()) continue
    const slotDir = path.join(sessionsDir, slot.name)
    for (const gen of await fsp.readdir(slotDir, { withFileTypes: true }).catch(() => [])) {
      if (!gen.isDirectory() || !/^gen-\d+$/.test(gen.name)) continue
      const rel = path.join('sessions', slot.name, gen.name)
      if (!knownGenerationDirs.has(rel)) out.push(rel)
    }
  }
  return out
}

export async function writeAgentJanitorReport(missionDir: string, report: AgentJanitorReport): Promise<void> {
  await writeJsonAtomic(path.join(missionDir, 'agents', 'agent-janitor-report.json'), report)
}

async function scopedExistingPaths(paths: string[], projectHash: string | null): Promise<string[]> {
  const out: string[] = []
  for (const candidate of paths) {
    if (!candidate) continue
    if (projectHash && !candidate.includes(projectHash)) continue
    if (await exists(candidate)) out.push(candidate)
  }
  return out
}

async function scopedStaleLockPaths(paths: string[], projectHash: string | null, staleMs: number): Promise<string[]> {
  const out: string[] = []
  const now = Date.now()
  for (const dir of paths) {
    if (!dir || (projectHash && !dir.includes(projectHash)) || !(await exists(dir))) continue
    for (const file of await listFiles(dir)) {
      const stat = await fsp.stat(file).catch(() => null)
      if (stat && now - stat.mtimeMs > staleMs) out.push(file)
    }
  }
  return out
}

async function detectZombieProcessSessions(agentRoot: string, statusByAgent: Map<string, string>, statusBySession: Map<string, string>): Promise<string[]> {
  const out: string[] = []
  for (const file of await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-process-report.json')) {
    const report = await readJson<any>(file, null)
    const pid = Number(report?.pid || 0)
    if (!pid || report?.exit_code !== null) continue
    const id = String(report?.session_id || report?.agent_id || path.basename(path.dirname(file)))
    const status = statusBySession.get(String(report?.session_id || '')) || statusByAgent.get(String(report?.agent_id || '')) || ''
    const alive = processIsAlive(pid)
    if ((!alive && !['closed', 'completed', 'done'].includes(status)) || (alive && ['closed', 'completed', 'done'].includes(status))) out.push(id)
  }
  return out
}

async function detectStaleTmuxSessions(agentRoot: string, staleMs: number): Promise<string[]> {
  const out: string[] = []
  const now = Date.now()
  for (const file of await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-tmux-report.json')) {
    const report = await readJson<any>(file, null)
    if (!report || report.launch_mode === 'optional_not_launched') continue
    const stat = await fsp.stat(file).catch(() => null)
    if (stat && now - stat.mtimeMs > staleMs) out.push(String(report.session_id || report.agent_id || path.basename(path.dirname(file))))
  }
  return out
}

async function listNamedFiles(dir: string, name: string): Promise<string[]> {
  return (await listFiles(dir)).filter((file) => path.basename(file) === name)
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  if (!(await exists(dir))) return out
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await listFiles(file))
    else if (entry.isFile()) out.push(file)
  }
  return out
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
