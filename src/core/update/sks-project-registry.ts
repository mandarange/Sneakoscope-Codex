import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nowIso, PACKAGE_VERSION, readJson, readText, writeJsonAtomic } from '../fsx.js'
import { codexHomePath } from '../codex-app/codex-model-catalog.js'
import type { UpdateMigrationStageRun } from './update-migration-state.js'

/**
 * SKS runs from one global install, but Codex reads hooks, agent roles, and
 * AGENTS.md from each project folder, so every SKS project carries files an
 * update must rewrite. `sks update` used to converge only the folder it ran
 * in. This module knows every SKS project (its own registry plus the projects
 * Codex trusts that carry an SKS marker) and hands them to one background
 * runner that migrates them after the update finishes.
 *
 * Invariants:
 * - Temporary folders, paths inside `.sneakoscope/`, the home folder, and the
 *   filesystem root are never projects.
 * - Only folders with an SKS marker are migrated; the runner goes through the
 *   same first-command migration gate (lock, receipt, doctor) as `sks <cmd>`.
 * - Tests and CI never spawn the runner.
 */

export const SKS_PROJECT_REGISTRY_SCHEMA = 'sks.project-registry.v1'
export const SKS_PROJECT_FANOUT_SCHEMA = 'sks.project-migration-fanout.v1'

/** Same strong markers the first-command migration gate accepts. */
export const SKS_PROJECT_MARKERS = [
  path.join('.sneakoscope', 'manifest.json'),
  path.join('.sneakoscope', 'policy.json'),
  path.join('.codex', 'SNEAKOSCOPE.md')
] as const

const MAX_REGISTRY_ENTRIES = 500
const RECORD_REFRESH_MS = 24 * 60 * 60 * 1000
const FANOUT_REQUEUE_MS = 30 * 60 * 1000

interface RegistryEntry {
  root: string
  last_seen_at: string
}

interface RegistryFile {
  schema: typeof SKS_PROJECT_REGISTRY_SCHEMA
  projects: RegistryEntry[]
}

function globalRoot(env: NodeJS.ProcessEnv): string {
  return env.SKS_GLOBAL_ROOT ? path.resolve(env.SKS_GLOBAL_ROOT) : path.join(env.HOME || os.homedir(), '.sneakoscope-global')
}

export function sksProjectRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(globalRoot(env), 'state', 'sks-projects.json')
}

export function sksProjectFanoutStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(globalRoot(env), 'state', 'project-migration-fanout.json')
}

export function sksProjectFanoutReportPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(globalRoot(env), 'reports', 'project-migration-fanout.json')
}

function realpathOr(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export function defaultEphemeralRoots(): string[] {
  return [...new Set([os.tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].map(realpathOr))]
}

function isInside(p: string, dir: string): boolean {
  return p === dir || p.startsWith(`${dir}${path.sep}`)
}

export function isEphemeralProjectPath(p: string, ephemeralRoots: string[] = defaultEphemeralRoots()): boolean {
  const resolved = realpathOr(p)
  if (resolved.split(path.sep).includes('.sneakoscope')) return true
  return ephemeralRoots.some((root) => isInside(resolved, root))
}

export function hasSksProjectMarker(root: string): boolean {
  return SKS_PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(root, marker)))
}

function eligible(root: string, home: string, ephemeralRoots: string[]): boolean {
  const resolved = realpathOr(root)
  if (resolved === path.parse(resolved).root || resolved === realpathOr(home)) return false
  if (isEphemeralProjectPath(resolved, ephemeralRoots)) return false
  try {
    if (!fs.statSync(resolved).isDirectory()) return false
  } catch {
    return false
  }
  return hasSksProjectMarker(resolved)
}

async function readRegistry(env: NodeJS.ProcessEnv): Promise<RegistryFile> {
  const file = await readJson<RegistryFile | null>(sksProjectRegistryPath(env), null).catch(() => null)
  if (file?.schema !== SKS_PROJECT_REGISTRY_SCHEMA || !Array.isArray(file.projects)) return { schema: SKS_PROJECT_REGISTRY_SCHEMA, projects: [] }
  return { schema: SKS_PROJECT_REGISTRY_SCHEMA, projects: file.projects.filter((row) => typeof row?.root === 'string') }
}

/** Remember an SKS project. Cheap and silent: at most one write per project per day. */
export async function recordSksProject(
  root: string,
  opts: { env?: NodeJS.ProcessEnv; ephemeralRoots?: string[] } = {}
): Promise<boolean> {
  const env = opts.env || process.env
  const home = env.HOME || os.homedir()
  const resolved = realpathOr(root)
  if (!eligible(resolved, home, opts.ephemeralRoots || defaultEphemeralRoots())) return false
  try {
    const registry = await readRegistry(env)
    const existing = registry.projects.find((row) => row.root === resolved)
    if (existing && Date.now() - Date.parse(existing.last_seen_at) < RECORD_REFRESH_MS) return true
    const projects = [
      { root: resolved, last_seen_at: nowIso() },
      ...registry.projects.filter((row) => row.root !== resolved)
    ].slice(0, MAX_REGISTRY_ENTRIES)
    await writeJsonAtomic(sksProjectRegistryPath(env), { schema: SKS_PROJECT_REGISTRY_SCHEMA, projects })
    return true
  } catch {
    return false
  }
}

function unquoteTomlKey(raw: string): string | null {
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string
    } catch {
      return null
    }
  }
  if (raw.startsWith("'")) return raw.slice(1, -1)
  return raw
}

