import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { SKS_PROJECT_FANOUT_SCHEMA, sksProjectFanoutReportPath } from './sks-project-registry.js'
import { ensureCurrentMigrationBeforeCommand } from './update-migration-state.js'
import { updateOperationLockPath } from './update-operation.js'

/**
 * Detached runner started by `spawnProjectMigrationFanout`. It waits for a
 * running `sks update` to release its lock, then migrates each project through
 * the same first-command gate an `sks` command uses: per-project lock, receipt
 * check, and the migration doctor. A project already current returns at once.
 */

const LOCK_WAIT_MS = 15 * 60_000
const LOCK_POLL_MS = 2_000

async function waitForUpdateLock(env: NodeJS.ProcessEnv): Promise<boolean> {
  const lock = updateOperationLockPath(env)
  const deadline = Date.now() + LOCK_WAIT_MS
  while (fs.existsSync(lock)) {
    if (Date.now() > deadline) return false
    await delay(LOCK_POLL_MS)
  }
  return true
}

export interface ProjectFanoutResult {
  root: string
  ok: boolean
  status: string
  blockers: string[]
}

export async function runProjectMigrationFanout(roots: string[], env: NodeJS.ProcessEnv = process.env) {
  const startedAt = nowIso()
  const lockReleased = await waitForUpdateLock(env)
  const results: ProjectFanoutResult[] = []
  for (const root of roots) {
    try {
      const gate = await ensureCurrentMigrationBeforeCommand({ command: 'project-migration-fanout', cwd: root, env })
      results.push({ root, ok: gate.ok, status: gate.status, blockers: gate.blockers.slice(0, 5) })
    } catch (error: unknown) {
      results.push({ root, ok: false, status: 'error', blockers: [error instanceof Error ? error.message : String(error)] })
    }
  }
  const report = {
    schema: SKS_PROJECT_FANOUT_SCHEMA,
    started_at: startedAt,
    finished_at: nowIso(),
    update_lock_released: lockReleased,
    ok: results.every((row) => row.ok),
    results
  }
  await writeJsonAtomic(sksProjectFanoutReportPath(env), report).catch(() => undefined)
  return report
}

function canonical(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entry === import.meta.url) {
  await runProjectMigrationFanout(process.argv.slice(2).filter((arg) => path.isAbsolute(arg)).map(canonical))
}
