import os from 'node:os';
import path from 'node:path';
import { sameFilesystemPath } from '../fsx.js';

export async function reconcileDoctorSkills(root: string, doctorFix: boolean): Promise<any> {
  if (!doctorFix) return { skipped: true, reason: 'doctor_without_fix' };

  const { reconcileSkills } = await import('../init/skills.js');
  const home = path.resolve(process.env.HOME || os.homedir());
  const globalTarget = path.resolve(home, '.agents', 'skills');
  const projectTarget = path.resolve(root, '.agents', 'skills');
  const global = await reconcileSkills({
    targetDir: globalTarget,
    scope: 'global',
    fix: true
  }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
  const project = await sameFilesystemPath(projectTarget, globalTarget)
    ? {
        schema: 'sks.skill-reconcile.v1',
        ok: true,
        scope: 'project',
        target_dir: projectTarget,
        fix: true,
        skipped: true,
        reason: 'same_as_authoritative_global_skill_root'
      }
    : await reconcileSkills({
        targetDir: projectTarget,
        scope: 'project',
        fix: true
      }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));
  return { global, project };
}
