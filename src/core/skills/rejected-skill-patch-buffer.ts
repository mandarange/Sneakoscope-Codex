import path from 'node:path'
import { appendJsonl, ensureDir, nowIso, readText } from '../fsx.js'
import type { RejectedSkillPatchEntry } from './core-skill-types.js'

export function rejectedBufferPath(root: string): string {
  return path.join(path.resolve(root), '.sneakoscope', 'skills', 'rejected-skill-patches.jsonl')
}

export async function recordRejectedPatch(
  root: string,
  entry: Omit<RejectedSkillPatchEntry, 'created_at'> & { created_at?: string }
): Promise<RejectedSkillPatchEntry> {
  const full: RejectedSkillPatchEntry = { ...entry, created_at: entry.created_at ?? nowIso() }
  const file = rejectedBufferPath(root)
  await ensureDir(path.dirname(file))
  await appendJsonl(file, full)
  return full
}

/** Has this exact patch (by hash) already been rejected? Used to skip repeated failed edits. */
export async function isPatchRejected(root: string, patchHash: string): Promise<boolean> {
  const text = await readText(rejectedBufferPath(root), '')
  if (!text.trim()) return false
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry?.patch_hash === patchHash) return true
    } catch {
      // tolerate malformed lines
    }
  }
  return false
}
