import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, type RunProcessResult } from '../fsx.js'

interface FakePane {
  pane_id: string
  title: string
  name: string
  terminal_command: string
  exited: boolean
}

interface FakeSession {
  next_id: number
  focused_pane_id: string | null
  panes: FakePane[]
}

const sessions = new Map<string, FakeSession>()

export async function runFakeZellij(args: readonly string[] = [], opts: {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  maxOutputBytes?: number
} = {}): Promise<RunProcessResult> {
  const env = { ...process.env, ...(opts.env || {}) }
  const root = path.resolve(String(env.SKS_ZELLIJ_FAKE_ROOT || opts.cwd || process.cwd()))
  const version = String(env.SKS_ZELLIJ_FAKE_VERSION || '0.43.1')
  const delayMs = Math.max(0, Number(env.SKS_ZELLIJ_FAKE_DELAY_MS || 0) || 0)
  const sessionName = sessionFromArgs(args)
  const startedAt = Date.now()
  let result: RunProcessResult
  if (args.length === 1 && args[0] === '--version') {
    result = ok(`zellij ${version}\n`)
  } else if (args[0] === 'attach' && args[1] === '--create-background') {
    const name = String(args[2] || 'default')
    if (env.SKS_ZELLIJ_FAKE_CREATE_BACKGROUND_EXISTS === '1' && sessions.has(name)) {
      result = fail(`Session already exists: ${name}`)
    } else {
      getSession(name)
      result = ok('')
    }
  } else if (args.includes('new-pane')) {
    if (args.includes('--stacked') && !supportsStacked(version)) {
      result = fail('unknown option --stacked')
    } else {
      if (delayMs > 0) await sleep(delayMs)
      const session = getSession(sessionName)
      const name = optionValue(args, '--name') || `pane-${session.next_id}`
      const paneId = `terminal_${session.next_id++}`
      const command = commandAfter(args, '--') || ''
      const pane: FakePane = { pane_id: paneId, title: name, name, terminal_command: command, exited: false }
      session.panes.push(pane)
      session.focused_pane_id = paneId
      result = ok(`${JSON.stringify({ pane_id: paneId })}\n`)
    }
  } else if (args.includes('focus-pane-id')) {
    const paneId = String(args[args.indexOf('focus-pane-id') + 1] || '')
    const session = getSession(sessionName)
    const pane = findPane(session, paneId)
    if (!pane) result = fail(`Pane ${paneId} not found`)
    else {
      session.focused_pane_id = pane.pane_id
      result = ok('')
    }
  } else if (args.includes('list-panes')) {
    const session = getSession(sessionName)
    result = ok(`${JSON.stringify(session.panes)}\n`)
  } else if (args.includes('dump-screen')) {
    const session = getSession(sessionName)
    result = ok(session.panes.map((pane) => pane.title).join('\n') + '\n')
  } else if (args.includes('rename-pane')) {
    const session = getSession(sessionName)
    const paneId = optionValue(args, '--pane-id')
    const name = String(args[args.length - 1] || '')
    const pane = paneId ? findPane(session, paneId) : session.panes.find((row) => row.pane_id === session.focused_pane_id)
    if (!pane) result = fail(`Pane ${paneId || 'focused'} not found`)
    else {
      pane.title = name
      pane.name = name
      result = ok('')
    }
  } else if (args.includes('close-pane')) {
    const session = getSession(sessionName)
    const paneId = optionValue(args, '--pane-id')
    const pane = paneId ? findPane(session, paneId) : session.panes.find((row) => row.pane_id === session.focused_pane_id)
    if (!pane) result = fail(`Pane ${paneId || 'focused'} not found`)
    else {
      pane.exited = true
      result = ok('')
    }
  } else if (args[0] === 'kill-session' || args[0] === 'delete-session') {
    const force = args.includes('--force')
    const name = String(args.find((arg, index) => index > 0 && !String(arg).startsWith('-')) || '')
    if (!name) result = fail('missing session name')
    else if (!sessions.has(name) && !force && args[0] === 'kill-session') result = fail(`No session named "${name}" found.`)
    else {
      sessions.delete(name)
      result = ok('')
    }
  } else if (args[0] === 'list-sessions') {
    const lines = [...sessions.keys()].map((name) => `${name} [Created 0s ago]`)
    result = ok(lines.length ? `${lines.join('\n')}\n` : '')
  } else {
    result = ok('')
  }
  await recordFakeZellijCall(root, args, {
    session_name: sessionName,
    version,
    exit_code: result.code,
    duration_ms: Date.now() - startedAt,
    sks_zellij_viewports: env.SKS_ZELLIJ_VIEWPORTS || null,
    sks_zellij_refresh_ms: env.SKS_ZELLIJ_REFRESH_MS || null
  })
  return result
}

async function recordFakeZellijCall(root: string, args: readonly string[], meta: Record<string, unknown>) {
  const file = path.join(root, '.sneakoscope', 'fake-zellij-calls.jsonl')
  await ensureDir(path.dirname(file))
  await appendJsonl(file, {
    schema: 'sks.fake-zellij-call.v1',
    ts: nowIso(),
    args: [...args],
    ...meta
  })
}

function getSession(name: string): FakeSession {
  const key = String(name || 'default')
  const existing = sessions.get(key)
  if (existing) return existing
  const next = { next_id: 1, focused_pane_id: null, panes: [] }
  sessions.set(key, next)
  return next
}

function sessionFromArgs(args: readonly string[]): string {
  const explicit = optionValue(args, '--session')
  if (explicit) return explicit
  if (args[0] === 'attach' && args[1] === '--create-background') return String(args[2] || 'default')
  return 'default'
}

function optionValue(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index < 0) return null
  const value = args[index + 1]
  return value == null ? null : String(value)
}

function commandAfter(args: readonly string[], marker: string): string | null {
  const index = args.indexOf(marker)
  if (index < 0) return null
  return args.slice(index + 1).map(String).join(' ')
}

function findPane(session: FakeSession, id: string): FakePane | null {
  const normalized = String(id || '').replace(/^terminal_/, '')
  return session.panes.find((pane) => pane.pane_id === id || pane.pane_id.replace(/^terminal_/, '') === normalized) || null
}

function supportsStacked(version: string): boolean {
  const parts = String(version || '0.0.0').match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map((part) => Number.parseInt(part, 10) || 0) || [0, 0, 0]
  return parts[0]! > 0 || parts[1]! > 43 || (parts[1] === 43 && parts[2]! >= 0)
}

function ok(stdout: string): RunProcessResult {
  return {
    code: 0,
    stdout,
    stderr: '',
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: 0,
    truncated: false,
    timedOut: false
  }
}

function fail(stderr: string): RunProcessResult {
  return {
    code: 1,
    stdout: '',
    stderr,
    stdoutBytes: 0,
    stderrBytes: Buffer.byteLength(stderr),
    truncated: false,
    timedOut: false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
