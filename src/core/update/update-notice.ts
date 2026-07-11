import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const SKS_UPDATE_NOTICE_SCHEMA = 'sks.update-notice.v1'

export interface SksUpdateNotice {
  schema: typeof SKS_UPDATE_NOTICE_SCHEMA
  checked_at: string
  package_name: string
  current_version: string
  latest_version: string | null
  update_available: boolean
  source: 'npm-registry' | 'cache' | 'disabled' | 'error'
  cache_ttl_ms: number
  message: string
  error?: string
}

export async function persistSksUpdateNoticeFromVersions(input: {
  packageName?: string
  currentVersion: string
  latestVersion?: string | null
  error?: string | null
}): Promise<SksUpdateNotice> {
  const packageName = input.packageName || 'sneakoscope'
  const latestVersion = input.latestVersion || null
  const updateAvailable = Boolean(latestVersion && compareVersions(latestVersion, input.currentVersion) > 0)
  const notice: SksUpdateNotice = {
    schema: SKS_UPDATE_NOTICE_SCHEMA,
    checked_at: nowIso(),
    package_name: packageName,
    current_version: input.currentVersion,
    latest_version: latestVersion,
    update_available: updateAvailable,
    source: input.error ? 'error' : 'cache',
    cache_ttl_ms: 6 * 60 * 60 * 1000,
    message: updateAvailable
      ? `SKS ${latestVersion} is available; current ${input.currentVersion}.`
      : `SKS ${input.currentVersion} is current enough.`,
    ...(input.error ? { error: input.error } : {})
  }
  const cachePath = path.join(os.homedir(), '.sneakoscope', 'cache', 'update-notice.json')
  await ensureDir(path.dirname(cachePath))
  await writeJsonAtomic(cachePath, notice)
  return notice
}

export async function checkSksUpdateNotice(input: {
  packageName?: string
  currentVersion?: string
  missionDir?: string | null
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
} = {}): Promise<SksUpdateNotice> {
  const env = input.env || process.env
  const packageName = input.packageName || env.SKS_UPDATE_NOTICE_PACKAGE || 'sneakoscope'
  const currentVersion = input.currentVersion || env.SKS_PACKAGE_VERSION || '0.0.0'
  const ttlMs = normalizePositiveInt(env.SKS_UPDATE_NOTICE_TTL_MS, 6 * 60 * 60 * 1000)
  const cachePath = path.join(os.homedir(), '.sneakoscope', 'cache', 'update-notice.json')
  if (env.SKS_DISABLE_UPDATE_NOTICE === '1' || env.SKS_UPDATE_NOTICE_DISABLE === '1' || env.SKS_UPDATE_NOTICE === '0') {
    return persistNotice(input.missionDir, {
      schema: SKS_UPDATE_NOTICE_SCHEMA,
      checked_at: nowIso(),
      package_name: packageName,
      current_version: currentVersion,
      latest_version: null,
      update_available: false,
      source: 'disabled',
      cache_ttl_ms: ttlMs,
      message: 'SKS update notice disabled by environment.'
    })
  }

  const cached = await readJson<SksUpdateNotice | null>(cachePath, null)
  if (cached?.schema === SKS_UPDATE_NOTICE_SCHEMA && Date.now() - Date.parse(cached.checked_at || '') < ttlMs) {
    return persistNotice(input.missionDir, { ...cached, source: 'cache', cache_ttl_ms: ttlMs })
  }

  try {
    const latest = await npmLatest(packageName, input.timeoutMs || normalizePositiveInt(env.SKS_UPDATE_NOTICE_TIMEOUT_MS, 1500))
    const updateAvailable = compareVersions(latest, currentVersion) > 0
    const notice: SksUpdateNotice = {
      schema: SKS_UPDATE_NOTICE_SCHEMA,
      checked_at: nowIso(),
      package_name: packageName,
      current_version: currentVersion,
      latest_version: latest,
      update_available: updateAvailable,
      source: 'npm-registry',
      cache_ttl_ms: ttlMs,
      message: updateAvailable
        ? `SKS ${latest} is available; current ${currentVersion}. This notice is informational and does not block launch or release gates.`
        : `SKS ${currentVersion} is current enough; update notice is informational.`
    }
    await ensureDir(path.dirname(cachePath))
    await writeJsonAtomic(cachePath, notice).catch(() => undefined)
    return persistNotice(input.missionDir, notice)
  } catch (err: any) {
    const notice: SksUpdateNotice = {
      schema: SKS_UPDATE_NOTICE_SCHEMA,
      checked_at: nowIso(),
      package_name: packageName,
      current_version: currentVersion,
      latest_version: cached?.latest_version || null,
      update_available: false,
      source: 'error',
      cache_ttl_ms: ttlMs,
      message: 'SKS update notice could not reach npm; launch continues without blocking.',
      error: err?.message || String(err)
    }
    return persistNotice(input.missionDir, notice)
  }
}

async function persistNotice(missionDir: string | null | undefined, notice: SksUpdateNotice) {
  if (missionDir) await writeJsonAtomic(path.join(missionDir, 'update-notice.json'), notice).catch(() => undefined)
  return notice
}

function npmLatest(packageName: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'registry.npmjs.org',
      path: `/${encodeURIComponent(packageName).replace(/^%40/, '@')}/latest`,
      method: 'GET',
      timeout: timeoutMs,
      headers: { Accept: 'application/json' }
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) throw new Error(`npm_status_${res.statusCode}`)
          const parsed = JSON.parse(body)
          if (!parsed?.version) throw new Error('npm_latest_version_missing')
          resolve(String(parsed.version))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('update_notice_timeout'))
    })
    req.on('error', reject)
    req.end()
  })
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] || 0) - (b[i] || 0)
    if (delta !== 0) return delta
  }
  return 0
}

function parseVersion(value: string) {
  return String(value || '').split(/[.-]/).map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0)
}

function normalizePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