/** Project folders Codex trusts, from `[projects."<path>"]` tables in its config. */
export async function codexTrustedProjectRoots(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const configPath = path.join(codexHomePath({ env }), 'config.toml')
  const text = await readText(configPath, '')
  const roots: string[] = []
  const header = /^\s*\[projects\.("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\]\s*(?:#.*)?$/
  for (const line of String(text).split(/\r?\n/)) {
    const match = header.exec(line)
    const key = match?.[1] ? unquoteTomlKey(match[1]) : null
    if (key && path.isAbsolute(key)) roots.push(key)
  }
  return roots
}

/** Every SKS project on this machine that an update should migrate. */
export async function knownSksProjects(opts: {
  env?: NodeJS.ProcessEnv
  exclude?: string[]
  ephemeralRoots?: string[]
} = {}): Promise<string[]> {
  const env = opts.env || process.env
  const home = env.HOME || os.homedir()
  const ephemeralRoots = opts.ephemeralRoots || defaultEphemeralRoots()
  const excluded = new Set((opts.exclude || []).map(realpathOr))
  const candidates = [
    ...(await readRegistry(env)).projects.map((row) => row.root),
    ...(await codexTrustedProjectRoots(env).catch(() => []))
  ]
  const out = new Set<string>()
  for (const candidate of candidates) {
    const resolved = realpathOr(candidate)
    if (excluded.has(resolved) || out.has(resolved)) continue
    if (eligible(resolved, home, ephemeralRoots)) out.add(resolved)
  }
  return [...out].sort()
}

function testOrCi(env: NodeJS.ProcessEnv): boolean {
  return [env, process.env].some((e) => Boolean(e.NODE_TEST_CONTEXT)
    || e.SKS_TEST_ISOLATION === '1'
    || Boolean(e.SKS_TEST_FORBID_REAL_HOME)
    || e.CI === 'true'
    || e.CI === '1')
}

function pidAlive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || Number(pid) <= 0) return false
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (error: any) {
    return error?.code === 'EPERM'
  }
}

export interface ProjectFanoutSpawn {
  spawned: boolean
  count: number
  reason: string | null
  pid: number | null
}

/**
 * Start one detached runner that migrates `roots` after any running update
 * releases its lock. A runner already queued for this version in the last 30
 * minutes absorbs a second request for the same projects.
 */
export async function spawnProjectMigrationFanout(roots: string[], env: NodeJS.ProcessEnv = process.env): Promise<ProjectFanoutSpawn> {
  const unique = [...new Set(roots.map(realpathOr))]
  if (!unique.length) return { spawned: false, count: 0, reason: 'no_projects', pid: null }
  if (env.SKS_BACKGROUND_PROJECT_MIGRATION === '0' || testOrCi(env)) {
    return { spawned: false, count: unique.length, reason: 'disabled', pid: null }
  }
  const statePath = sksProjectFanoutStatePath(env)
  const state = await readJson<{ version?: string; queued_at?: string; pid?: number; roots?: string[] } | null>(statePath, null).catch(() => null)
  const covered = new Set(state?.roots || [])
  if (state?.version === PACKAGE_VERSION
    && Date.now() - Date.parse(state.queued_at || '') < FANOUT_REQUEUE_MS
    && pidAlive(state.pid)
    && unique.every((root) => covered.has(root))) {
    return { spawned: false, count: unique.length, reason: 'already_queued', pid: state.pid ?? null }
  }
  const runner = fileURLToPath(new URL('./project-migration-fanout-runner.js', import.meta.url))
  if (!fs.existsSync(runner)) return { spawned: false, count: unique.length, reason: 'runner_missing', pid: null }
  const childEnv: NodeJS.ProcessEnv = { ...env, SKS_UPDATE_PROJECT_FANOUT: '1' }
  delete childEnv.SKS_UPDATE_MIGRATION_GATE_DISABLED
  const child = spawn(process.execPath, [runner, ...unique], {
    detached: true,
    stdio: 'ignore',
    cwd: env.HOME || os.homedir(),
    env: childEnv
  })
  child.unref()
  await writeJsonAtomic(statePath, {
    schema: SKS_PROJECT_FANOUT_SCHEMA,
    version: PACKAGE_VERSION,
    queued_at: nowIso(),
    pid: child.pid ?? null,
    roots: unique
  }).catch(() => undefined)
  return { spawned: true, count: unique.length, reason: null, pid: child.pid ?? null }
}

export const OTHER_PROJECTS_MIGRATION_STAGE_ID = 'other-projects-migration'

/**
 * Inside `sks update` (never inside the runner it starts), queue every other
 * SKS project for the same migration once the update releases its lock, so a
 * project that only runs through Codex gets new roles, hooks, and guidance
 * without anyone opening it first.
 */
export async function runOtherProjectsMigrationStage(root: string, fromVersion: string | null): Promise<UpdateMigrationStageRun | null> {
  const env = process.env
  if (env.SKS_UPDATE_DEFER_MENUBAR_RESTART !== '1' || env.SKS_UPDATE_PROJECT_FANOUT === '1') return null
  const base = {
    schema: 'sks.update-migration-stage.v2' as const,
    id: OTHER_PROJECTS_MIGRATION_STAGE_ID,
    min_from_version: '0.0.0',
    from_version: fromVersion
  }
  try {
    const projects = await knownSksProjects({ env, exclude: [root] })
    const queued = await spawnProjectMigrationFanout(projects, env)
    return {
      ...base,
      ok: true,
      status: queued.spawned ? 'ok' : 'skipped',
      actions: [queued.spawned ? `queued_projects:${queued.count}` : `not_queued:${queued.reason}`],
      blockers: [],
      warnings: [],
      detail: { projects, runner_pid: queued.pid }
    }
  } catch (err: any) {
    return { ...base, ok: true, status: 'skipped', actions: [], blockers: [], warnings: [`other_projects_migration_not_queued:${err?.message || String(err)}`] }
  }
}
