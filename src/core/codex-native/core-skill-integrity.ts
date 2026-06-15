import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, readText, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { buildSksCoreSkillManifest, isSksManagedCoreSkillContent, renderCoreSkillTemplate } from './core-skill-manifest.js';
import { canonicalSkillName } from './skill-name-canonicalizer.js';

export type CoreSkillSyncAction =
  | 'already-current'
  | 'install-missing-managed-copy'
  | 'restore-corrupted-managed-copy'
  | 'skip-user-authored'
  | 'duplicate-quarantine'
  | 'blocked';

export interface CoreSkillIntegrityRow {
  canonical_name: string;
  path: string;
  action: CoreSkillSyncAction;
  before_sha256: string | null;
  after_sha256: string | null;
  backup_path: string | null;
  blocker: string | null;
}

export interface CoreSkillIntegrityReport {
  schema: 'sks.core-skill-integrity.v1';
  generated_at: string;
  ok: boolean;
  root: string;
  apply: boolean;
  skills_root: string;
  manifest_sha256: string;
  rows: CoreSkillIntegrityRow[];
  installed: string[];
  restored: string[];
  skipped_user_authored: string[];
  blockers: string[];
}

export async function syncCoreSkillsIntegrity(input: {
  root: string;
  apply?: boolean;
  skillsRoot?: string;
  reportPath?: string | null;
}): Promise<CoreSkillIntegrityReport> {
  const root = path.resolve(input.root);
  const skillsRoot = input.skillsRoot || path.join(root, '.agents', 'skills');
  const apply = input.apply === true;
  const manifest = buildSksCoreSkillManifest();
  const rows: CoreSkillIntegrityRow[] = [];
  const installed: string[] = [];
  const restored: string[] = [];
  const skippedUserAuthored: string[] = [];
  const blockers: string[] = [];
  for (const skill of manifest.skills) {
    const skillDir = path.join(skillsRoot, skill.canonical_name);
    const file = path.join(skillDir, 'SKILL.md');
    const desired = renderCoreSkillTemplate(skill.canonical_name);
    const current = await readText(file, null);
    const beforeSha = typeof current === 'string' ? sha256(current) : null;
    let action: CoreSkillSyncAction = 'already-current';
    let backupPath: string | null = null;
    let blocker: string | null = null;
    if (current === null) {
      action = 'install-missing-managed-copy';
      if (apply) {
        await ensureDir(skillDir);
        await writeTextAtomic(file, desired);
        installed.push(file);
      }
    } else if (beforeSha === skill.content_sha256) {
      action = 'already-current';
    } else if (isSksManagedCoreSkillContent(current)) {
      action = 'restore-corrupted-managed-copy';
      if (apply) {
        backupPath = path.join(root, '.sneakoscope', 'backups', 'core-skills', skill.canonical_name, `${Date.now()}-${process.pid}.SKILL.md.bak`);
        await ensureDir(path.dirname(backupPath));
        await fs.writeFile(backupPath, current, 'utf8');
        await writeTextAtomic(file, desired);
        restored.push(file);
      }
    } else {
      action = 'skip-user-authored';
      blocker = `user_authored_core_skill_collision:${skill.canonical_name}`;
      skippedUserAuthored.push(file);
    }
    const after = await readText(file, null);
    const afterSha = typeof after === 'string' ? sha256(after) : null;
    rows.push({
      canonical_name: skill.canonical_name,
      path: file,
      action,
      before_sha256: beforeSha,
      after_sha256: afterSha,
      backup_path: backupPath,
      blocker
    });
    if (blocker) blockers.push(blocker);
  }
  const report: CoreSkillIntegrityReport = {
    schema: 'sks.core-skill-integrity.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    root,
    apply,
    skills_root: skillsRoot,
    manifest_sha256: sha256(JSON.stringify(manifest.skills.map((skill) => [skill.canonical_name, skill.content_sha256]))),
    rows,
    installed,
    restored,
    skipped_user_authored: skippedUserAuthored,
    blockers
  };
  const reportPath = input.reportPath === null
    ? null
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'core-skill-integrity.json');
  if (reportPath) await writeJsonAtomic(reportPath, report).catch(() => undefined);
  return report;
}

export function coreSkillPath(skillsRoot: string, name: string): string {
  return path.join(skillsRoot, canonicalSkillName(name), 'SKILL.md');
}
