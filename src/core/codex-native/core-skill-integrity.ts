import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import {
  ensureConfinedDirectory,
  inspectConfinedPath,
  isLexicallyConfined
} from '../managed-path-safety.js';
import { CORE_SKILL_TEMPLATE_VERSION, buildSksCoreSkillManifest, currentCoreSkillName, isCoreSkillName, isSksManagedCoreSkillContent, renderCoreSkillTemplate } from './core-skill-manifest.js';
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
  template_version: string;
  manifest_sha256: string;
  drift_detected_count: number;
  restored_count: number;
  installed_count: number;
  user_collision_count: number;
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
  const skillsRoot = path.resolve(input.skillsRoot || path.join(root, '.agents', 'skills'));
  const skillsBoundary = coreSkillsBoundary(root, skillsRoot);
  const apply = input.apply === true;
  const manifest = buildSksCoreSkillManifest();
  const rows: CoreSkillIntegrityRow[] = [];
  const installed: string[] = [];
  const restored: string[] = [];
  const skippedUserAuthored: string[] = [];
  const blockers: string[] = [];
  const reportPath = input.reportPath === null
    ? null
    : path.resolve(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'core-skill-integrity.json'));
  const backupRoot = path.join(root, '.sneakoscope', 'backups', 'core-skills');
  const reportPathBlocker = reportPath
    ? await inspectCoreSkillArtifactTarget(root, reportPath, 'report', 'file')
    : null;
  const backupPathBlocker = apply
    ? await inspectCoreSkillArtifactTarget(root, backupRoot, 'backup', 'directory')
    : null;
  const artifactPathBlockers = [reportPathBlocker, backupPathBlocker].filter((value): value is string => Boolean(value));
  blockers.push(...artifactPathBlockers);
  const mutationAllowed = apply && artifactPathBlockers.length === 0;
  for (const skill of manifest.skills) {
    const skillDir = path.join(skillsRoot, skill.canonical_name);
    const file = path.join(skillDir, 'SKILL.md');
    const desired = renderCoreSkillTemplate(skill.canonical_name);
    const safeCurrent = await readConfinedCoreSkill(skillsBoundary, skill.canonical_name, skillDir, file);
    const current = safeCurrent.text;
    const beforeSha = typeof current === 'string' ? sha256(current) : null;
    let action: CoreSkillSyncAction = 'already-current';
    let backupPath: string | null = null;
    let blocker: string | null = safeCurrent.blocker;
    if (blocker) {
      action = 'blocked';
    } else if (current === null) {
      action = 'install-missing-managed-copy';
      if (mutationAllowed) {
        await ensureConfinedDirectory(skillsBoundary, skillDir);
        await writeTextAtomic(file, desired);
        installed.push(file);
      }
    } else if (beforeSha === skill.content_sha256) {
      action = 'already-current';
    } else if (isSksManagedCoreSkillContent(current)) {
      action = 'restore-corrupted-managed-copy';
      if (mutationAllowed) {
        const candidateBackupPath = path.join(backupRoot, skill.canonical_name, `${Date.now()}-${process.pid}.SKILL.md.bak`);
        const backupWriteBlocker = await writeConfinedCoreSkillArtifact(root, candidateBackupPath, current, 'backup');
        if (backupWriteBlocker) {
          action = 'blocked';
          blocker = backupWriteBlocker;
        } else {
          backupPath = candidateBackupPath;
          await ensureConfinedDirectory(skillsBoundary, skillDir);
          await writeTextAtomic(file, desired);
          restored.push(file);
        }
      }
    } else {
      action = 'skip-user-authored';
      blocker = `user_authored_core_skill_collision:${skill.canonical_name}`;
      skippedUserAuthored.push(file);
    }
    const afterInspection = blocker && action === 'blocked'
      ? { text: null as string | null, blocker }
      : await readConfinedCoreSkill(skillsBoundary, skill.canonical_name, skillDir, file);
    if (!blocker && afterInspection.blocker) {
      action = 'blocked';
      blocker = afterInspection.blocker;
    }
    const after = afterInspection.text;
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
    template_version: CORE_SKILL_TEMPLATE_VERSION,
    manifest_sha256: sha256(JSON.stringify(manifest.skills.map((skill) => [skill.canonical_name, skill.content_sha256]))),
    drift_detected_count: rows.filter((row) => row.action === 'restore-corrupted-managed-copy' || row.action === 'skip-user-authored').length,
    restored_count: restored.length,
    installed_count: installed.length,
    user_collision_count: skippedUserAuthored.length,
    rows,
    installed,
    restored,
    skipped_user_authored: skippedUserAuthored,
    blockers
  };
  if (reportPath && !reportPathBlocker) {
    const reportWriteBlocker = await writeConfinedCoreSkillReport(root, reportPath, report);
    if (reportWriteBlocker) {
      blockers.push(reportWriteBlocker);
      report.ok = false;
    }
  }
  return report;
}

export function coreSkillPath(skillsRoot: string, name: string): string {
  return path.join(skillsRoot, currentCoreSkillName(canonicalSkillName(name)), 'SKILL.md');
}

function coreSkillsBoundary(root: string, skillsRoot: string): string {
  if (isLexicallyConfined(root, skillsRoot)) return root;
  const parent = path.dirname(skillsRoot);
  return ['.agents', '.codex'].includes(path.basename(parent)) ? path.dirname(parent) : parent;
}

