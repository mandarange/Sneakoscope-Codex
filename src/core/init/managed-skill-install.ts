import path from 'node:path';
import os from 'node:os';
import { ensureDir, sameFilesystemPath } from '../fsx.js';
import { AUTHORITATIVE_SKS_SKILL_ROOT_REFERENCE } from '../codex-native/sks-skill-paths.js';
import {
  installGlobalSkills,
  installProjectSkills,
  type SkillReconcileReport
} from './skills.js';

export type ManagedSkillInstallReport = SkillReconcileReport & {
  project_residue_reconcile?: SkillReconcileReport;
};

function mergedStrings(left: unknown, right: unknown): string[] {
  return [...new Set([
    ...(Array.isArray(left) ? left.map(String) : []),
    ...(Array.isArray(right) ? right.map(String) : [])
  ])];
}

export async function reconcileManagedSkillInstallation(root: string, home?: string): Promise<{
  skillInstall: ManagedSkillInstallReport;
  created: string[];
}> {
  const globalSkillHome = path.resolve(home || process.env.HOME || os.homedir());
  await ensureDir(globalSkillHome);

  const skillInstall: ManagedSkillInstallReport = await installGlobalSkills(globalSkillHome);
  const globalSkillTarget = path.resolve(globalSkillHome, '.agents', 'skills');
  const projectSkillTarget = path.resolve(root, '.agents', 'skills');
  const projectSkillCleanup = await sameFilesystemPath(projectSkillTarget, globalSkillTarget)
    ? null
    : await installProjectSkills(root);
  const created: string[] = [];

  if (projectSkillCleanup) {
    skillInstall.ok = skillInstall.ok && projectSkillCleanup.ok;
    skillInstall.warnings = mergedStrings(skillInstall.warnings, projectSkillCleanup.warnings);
    skillInstall.removed = mergedStrings(skillInstall.removed, projectSkillCleanup.removed);
    skillInstall.quarantined_user_collisions = mergedStrings(
      skillInstall.quarantined_user_collisions,
      projectSkillCleanup.quarantined_user_collisions
    );
    skillInstall.removed_stale_generated_skills = mergedStrings(
      skillInstall.removed_stale_generated_skills,
      projectSkillCleanup.removed_stale_generated_skills
    );
    skillInstall.project_residue_reconcile = projectSkillCleanup;
    created.push('.agents/skills official residue reconciled');
  }

  created.push(`${AUTHORITATIVE_SKS_SKILL_ROOT_REFERENCE}/sks-*`);
  const removedStaleGeneratedSkills = skillInstall.removed_stale_generated_skills || skillInstall.removed || [];
  const removedAgentSkillAliases = skillInstall.removed_agent_skill_aliases || [];
  const removedCodexSkillMirrors = skillInstall.removed_codex_skill_mirrors || [];
  if (removedStaleGeneratedSkills.length) created.push(`stale generated skills removed (${removedStaleGeneratedSkills.length})`);
  if (removedAgentSkillAliases.length) created.push(`deprecated generated skill aliases removed (${removedAgentSkillAliases.length})`);
  if (removedCodexSkillMirrors.length) created.push(`.codex/skills generated mirrors removed (${removedCodexSkillMirrors.length})`);
  return { skillInstall, created };
}
