import path from 'node:path';
import { globalSksRoot, nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { tierModelsFingerprint } from '../subagents/model-tiers.js';
import { refreshStaleManagedRolePins } from '../subagents/role-model-pins.js';

export const GLOBAL_ROLE_PINS_STAMP_SCHEMA = 'sks.global-role-pins-stamp.v1' as const;

export function globalRolePinsStampPath(): string {
  return path.join(globalSksRoot(), 'state', 'global-role-pins.json');
}

/**
 * The role files in `~/.codex/agents` serve every Codex project, and the
 * user-level hooks run in every project, including ones that were never set up
 * for SKS. Their pins are therefore refreshed here, once per change of the
 * newest models and independent of any project, instead of waiting for an SKS
 * project to be opened. A failed refresh leaves the stamp unwritten so the next
 * hook retries; one that completed but could not fix everything is stamped with
 * what remains so it is not retried on every prompt.
 */
export async function maybeRefreshGlobalRolePins(): Promise<{ stale: number; updated: string[]; remaining: number } | null> {
  const tierModels = tierModelsFingerprint();
  if (tierModels === null) return null;
  const stampPath = globalRolePinsStampPath();
  const stamp: any = await readJson(stampPath, null).catch(() => null);
  if (stamp?.schema === GLOBAL_ROLE_PINS_STAMP_SCHEMA && stamp?.tier_models === tierModels) return null;
  const result = await refreshStaleManagedRolePins({ globalOnly: true });
  await writeJsonAtomic(stampPath, {
    schema: GLOBAL_ROLE_PINS_STAMP_SCHEMA,
    tier_models: tierModels,
    role_pins: result,
    checked_at: nowIso()
  });
  return result;
}
