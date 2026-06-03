import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const CODEX_THREAD_REGISTRY_SCHEMA = 'sks.codex-thread-registry.v1'

export async function recordCodexThread(root: string, entry: Record<string, unknown>) {
  const registryPath = path.join(root, 'codex-thread-registry.json')
  await ensureDir(path.dirname(registryPath))
  const current = await readJson<any>(registryPath, null)
  const threads = Array.isArray(current?.threads) ? current.threads : []
  const key = `${entry.sdk_thread_id || ''}:${entry.session_id || ''}:${entry.work_item_id || ''}`
  const nextThreads = threads.filter((row: any) => `${row.sdk_thread_id || ''}:${row.session_id || ''}:${row.work_item_id || ''}` !== key)
  nextThreads.push({
    recorded_at: nowIso(),
    ...entry
  })
  const registry = {
    schema: CODEX_THREAD_REGISTRY_SCHEMA,
    generated_at: nowIso(),
    thread_count: nextThreads.length,
    threads: nextThreads
  }
  await writeJsonAtomic(registryPath, registry)
  return { registry, registryPath }
}

export async function readCodexThreadRegistry(root: string) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, 'codex-thread-registry.json'), 'utf8'))
  } catch {
    return null
  }
}
