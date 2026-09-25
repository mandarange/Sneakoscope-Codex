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
 * `sks update` refreshes managed guidance only in the directory it runs from.
 * A project that is used only through Codex hooks never runs an SKS command,
 * so its AGENTS.md managed block and `.codex/SNEAKOSCOPE.md` kept telling the
 * model the previous version's rules. The first hook after an update refreshes
 * those SKS-owned files once; a version stamp keeps every later hook to one
 * small read. Projects without `.sneakoscope/` are not SKS projects and are
 * left alone.
 */
export async function maybeReconcileManagedGuidancePreflight(root: string): Promise<{ refreshed: string[] } | null> {
  const projectRoot = path.resolve(root);
  const stampPath = managedGuidanceStampPath(projectRoot);
  const stamp: any = await readJson(stampPath, null).catch(() => null);
  if (stamp?.schema === MANAGED_GUIDANCE_STAMP_SCHEMA && stamp?.version === PACKAGE_VERSION) return null;
  const sksDir = await fsp.lstat(path.join(projectRoot, '.sneakoscope')).catch(() => null);
  if (!sksDir?.isDirectory() || sksDir.isSymbolicLink()) return null;
  const report = await reconcileManagedProjectPromptGuidance(projectRoot);
  // Leave the stamp unwritten after a failure so the next hook retries.
  if (report.errors > 0) return { refreshed: report.refreshed };
  await ensureConfinedDirectory(projectRoot, path.dirname(stampPath));
  await writeJsonAtomic(stampPath, {
    schema: MANAGED_GUIDANCE_STAMP_SCHEMA,
    version: PACKAGE_VERSION,
    refreshed: report.refreshed,
    checked_at: nowIso()
  });
  return { refreshed: report.refreshed };
}
