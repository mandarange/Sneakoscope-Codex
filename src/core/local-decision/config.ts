import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { isDecisionMode } from './mode.js'
import { localDecisionPaths } from './paths.js'
import type { DecisionMode, LocalDecisionConfig } from './types.js'

export const DEFAULT_SHADOW_SAMPLE_RATE = 0.1

export function defaultLocalDecisionConfig(): LocalDecisionConfig {
  return { schemaVersion: 1, mode: 'off', shadowSampleRate: DEFAULT_SHADOW_SAMPLE_RATE, updatedAt: null }
}

function normalizeConfig(raw: unknown): LocalDecisionConfig {
  const fallback = defaultLocalDecisionConfig()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== 1) return fallback
  const mode: DecisionMode = isDecisionMode(record.mode) ? record.mode : 'off'
  const rate = typeof record.shadowSampleRate === 'number' && Number.isFinite(record.shadowSampleRate)
    ? Math.min(1, Math.max(0, record.shadowSampleRate))
    : DEFAULT_SHADOW_SAMPLE_RATE
  return {
    schemaVersion: 1,
    mode,
    shadowSampleRate: rate,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null
  }
}

/**
 * Reads the user-scoped mode. A missing or unreadable file means `off`: the
 * automatic hook must never start a service or download anything on its own.
 * This is the only file the Naruto route reads for this feature, so the off
 * path costs exactly one small read.
 */
export async function readLocalDecisionConfig(env: NodeJS.ProcessEnv = process.env): Promise<LocalDecisionConfig> {
  const { configPath } = localDecisionPaths(env)
  const raw = await readJson<unknown>(configPath, null).catch(() => null)
  return normalizeConfig(raw)
}

export async function writeLocalDecisionConfig(
  patch: Partial<Pick<LocalDecisionConfig, 'mode' | 'shadowSampleRate'>>,
  env: NodeJS.ProcessEnv = process.env
): Promise<LocalDecisionConfig> {
  const { configPath, runtimeRoot } = localDecisionPaths(env)
  const current = await readLocalDecisionConfig(env)
  const next: LocalDecisionConfig = {
    ...current,
    ...(patch.mode === undefined ? {} : { mode: patch.mode }),
    ...(patch.shadowSampleRate === undefined ? {} : { shadowSampleRate: Math.min(1, Math.max(0, patch.shadowSampleRate)) }),
    updatedAt: nowIso()
  }
  if (!isDecisionMode(next.mode)) throw new Error(`invalid_decision_mode:${String(next.mode)}`)
  await fsp.mkdir(runtimeRoot, { recursive: true, mode: 0o700 })
  await writeJsonAtomic(configPath, next, { mode: 0o600 })
  await fsp.chmod(path.dirname(configPath), 0o700).catch(() => undefined)
  return next
}
