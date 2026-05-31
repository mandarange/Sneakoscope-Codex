import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Codex App (GUI) $imagegen writes generated images to
// `$CODEX_HOME/generated_images/<session-uuid>/ig_<hash>.png`. There is no
// sidecar metadata; freshness is mtime-based and the `ig_` prefix marks an
// image-generation output. This module lets a headless SKS route auto-discover
// the most recent GUI-generated image instead of requiring the user to attach
// it manually via SKS_CODEX_APP_IMAGEGEN_OUTPUT.

export const CODEX_APP_GENERATED_IMAGE_DISCOVERY_SCHEMA = 'sks.codex-app-generated-image-discovery.v1'

export interface CodexAppGeneratedImageCandidate {
  path: string
  bytes: number
  mtime_ms: number
  session_dir: string
}

export interface CodexAppGeneratedImageDiscovery {
  schema: typeof CODEX_APP_GENERATED_IMAGE_DISCOVERY_SCHEMA
  ok: boolean
  generated_images_dir: string
  dir_exists: boolean
  selected: CodexAppGeneratedImageCandidate | null
  candidates_considered: number
  rejected_reason: string | null
  since_ms: number | null
  max_age_ms: number
}

export function codexHomeDir(opts: { codexHome?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const env = opts.env || process.env
  return path.resolve(opts.codexHome || env.CODEX_HOME || path.join(env.HOME || os.homedir(), '.codex'))
}

export function codexAppGeneratedImagesDir(opts: { codexHome?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return path.join(codexHomeDir(opts), 'generated_images')
}

/**
 * Find the most recent Codex App GUI-generated image (`ig_*.png`).
 *
 * Safety guards so an old, unrelated generation is never mistaken for the
 * current request's output:
 * - `since_ms`: only accept images modified at/after the run's start time
 *   (pass the mission creation time). When omitted, only the max-age guard applies.
 * - `max_age_ms`: reject anything older than this (default 10 min) so a stale
 *   image left in the directory is not silently reused.
 */
export async function discoverCodexAppGeneratedImage(opts: {
  codexHome?: string
  env?: NodeJS.ProcessEnv
  sinceMs?: number | null
  maxAgeMs?: number
  nowMs: number
} = { nowMs: 0 }): Promise<CodexAppGeneratedImageDiscovery> {
  const dir = codexAppGeneratedImagesDir(opts)
  const maxAgeMs = Number.isFinite(opts.maxAgeMs) ? Number(opts.maxAgeMs) : 10 * 60 * 1000
  const sinceMs = typeof opts.sinceMs === 'number' ? opts.sinceMs : null
  const nowMs = opts.nowMs
  const base: CodexAppGeneratedImageDiscovery = {
    schema: CODEX_APP_GENERATED_IMAGE_DISCOVERY_SCHEMA,
    ok: false,
    generated_images_dir: dir,
    dir_exists: false,
    selected: null,
    candidates_considered: 0,
    rejected_reason: null,
    since_ms: sinceMs,
    max_age_ms: maxAgeMs
  }
  let sessionDirs: string[]
  try {
    sessionDirs = (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name))
  } catch {
    return { ...base, dir_exists: false, rejected_reason: 'generated_images_dir_missing' }
  }
  base.dir_exists = true

  const candidates: CodexAppGeneratedImageCandidate[] = []
  for (const sessionDir of sessionDirs) {
    let files: string[]
    try {
      files = await fsp.readdir(sessionDir)
    } catch {
      continue
    }
    for (const name of files) {
      if (!/^ig_.*\.(png|webp|jpe?g)$/i.test(name)) continue
      const full = path.join(sessionDir, name)
      let stat: fs.Stats
      try {
        stat = await fsp.stat(full)
      } catch {
        continue
      }
      if (!stat.isFile() || stat.size === 0) continue
      candidates.push({ path: full, bytes: stat.size, mtime_ms: stat.mtimeMs, session_dir: sessionDir })
    }
  }
  base.candidates_considered = candidates.length
  if (!candidates.length) return { ...base, rejected_reason: 'no_generated_images_found' }

  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms)
  const newest = candidates[0]
  if (!newest) return { ...base, rejected_reason: 'no_generated_images_found' }
  if (sinceMs !== null && newest.mtime_ms < sinceMs) {
    return { ...base, rejected_reason: 'newest_image_predates_run_start' }
  }
  if (nowMs && newest.mtime_ms < nowMs - maxAgeMs) {
    return { ...base, rejected_reason: 'newest_image_older_than_max_age' }
  }
  if (!(await hasImageSignature(newest.path))) {
    return { ...base, rejected_reason: 'newest_image_not_a_valid_image' }
  }
  return { ...base, ok: true, selected: newest }
}

async function hasImageSignature(file: string): Promise<boolean> {
  let handle: fsp.FileHandle | null = null
  try {
    handle = await fsp.open(file, 'r')
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0)
    if (bytesRead < 4) return false
    // PNG \x89PNG, JPEG \xFF\xD8\xFF, WEBP RIFF....WEBP
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    const isWebp = buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP'
    return isPng || isJpeg || isWebp
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => {})
  }
}
