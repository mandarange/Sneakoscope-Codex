import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const ZELLIJ_LANE_RUNTIME_SCHEMA = 'sks.zellij-lane-runtime.v1'
export const ZELLIJ_LANE_RUNTIME_MANIFEST_SCHEMA = 'sks.zellij-lane-runtime-manifest.v1'

export interface ZellijLaneRuntimePolicy {
  schema: typeof ZELLIJ_LANE_RUNTIME_SCHEMA
  mission_id: string
  session_name: string
  slot_id: string
  ledger_root: string
  lane_dir: string
  state_dir: string
  command_inbox: string
  command_ack: string
  command_outbox: string
  command_cursor: string
  heartbeat: string
  pane_id_record: string
  drain_signal_path: string
  env: Record<string, string>
  dispatch: {
    mode: 'jsonl_nonblocking'
    command_transport: 'file_jsonl'
    pane_transport: 'zellij_action_optional'
    zellij_actions: string[]
    fifo_policy: 'disabled_to_avoid_writer_blocking'
    throttle_ms: number
  }
  resource: {
    nice_level: number
    throttle_ms: number
    start_jitter_ms: number
    launch_prefix: string[]
  }
  isolation: {
    per_lane_state_dir: boolean
    codex_home_isolated: boolean
    xdg_cache_home_isolated: boolean
    notes: string[]
  }
  cleanup: {
    drain_signal_path: string
    pane_id_record: string
    stale_pane_close: 'drain_then_cleanup_executor'
    zombie_policy: 'drain_signal_plus_optional_zellij_close-pane'
  }
}

export interface ZellijLaneRuntimeManifest {
  schema: typeof ZELLIJ_LANE_RUNTIME_MANIFEST_SCHEMA
  generated_at: string
  mission_id: string
  session_name: string
  lane_count: number
  dispatch_mode: 'jsonl_nonblocking'
  fifo_policy: 'disabled_to_avoid_writer_blocking'
  resource_throttle_ms: number
  nice_level: number
  lanes: ZellijLaneRuntimePolicy[]
}

export function normalizeZellijSlot(value: unknown): string {
  const raw = String(value || 'slot-001')
  if (/^slot-\d{3,}$/.test(raw)) return raw
  const n = Number.parseInt(raw.replace(/\D+/g, ''), 10)
  return `slot-${String(Number.isFinite(n) && n > 0 ? n : 1).padStart(3, '0')}`
}

export function buildZellijLaneRuntimePolicy(root: string, input: {
  missionId: string
  sessionName: string
  slotId: string
  throttleMs?: number
  niceLevel?: number
}): ZellijLaneRuntimePolicy {
  const slotId = normalizeZellijSlot(input.slotId)
  const ledgerRoot = path.resolve(root)
  const laneDir = path.join('lanes', slotId)
  const stateDir = path.join(laneDir, 'state')
  const commandInbox = path.join(laneDir, 'command-inbox.jsonl')
  const commandAck = path.join(laneDir, 'command-ack.jsonl')
  const commandOutbox = path.join(laneDir, 'command-outbox.jsonl')
  const commandCursor = path.join(laneDir, 'command-cursor.json')
  const heartbeat = path.join(laneDir, 'lane-heartbeat.jsonl')
  const paneIdRecord = path.join(laneDir, 'pane-id.json')
  const drainSignalPath = path.join('lanes', '.drain')
  const throttleMs = Math.max(25, Number(input.throttleMs || process.env.SKS_ZELLIJ_DISPATCH_THROTTLE_MS || 100))
  const niceLevel = Math.max(0, Number(input.niceLevel ?? process.env.SKS_ZELLIJ_NICE_LEVEL ?? 10))
  const env = {
    SKS_ZELLIJ_MISSION_ID: input.missionId,
    SKS_ZELLIJ_SESSION_NAME: input.sessionName,
    SKS_ZELLIJ_SLOT_ID: slotId,
    SKS_ZELLIJ_LEDGER_ROOT: ledgerRoot,
    SKS_ZELLIJ_LANE_DIR: path.join(ledgerRoot, laneDir),
    SKS_ZELLIJ_STATE_DIR: path.join(ledgerRoot, stateDir),
    SKS_ZELLIJ_COMMAND_INBOX: path.join(ledgerRoot, commandInbox),
    SKS_ZELLIJ_COMMAND_ACK: path.join(ledgerRoot, commandAck),
    SKS_ZELLIJ_COMMAND_OUTBOX: path.join(ledgerRoot, commandOutbox),
    SKS_ZELLIJ_COMMAND_CURSOR: path.join(ledgerRoot, commandCursor),
    SKS_ZELLIJ_HEARTBEAT: path.join(ledgerRoot, heartbeat),
    SKS_ZELLIJ_PANE_ID_RECORD: path.join(ledgerRoot, paneIdRecord),
    SKS_ZELLIJ_DRAIN_SIGNAL: path.join(ledgerRoot, drainSignalPath),
    SKS_ZELLIJ_DISPATCH_THROTTLE_MS: String(throttleMs),
    SKS_ZELLIJ_NICE_LEVEL: String(niceLevel)
  }
  return {
    schema: ZELLIJ_LANE_RUNTIME_SCHEMA,
    mission_id: input.missionId,
    session_name: input.sessionName,
    slot_id: slotId,
    ledger_root: ledgerRoot,
    lane_dir: laneDir,
    state_dir: stateDir,
    command_inbox: commandInbox,
    command_ack: commandAck,
    command_outbox: commandOutbox,
    command_cursor: commandCursor,
    heartbeat,
    pane_id_record: paneIdRecord,
    drain_signal_path: drainSignalPath,
    env,
    dispatch: {
      mode: 'jsonl_nonblocking',
      command_transport: 'file_jsonl',
      pane_transport: 'zellij_action_optional',
      zellij_actions: ['write-chars', 'paste', 'send-keys'],
      fifo_policy: 'disabled_to_avoid_writer_blocking',
      throttle_ms: throttleMs
    },
    resource: {
      nice_level: niceLevel,
      throttle_ms: throttleMs,
      start_jitter_ms: 50,
      launch_prefix: process.platform === 'win32' || niceLevel <= 0 ? [] : ['nice', '-n', String(niceLevel)]
    },
    isolation: {
      per_lane_state_dir: true,
      codex_home_isolated: false,
      xdg_cache_home_isolated: false,
      notes: [
        'Each Zellij lane uses its own SKS state directory and command bus.',
        'Codex auth/config homes are not rewritten here; worker isolation remains owned by the native agent runtime profiles.'
      ]
    },
    cleanup: {
      drain_signal_path: drainSignalPath,
      pane_id_record: paneIdRecord,
      stale_pane_close: 'drain_then_cleanup_executor',
      zombie_policy: 'drain_signal_plus_optional_zellij_close-pane'
    }
  }
}

