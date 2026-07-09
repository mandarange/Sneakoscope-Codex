import fs from 'node:fs/promises'
import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import { withFileLock } from '../locks/file-lock.js'

export const CODEX_THREAD_REGISTRY_SCHEMA = 'sks.codex-thread-registry.v1'

export async function recordCodexThread(root: string, entry: Record<string, unknown>) {
  const registryPath = path.join(root, 'codex-thread-registry.json')
  return await withRegistryLock(root, async () => {
    await ensureDir(path.dirname(registryPath))
    const current = await readRegistryForUpdate(registryPath)
    const threads = Array.isArray(current?.threads) ? current.threads : []
    const key = registryKey(entry)
    const nextThreads = threads.filter((row: any) => registryKey(row) !== key)
    const recorded = {
      recorded_at: nowIso(),
      registry_key: key,
      ...entry
    }
    nextThreads.push(recorded)
    const registry = {
      schema: CODEX_THREAD_REGISTRY_SCHEMA,
      generated_at: nowIso(),
      storage_mode: 'json-with-atomic-lock-and-journal',
      lock_strategy: 'atomic-mkdir',
      thread_count: nextThreads.length,
      corruption: current?.corruption || null,
      threads: nextThreads
    }
    await appendJsonl(path.join(root, 'codex-thread-registry.events.jsonl'), {
      ts: nowIso(),
      type: 'thread.recorded',
      registry_key: key,
      thread_id: entry.thread_id || entry.sdk_thread_id || null,
      session_id: entry.session_id || null,
      work_item_id: entry.work_item_id || null
    })
    await writeJsonAtomic(registryPath, registry)
    return { registry, registryPath }
  })
}

export async function readCodexThreadRegistry(root: string) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, 'codex-thread-registry.json'), 'utf8'))
  } catch (err: unknown) {
    if (errorCode(err) === 'ENOENT') return null
    return {
      schema: CODEX_THREAD_REGISTRY_SCHEMA,
      generated_at: nowIso(),
      ok: false,
      corruption: {
        detected_at: nowIso(),
        error: err instanceof Error ? err.message : String(err)
      },
      thread_count: 0,
      threads: []
    }
  }
}

async function readRegistryForUpdate(registryPath: string) {
  try {
    return JSON.parse(await fs.readFile(registryPath, 'utf8'))
  } catch (err: unknown) {
    if (errorCode(err) === 'ENOENT') return null
    const corruptPath = `${registryPath}.corrupt-${Date.now()}-${process.pid}`
    await fs.copyFile(registryPath, corruptPath).catch(() => {})
    return {
      schema: CODEX_THREAD_REGISTRY_SCHEMA,
      generated_at: nowIso(),
      thread_count: 0,
      threads: [],
      corruption: {
        detected_at: nowIso(),
        source_path: registryPath,
        preserved_path: corruptPath,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}

// Previously a bespoke mkdir-lock with no stale recovery at all — a crash
// mid-update left every future recordCodexThread() call permanently timing
// out after 30s (20차 P1-2). Reuses the owner-token + heartbeat +
// quarantine-reclaim lock from core/locks/file-lock.ts instead.
function withRegistryLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(root, 'codex-thread-registry.lock')
  return withFileLock({ lockPath, timeoutMs: 30_000, staleMs: 60_000 }, fn)
}

function registryKey(entry: Record<string, unknown>) {
  return [
    entry.thread_id || entry.sdk_thread_id || '',
    entry.session_id || '',
    entry.work_item_id || '',
    entry.slot_id || '',
    entry.generation_index ?? ''
  ].map((value) => String(value)).join(':')
}

function errorCode(err: unknown) {
  if (err && typeof err === 'object' && 'code' in err) return String(err.code)
  return null
}
