#!/usr/bin/env node
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { madHighCommand } from '../core/commands/mad-sks-command.js'
import { runProcess, sha256 } from '../core/fsx.js'
import { runZellij } from '../core/zellij/zellij-command.js'

const original = {
  cwd: process.cwd(),
  home: process.env.HOME,
  codexHome: process.env.CODEX_HOME,
  noAttach: process.env.SKS_NO_ZELLIJ_ATTACH,
  requireZellij: process.env.SKS_REQUIRE_ZELLIJ,
  zellijSocketDir: process.env.ZELLIJ_SOCKET_DIR,
  skipNpm: process.env.SKS_SKIP_NPM_FRESHNESS_CHECK
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-ui-no-mutation-'))
const home = path.join(tmp, 'home')
const codexHome = path.join(home, '.codex')
const configPath = path.join(codexHome, 'config.toml')
const runId = `${process.pid}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
const sessionName = `sks-mad-ui-check-${runId}`
const socketDir = path.join('/tmp', `sks-zj-madui-${runId}`)
let report: Record<string, any>
let cleanup: Record<string, any> = { ok: false, blockers: ['cleanup_not_run'] }
let fixtureRemoval: Record<string, any> = { ok: false, blockers: ['fixture_removal_not_run'] }

try {
  await fs.mkdir(codexHome, { recursive: true })
  await fs.mkdir(path.join(tmp, '.sneakoscope'), { recursive: true })
  await fs.writeFile(configPath, [
    'service_tier = "fast"',
    '[features]',
    'fast_mode = true',
    '[plugins."chrome@openai-bundled"]',
    'enabled = false',
    ''
  ].join('\n'))
  const before = await fs.readFile(configPath, 'utf8')

  process.chdir(tmp)
  process.env.HOME = home
  process.env.CODEX_HOME = codexHome
  process.env.SKS_NO_ZELLIJ_ATTACH = '1'
  process.env.SKS_REQUIRE_ZELLIJ = '0'
  process.env.ZELLIJ_SOCKET_DIR = socketDir
  process.env.SKS_SKIP_NPM_FRESHNESS_CHECK = '1'
  process.exitCode = 0

  const launch = await madHighCommand(['--no-attach', '--session', sessionName], {
    maybePromptSksUpdateForLaunch: async () => ({ status: 'skipped' }),
    maybePromptCodexUpdateForLaunch: async () => ({ status: 'skipped' }),
    ensureMadLaunchDependencies: async () => ({ ready: true, actions: [] }),
    maybePromptCodexLbSetupForLaunch: async () => ({ status: 'skipped' })
  })

  const after = await fs.readFile(configPath, 'utf8')
  const entries = await fs.readdir(codexHome)
  assert.equal(after, before)
  assert.equal(entries.some((entry) => entry === 'sks-mad-high.config.toml'), false)
  assert.equal(/\[profiles\.sks-mad-high\]/.test(after), false)
  assert.equal(/enabled\s*=\s*false/.test(after), true)

  process.exitCode = 0
  report = {
    schema: 'sks.mad-sks-app-ui-no-mutation-check.v1',
    ok: true,
    before_hash: sha256(before),
    after_hash: sha256(after),
    profile_files_written: entries.filter((entry) => /sks-mad-high/.test(entry)),
    plugin_disabled_preserved: true,
    session_name: launch?.session_name || null,
    isolated_socket_dir: socketDir,
    blockers: []
  }
} catch (err: any) {
  report = {
    schema: 'sks.mad-sks-app-ui-no-mutation-check.v1',
    ok: false,
    error: err?.message || String(err),
    blockers: ['mad_sks_app_ui_no_mutation_failed']
  }
} finally {
  process.chdir(original.cwd)
  cleanup = await cleanupOwnedSession(sessionName, socketDir, original.cwd)
  if (!cleanup.ok) {
    report!.ok = false
    report!.blockers = [...new Set([...(report!.blockers || []), ...cleanup.blockers])]
  }
  restoreEnv('HOME', original.home)
  restoreEnv('CODEX_HOME', original.codexHome)
  restoreEnv('SKS_NO_ZELLIJ_ATTACH', original.noAttach)
  restoreEnv('SKS_REQUIRE_ZELLIJ', original.requireZellij)
  restoreEnv('ZELLIJ_SOCKET_DIR', original.zellijSocketDir)
  restoreEnv('SKS_SKIP_NPM_FRESHNESS_CHECK', original.skipNpm)
  if (cleanup.ok) {
    fixtureRemoval = await removeFixtureRootAfterQuiescence(tmp)
    if (!fixtureRemoval.ok) {
      cleanup.ok = false
      cleanup.blockers = [...new Set([...(cleanup.blockers || []), ...fixtureRemoval.blockers])]
      report!.ok = false
      report!.blockers = [...new Set([...(report!.blockers || []), ...fixtureRemoval.blockers])]
    }
  }
}
report!.cleanup = cleanup
report!.fixture_removal = fixtureRemoval
report!.temporary_root_removed = fixtureRemoval.ok && !(await exists(tmp))
emit(report!)

function restoreEnv(key: string, value: string | undefined) {
  if (value == null) delete process.env[key]
  else process.env[key] = value
}

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

async function cleanupOwnedSession(sessionName: string, socketDir: string, cwd: string) {
  const ownedProcessTree = await readOwnedZellijProcessTree(sessionName, socketDir, cwd)
  let kill: any = null
  let remaining: string[] = []
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    kill = await runZellij(['kill-session', sessionName], {
      cwd,
      env: { ZELLIJ_SOCKET_DIR: socketDir },
      timeoutMs: 5000,
      optional: true
    })
    remaining = await waitForSocketEntriesToClear(socketDir, 1500)
    if (!remaining.includes(sessionName)) break
  }
  const processExit = await waitForOwnedProcessesToExit(ownedProcessTree.processes, 5000)
  const sessionRemoved = !remaining.includes(sessionName)
  const socketExclusive = remaining.length === 0
  if (sessionRemoved && socketExclusive && processExit.ok) await fs.rm(socketDir, { recursive: true, force: true })
  const socketDirRemoved = !(await exists(socketDir))
  const blockers = [
    ...(!sessionRemoved ? ['mad_ui_check_zellij_session_still_present'] : []),
    ...(!socketExclusive ? ['mad_ui_check_zellij_socket_not_exclusive'] : []),
    ...(!processExit.ok ? ['mad_ui_check_owned_processes_still_alive'] : []),
    ...(!socketDirRemoved ? ['mad_ui_check_zellij_socket_dir_not_removed'] : [])
  ]
  return {
    ok: blockers.length === 0,
    session_removed: sessionRemoved,
    socket_dir_removed: socketDirRemoved,
    remaining_socket_entries: remaining,
    owned_process_tree: ownedProcessTree,
    owned_process_exit: processExit,
    kill,
    blockers
  }
}

type ProcessEntry = { pid: number; ppid: number; command: string }

async function readOwnedZellijProcessTree(sessionName: string, socketDir: string, cwd: string) {
  const serverSocket = path.join(socketDir, 'contract_version_1', sessionName)
  const deadline = Date.now() + 1500
  let rows: ProcessEntry[] = []
  let server: ProcessEntry | null = null
  do {
    const result = await runProcess('ps', ['-axo', 'pid=,ppid=,command='], {
      cwd,
      timeoutMs: 3000,
      maxOutputBytes: 1024 * 1024
    })
    rows = parseProcessRows(result.stdout)
    server = rows.find((row) => {
      const executable = row.command.trim().split(/\s+/, 1)[0] || ''
      return path.basename(executable) === 'zellij' && row.command.includes(` --server ${serverSocket}`)
    }) || null
    if (!server && Date.now() < deadline) await delay(50)
  } while (!server && Date.now() < deadline)
  if (!server) return { server_found: false, server_socket: serverSocket, processes: [] as ProcessEntry[] }
  const byParent = new Map<number, ProcessEntry[]>()
  for (const row of rows) byParent.set(row.ppid, [...(byParent.get(row.ppid) || []), row])
  const processes: ProcessEntry[] = []
  const visit = (pid: number) => {
    const row = rows.find((candidate) => candidate.pid === pid)
    if (row) processes.push(row)
    for (const child of byParent.get(pid) || []) visit(child.pid)
  }
  visit(server.pid)
  return { server_found: true, server_socket: serverSocket, processes }
}

function parseProcessRows(text: string): ProcessEntry[] {
  return text.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] || '' } : null
  }).filter(Boolean) as ProcessEntry[]
}

async function waitForOwnedProcessesToExit(processes: ProcessEntry[], timeoutMs: number) {
  const pids = [...new Set(processes.map((row) => row.pid))]
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && pids.some(processAlive)) await delay(50)
  const alive = pids.filter(processAlive)
  return { ok: alive.length === 0, observed_pids: pids, verified_exited_pids: pids.filter((pid) => !alive.includes(pid)), alive_pids: alive }
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function removeFixtureRootAfterQuiescence(root: string) {
  try {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  } catch (err: any) {
    return { ok: false, removed: false, recreated: false, quiet_period_ms: 300, error: err?.message || String(err), blockers: ['mad_ui_check_fixture_removal_failed'] }
  }
  await delay(300)
  const recreated = await exists(root)
  return {
    ok: !recreated,
    removed: !recreated,
    recreated,
    quiet_period_ms: 300,
    blockers: recreated ? ['mad_ui_check_fixture_recreated_after_return'] : []
  }
}

async function waitForSocketEntriesToClear(socketDir: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const entries = await fs.readdir(path.join(socketDir, 'contract_version_1')).catch(() => [])
    if (entries.length === 0 || Date.now() >= deadline) return entries
    await delay(50)
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function exists(value: string) {
  return fs.access(value).then(() => true).catch(() => false)
}