export function buildZellijLaneShellCommand(command: string, runtime: ZellijLaneRuntimePolicy): string {
  const envPrefix = Object.entries(runtime.env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
  const prefix = [...envPrefix, ...runtime.resource.launch_prefix]
  return [...prefix, command].filter(Boolean).join(' ')
}

export async function writeZellijLaneRuntimeFiles(root: string, runtime: ZellijLaneRuntimePolicy) {
  await ensureDir(path.join(root, runtime.lane_dir))
  await ensureDir(path.join(root, runtime.state_dir))
  await writeJsonAtomic(path.join(root, runtime.lane_dir, 'runtime.json'), runtime)
  return runtime
}

export async function writeZellijLaneRuntimeManifest(root: string, input: {
  missionId: string
  sessionName: string
  lanes: ZellijLaneRuntimePolicy[]
}) {
  const first = input.lanes[0] || buildZellijLaneRuntimePolicy(root, {
    missionId: input.missionId,
    sessionName: input.sessionName,
    slotId: 'slot-001'
  })
  const manifest: ZellijLaneRuntimeManifest = {
    schema: ZELLIJ_LANE_RUNTIME_MANIFEST_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId,
    session_name: input.sessionName,
    lane_count: input.lanes.length,
    dispatch_mode: 'jsonl_nonblocking',
    fifo_policy: 'disabled_to_avoid_writer_blocking',
    resource_throttle_ms: first.resource.throttle_ms,
    nice_level: first.resource.nice_level,
    lanes: input.lanes
  }
  await ensureDir(root)
  await writeJsonAtomic(path.join(root, 'zellij-lane-runtime.json'), manifest)
  for (const runtime of input.lanes) await writeZellijLaneRuntimeFiles(root, runtime)
  return manifest
}

export async function recordZellijLanePaneId(root: string, input: {
  slotId: string
  paneId: string
  source: string
  sessionName?: string | null
  command?: string | null
}) {
  const slotId = normalizeZellijSlot(input.slotId)
  const laneDir = path.join(root, 'lanes', slotId)
  await ensureDir(laneDir)
  const record = {
    schema: 'sks.zellij-lane-pane-id.v1',
    generated_at: nowIso(),
    slot_id: slotId,
    pane_id: input.paneId,
    source: input.source,
    session_name: input.sessionName || null,
    command: input.command || null
  }
  await writeJsonAtomic(path.join(laneDir, 'pane-id.json'), record)
  return record
}

export async function appendZellijLaneCommand(root: string, input: {
  missionId: string
  slotId: string
  kind: string
  payload: Record<string, unknown>
  source: string
}) {
  const slotId = normalizeZellijSlot(input.slotId)
  const laneDir = path.join(root, 'lanes', slotId)
  await ensureDir(laneDir)
  const command = {
    schema: 'sks.zellij-lane-command.v1',
    id: `cmd-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    ts: nowIso(),
    mission_id: input.missionId,
    slot_id: slotId,
    kind: input.kind,
    payload: input.payload,
    source: input.source,
    transport: 'jsonl_nonblocking'
  }
  await appendJsonl(path.join(laneDir, 'command-inbox.jsonl'), command)
  return command
}

export async function readZellijLaneRuntimeManifest(root: string) {
  return readJson<ZellijLaneRuntimeManifest>(path.join(root, 'zellij-lane-runtime.json'), null as any)
}

export function extractZellijPaneIdFromOutput(text: unknown): string | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const paneId = parsed?.pane_id ?? parsed?.paneId ?? parsed?.id
    if (paneId != null && String(paneId).trim()) return String(paneId).trim()
  } catch {
    // Fall through to line-based parsing.
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines.slice().reverse()) {
    const direct = line.match(/^(?:pane[_ -]?id[:=]\s*)?([0-9]+)$/i)
    if (direct?.[1]) return direct[1]
    const embedded = line.match(/\bpane[_ -]?id[:=]\s*([0-9]+)\b/i)
    if (embedded?.[1]) return embedded[1]
  }
  return null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
