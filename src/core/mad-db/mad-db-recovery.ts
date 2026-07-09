import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, nowIso, writeJsonAtomic } from '../fsx.js';

export async function quarantineStaleMadDbRuntimeProfiles(root: string) {
  const missionsDir = path.join(root, '.sneakoscope', 'missions');
  const quarantined: string[] = [];
  if (!(await exists(missionsDir))) return { schema: 'sks.mad-db-recovery.v1', ok: true, quarantined, checked_at: nowIso() };
  const missions = await fs.readdir(missionsDir, { withFileTypes: true }).catch(() => []);
  for (const mission of missions) {
    if (!mission.isDirectory()) continue;
    const runtime = path.join(missionsDir, mission.name, 'mad-db', 'runtime');
    const profile = path.join(runtime, 'codex-mad-db.config.toml');
    if (!(await exists(profile))) continue;
    const dest = `${profile}.quarantined-${Date.now()}`;
    /* intentional: best-effort rename-then-rm quarantine of a leftover config; nothing depends on this file surviving */
    await fs.rename(profile, dest).catch(async () => {
      await fs.rm(profile, { force: true }).catch(() => undefined);
    });
    quarantined.push(path.relative(root, dest).split(path.sep).join('/'));
  }
  const report = { schema: 'sks.mad-db-recovery.v1', ok: true, quarantined, checked_at: nowIso() };
  /* intentional: recovery report is diagnostic-only, already returned to the caller regardless of whether it persisted */
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'mad-db-recovery.json'), report).catch(() => undefined);
  return report;
}