async function readConfinedCoreSkill(
  boundary: string,
  skillName: string,
  skillDir: string,
  file: string
): Promise<{ text: string | null; blocker: string | null }> {
  try {
    const dirInspection = await inspectConfinedPath(boundary, skillDir);
    if (dirInspection.exists && (dirInspection.leafSymlink || !dirInspection.stat?.isDirectory())) {
      return { text: null, blocker: coreSkillPathBlocker(skillName, 'skill_directory_not_safe') };
    }
    const fileInspection = await inspectConfinedPath(boundary, file);
    if (!fileInspection.exists) return { text: null, blocker: null };
    if (fileInspection.leafSymlink || !fileInspection.stat?.isFile()) {
      return { text: null, blocker: coreSkillPathBlocker(skillName, 'skill_file_not_safe') };
    }
    return { text: await fs.readFile(file, 'utf8'), blocker: null };
  } catch (error: unknown) {
    return {
      text: null,
      blocker: coreSkillPathBlocker(skillName, coreSkillPathFailureReason(error))
    };
  }
}

type CoreSkillPathFailureReason =
  | 'skill_directory_not_safe'
  | 'skill_file_not_safe'
  | 'boundary_missing'
  | 'boundary_symlink'
  | 'boundary_not_directory'
  | 'escape_refused'
  | 'ancestor_symlink'
  | 'ancestor_not_directory'
  | 'inspection_failed';

type CoreSkillArtifactScope = 'report' | 'backup';
type CoreSkillArtifactFailureReason =
  | 'boundary_missing'
  | 'boundary_symlink'
  | 'boundary_not_directory'
  | 'escape_refused'
  | 'ancestor_symlink'
  | 'ancestor_not_directory'
  | 'leaf_symlink'
  | 'not_directory'
  | 'not_file'
  | 'inspection_failed'
  | 'write_failed';

function coreSkillPathBlocker(skillName: string, reason: CoreSkillPathFailureReason): string {
  const canonical = canonicalSkillName(skillName);
  const safeSkillName = isCoreSkillName(canonical) ? canonical : 'unknown';
  return `core_skill_path_unsafe:${safeSkillName}:${reason}`;
}

function coreSkillPathFailureReason(error: unknown): CoreSkillPathFailureReason {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'managed_path_boundary_missing') return 'boundary_missing';
  if (code === 'managed_path_boundary_symlink_refused') return 'boundary_symlink';
  if (code === 'managed_path_boundary_not_directory') return 'boundary_not_directory';
  if (code === 'managed_path_escape_refused') return 'escape_refused';
  if (code === 'managed_path_ancestor_symlink_refused') return 'ancestor_symlink';
  if (code === 'managed_path_ancestor_not_directory') return 'ancestor_not_directory';
  return 'inspection_failed';
}

async function inspectCoreSkillArtifactTarget(
  root: string,
  target: string,
  scope: CoreSkillArtifactScope,
  expected: 'directory' | 'file'
): Promise<string | null> {
  if (!isLexicallyConfined(root, target)) return coreSkillArtifactBlocker(scope, 'escape_refused');
  try {
    const inspection = await inspectConfinedPath(root, target);
    if (!inspection.exists) return null;
    if (inspection.leafSymlink) return coreSkillArtifactBlocker(scope, 'leaf_symlink');
    if (expected === 'directory' && !inspection.stat?.isDirectory()) {
      return coreSkillArtifactBlocker(scope, 'not_directory');
    }
    if (expected === 'file' && !inspection.stat?.isFile()) {
      return coreSkillArtifactBlocker(scope, 'not_file');
    }
    return null;
  } catch (error: unknown) {
    return coreSkillArtifactBlocker(scope, coreSkillArtifactFailureReason(error));
  }
}

async function writeConfinedCoreSkillArtifact(
  root: string,
  target: string,
  text: string,
  scope: CoreSkillArtifactScope
): Promise<string | null> {
  try {
    await ensureConfinedDirectory(root, path.dirname(target));
    const blocker = await inspectCoreSkillArtifactTarget(root, target, scope, 'file');
    if (blocker) return blocker;
    await writeTextAtomic(target, text);
    return null;
  } catch {
    return coreSkillArtifactBlocker(scope, 'write_failed');
  }
}

async function writeConfinedCoreSkillReport(
  root: string,
  target: string,
  report: CoreSkillIntegrityReport
): Promise<string | null> {
  try {
    await ensureConfinedDirectory(root, path.dirname(target));
    const blocker = await inspectCoreSkillArtifactTarget(root, target, 'report', 'file');
    if (blocker) return blocker;
    await writeJsonAtomic(target, report);
    return null;
  } catch {
    return coreSkillArtifactBlocker('report', 'write_failed');
  }
}

function coreSkillArtifactBlocker(
  scope: CoreSkillArtifactScope,
  reason: CoreSkillArtifactFailureReason
): string {
  return `core_skill_artifact_path_unsafe:${scope}:${reason}`;
}

function coreSkillArtifactFailureReason(error: unknown): CoreSkillArtifactFailureReason {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'managed_path_boundary_missing') return 'boundary_missing';
  if (code === 'managed_path_boundary_symlink_refused') return 'boundary_symlink';
  if (code === 'managed_path_boundary_not_directory') return 'boundary_not_directory';
  if (code === 'managed_path_escape_refused') return 'escape_refused';
  if (code === 'managed_path_ancestor_symlink_refused') return 'ancestor_symlink';
  if (code === 'managed_path_ancestor_not_directory') return 'ancestor_not_directory';
  return 'inspection_failed';
}
