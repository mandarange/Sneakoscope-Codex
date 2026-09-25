import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, PACKAGE_VERSION, readJson, writeJsonAtomic } from '../fsx.js';
import { ensureConfinedDirectory } from '../managed-path-safety.js';
import { reconcileManagedProjectPromptGuidance } from '../doctor/current-project-guidance.js';

export const MANAGED_GUIDANCE_STAMP_SCHEMA = 'sks.managed-guidance-generation.v1' as const;

export function managedGuidanceStampPath(root: string): string {
  return path.join(root, '.sneakoscope', 'state', 'managed-guidance-generation.json');
}

/**
 * A project that is used only through Codex hooks never runs an SKS command,
 * so after an update its AGENTS.md managed block, `.codex/SNEAKOSCOPE.md`,
 * agent roles, and hooks kept the previous version's content. The first hook
 * after an update refreshes the guidance files at once and queues the full
 * project migration (roles, hooks, config) in a detached runner, so the hook
 * never waits for it. A version stamp keeps every later hook to one small
 * read. A folder with neither `.sneakoscope/` nor `.codex/SNEAKOSCOPE.md` is
 * not an SKS project and is left alone.
 */
export async function maybeReconcileManagedGuidancePreflight(root: string): Promise<{ refreshed: string[]; migration: string | null } | null> {
  const projectRoot = path.resolve(root);
  const stampPath = managedGuidanceStampPath(projectRoot);
  const stamp: any = await readJson(stampPath, null).catch(() => null);
  if (stamp?.schema === MANAGED_GUIDANCE_STAMP_SCHEMA && stamp?.version === PACKAGE_VERSION) return null;
  if (!(await isSksProject(projectRoot))) return null;
  const report = await reconcileManagedProjectPromptGuidance(projectRoot);
  const migration = await queueProjectMigration(projectRoot).catch(() => null);
  // Leave the stamp unwritten after a failure so the next hook retries.
  if (report.errors > 0) return { refreshed: report.refreshed, migration };
  await ensureConfinedDirectory(projectRoot, path.dirname(stampPath));
  await writeJsonAtomic(stampPath, {
    schema: MANAGED_GUIDANCE_STAMP_SCHEMA,
    version: PACKAGE_VERSION,
    refreshed: report.refreshed,
    migration,
    checked_at: nowIso()
  });
  return { refreshed: report.refreshed, migration };
}

async function isSksProject(root: string): Promise<boolean> {
  const sksDir = await fsp.lstat(path.join(root, '.sneakoscope')).catch(() => null);
  if (sksDir?.isSymbolicLink()) return false;
  if (sksDir?.isDirectory()) return true;
  const marker = await fsp.lstat(path.join(root, '.codex', 'SNEAKOSCOPE.md')).catch(() => null);
  return Boolean(marker?.isFile());
}

/**
 * Record the project and, unless its migration receipt is already current for
 * this version, start the background migration. Loaded lazily: this runs once
 * per version per project, and every other hook must not pay for the import.
 */
async function queueProjectMigration(root: string): Promise<string> {
  const registry = await import('../update/sks-project-registry.js');
  await registry.recordSksProject(root);
  const receipt: any = await readJson(path.join(root, '.sneakoscope', 'update', 'migration-receipt.json'), null).catch(() => null);
  if (receipt?.sks_version === PACKAGE_VERSION && receipt?.status === 'current' && Array.isArray(receipt.blockers) && receipt.blockers.length === 0) {
    return 'current';
  }
  const spawn = await registry.spawnProjectMigrationFanout([root]);
  return spawn.spawned ? 'queued' : `not_queued:${spawn.reason}`;
}
