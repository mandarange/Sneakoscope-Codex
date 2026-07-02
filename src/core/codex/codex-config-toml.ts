import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'

export interface CodexConfigRoundTripValidation {
  ok: boolean
  parsed?: Record<string, any> | null
  blockers: string[]
  parse_error?: string
  default_profile?: string | null
  top_level_default_profile?: boolean
  user_fast_mode_default_profile?: unknown
  profile_exists?: boolean | null
  sks_fast_high_profile?: {
    exists: boolean
    model?: unknown
    service_tier?: unknown
  }
}

export function parseCodexConfigToml(text: string = ''): Record<string, any> {
  return parse(String(text || '')) as Record<string, any>
}

export function validateCodexConfigRoundTrip(text: string = ''): CodexConfigRoundTripValidation {
  let parsed: Record<string, any>
  try {
    parsed = parseCodexConfigToml(text)
  } catch (err) {
    return {
      ok: false,
      parsed: null,
      blockers: ['toml_parse_failed'],
      parse_error: messageOf(err)
    }
  }

  const blockers: string[] = []
  const defaultProfile = parsed.default_profile
  const userFastModeDefault = parsed.user?.fast_mode?.default_profile
  if (defaultProfile !== undefined && typeof defaultProfile !== 'string') blockers.push('default_profile_not_top_level_string')
  if (userFastModeDefault !== undefined) blockers.push('user_fast_mode_default_profile_misplaced')
  const defaultProfileName = typeof defaultProfile === 'string' ? defaultProfile : null
  const profile = defaultProfileName ? parsed.profiles?.[defaultProfileName] : null
  if (defaultProfileName && (!profile || typeof profile !== 'object' || Array.isArray(profile))) blockers.push('default_profile_target_missing')

  const sksFastHigh = parsed.profiles?.['sks-fast-high']
  if (sksFastHigh !== undefined) {
    if (!sksFastHigh || typeof sksFastHigh !== 'object' || Array.isArray(sksFastHigh)) {
      blockers.push('profiles_sks_fast_high_not_table')
    } else {
      if (!('model' in sksFastHigh)) blockers.push('profiles_sks_fast_high_model_missing')
      if (!('service_tier' in sksFastHigh)) blockers.push('profiles_sks_fast_high_service_tier_missing')
    }
  }

  return {
    ok: blockers.length === 0,
    parsed,
    blockers,
    default_profile: defaultProfileName,
    top_level_default_profile: defaultProfileName !== null,
    user_fast_mode_default_profile: userFastModeDefault,
    profile_exists: defaultProfileName ? !blockers.includes('default_profile_target_missing') : null,
    sks_fast_high_profile: {
      exists: sksFastHigh !== undefined,
      model: sksFastHigh && typeof sksFastHigh === 'object' ? sksFastHigh.model : undefined,
      service_tier: sksFastHigh && typeof sksFastHigh === 'object' ? sksFastHigh.service_tier : undefined
    }
  }
}

export async function cleanupCodexConfigBackups(configPath: string, opts: { keepPerTag?: number; maxAgeMs?: number } = {}) {
  const keepPerTag = Math.max(0, opts.keepPerTag ?? 3)
  const maxAgeMs = opts.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000
  const dir = path.dirname(configPath)
  const base = path.basename(configPath)
  let entries: string[] = []
  try {
    entries = await fs.readdir(dir)
  } catch {
    return { cleaned: 0, files: [] as string[] }
  }
  const now = Date.now()
  const groups = new Map<string, Array<{ file: string; abs: string; mtimeMs: number }>>()
  for (const file of entries) {
    if (!file.startsWith(`${base}.`)) continue
    if (!/(?:^|[.-])(?:sks-|bak-|struct-bak-)|\.bak$/.test(file)) continue
    const abs = path.join(dir, file)
    let stat
    try {
      stat = await fs.stat(abs)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const tag = backupTag(base, file)
    const group = groups.get(tag) || []
    group.push({ file, abs, mtimeMs: stat.mtimeMs })
    groups.set(tag, group)
  }
  const removed: string[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (let index = 0; index < group.length; index += 1) {
      const entry = group[index]
      if (!entry) continue
      const tooMany = keepPerTag >= 0 && index >= keepPerTag
      const tooOld = maxAgeMs >= 0 && now - entry.mtimeMs > maxAgeMs
      if (!tooMany && !tooOld) continue
      await fs.rm(entry.abs, { force: true }).then(() => removed.push(entry.abs)).catch(() => undefined)
    }
  }
  return { cleaned: removed.length, files: removed }
}

function backupTag(base: string, file: string) {
  const suffix = file.slice(`${base}.`.length)
  const sks = suffix.match(/^sks-([^-]+)-/)
  if (sks?.[1]) return `sks-${sks[1]}`
  if (suffix.startsWith('struct-bak-')) return 'struct-bak'
  if (suffix.startsWith('bak-')) return 'bak'
  return 'misc'
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}
