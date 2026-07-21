import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import {
  ensureConfinedDirectory,
  inspectConfinedPath,
  isLexicallyConfined,
  moveConfinedPath,
  removeConfinedDirectoryIfEmpty,
  removeManagedPathVerified,
  uniqueConfinedPath
} from '../managed-path-safety.js';
import { buildSkillRegistryLedger, groupByCanonical, type SkillRegistryEntry } from './skill-registry-ledger.js';
import { writeRootConfinedJsonReport } from './confined-report-writer.js';

export interface ProjectSkillDedupeAction {
  canonical_name: string;
  action: 'kept' | 'quarantined' | 'reported';
  path: string;
  quarantine_path: string | null;
  reason: string;
}

export interface ProjectSkillDedupeReport {
  schema: 'sks.project-skill-dedupe.v1';
  generated_at: string;
  ok: boolean;
  root: string;
  fix: boolean;
  yes: boolean;
  actions: ProjectSkillDedupeAction[];
  active_unique_by_canonical_name: boolean;
  active_entries: SkillRegistryEntry[];
  duplicate_active_canonical_names: string[];
  duplicate_canonical_names: string[];
  unresolved_user_duplicates: string[];
  blockers: string[];
}

export async function dedupeProjectSkills(input: {
  root: string;
  fix?: boolean;
  yes?: boolean;
  quarantineUserDuplicates?: boolean;
  reportPath?: string | null;
}): Promise<ProjectSkillDedupeReport> {
  const root = path.resolve(input.root);
  const fix = input.fix === true;
  const yes = input.yes === true;
  const ledger = await buildSkillRegistryLedger({ root, reportPath: null });
  const grouped = groupByCanonical(ledger.entries);
  const actions: ProjectSkillDedupeAction[] = [];
  const unresolvedUserDuplicates: string[] = [];
  for (const [canonical, group] of grouped.entries()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => compareSkillPriority(root, a, b));
    const userEntries = group.filter((entry) => !entry.managed_by_sks);
    const managedEntries = group.filter((entry) => entry.managed_by_sks);
    if (userEntries.length > 0 && managedEntries.length > 0) {
      const keepUser = userEntries[0];
      if (keepUser) actions.push(actionRow(canonical, 'kept', keepUser, null, 'user-authored skill preserved'));
      const shouldMoveUserDuplicates = fix && yes && input.quarantineUserDuplicates === true;
      for (const duplicateUser of userEntries.slice(1)) {
        const quarantine = shouldMoveUserDuplicates ? await quarantineSkill(root, canonical, duplicateUser, 'user-authored duplicate skill') : null;
        actions.push(actionRow(canonical, quarantine ? 'quarantined' : 'reported', duplicateUser, quarantine, 'user-authored duplicate skill requires --quarantine-user-duplicates --yes'));
      }
      if (userEntries.length > 1 && !shouldMoveUserDuplicates) unresolvedUserDuplicates.push(canonical);
      for (const managed of managedEntries) {
        const quarantine = await maybeQuarantine(root, canonical, managed, fix, 'managed collision with user-authored skill');
        actions.push(actionRow(canonical, quarantine ? 'quarantined' : 'reported', managed, quarantine, 'managed collision with user-authored skill'));
      }
      continue;
    }
    if (managedEntries.length > 1) {
      const current = managedEntries.find((entry) => entry.status === 'managed-current') || managedEntries[0];
      if (current) actions.push(actionRow(canonical, 'kept', current, null, 'highest-priority SKS-managed skill kept'));
      for (const duplicate of managedEntries.filter((entry) => entry !== current)) {
        const quarantine = await maybeQuarantine(root, canonical, duplicate, fix, 'duplicate SKS-managed skill');
        actions.push(actionRow(canonical, quarantine ? 'quarantined' : 'reported', duplicate, quarantine, 'duplicate SKS-managed skill'));
      }
      continue;
    }
    if (userEntries.length > 1) {
      const keep = userEntries[0];
      if (keep) actions.push(actionRow(canonical, 'kept', keep, null, 'highest-priority user-authored skill kept'));
      const shouldMove = fix && yes && input.quarantineUserDuplicates === true;
      for (const duplicate of userEntries.slice(1)) {
        const quarantine = shouldMove ? await quarantineSkill(root, canonical, duplicate, 'user-authored duplicate skill') : null;
        actions.push(actionRow(canonical, quarantine ? 'quarantined' : 'reported', duplicate, quarantine, 'user-authored duplicate skill requires --quarantine-user-duplicates --yes'));
      }
      if (!shouldMove) unresolvedUserDuplicates.push(canonical);
    }
  }
  const duplicateNames = [...new Set(actions.filter((action) => action.action !== 'kept').map((action) => action.canonical_name))].sort();
  const afterLedger = await buildSkillRegistryLedger({ root, reportPath: null });
  const blockers = [
    ...ledger.blockers.filter((blocker) => !blocker.startsWith('duplicate_active_skill_name:')),
    ...unresolvedUserDuplicates.map((name) => `user_duplicate_requires_confirmation:${name}`),
    ...afterLedger.blockers.filter((blocker) => !blocker.startsWith('duplicate_active_skill_name:')),
    ...afterLedger.duplicate_active_canonical_names.map((name) => `duplicate_active_skill_name:${name}`)
  ];
  const report: ProjectSkillDedupeReport = {
    schema: 'sks.project-skill-dedupe.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    root,
    fix,
    yes,
    actions,
    active_unique_by_canonical_name: afterLedger.active_unique_by_canonical_name,
    active_entries: afterLedger.active_entries,
    duplicate_active_canonical_names: afterLedger.duplicate_active_canonical_names,
    duplicate_canonical_names: duplicateNames,
    unresolved_user_duplicates: unresolvedUserDuplicates,
    blockers: [...new Set(blockers)].sort()
  };
  const reportPath = input.reportPath === null
    ? null
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'project-skill-dedupe.json');
  if (reportPath) {
    const written = await writeRootConfinedJsonReport({ root, reportPath, value: report });
    if (!written) {
      report.ok = false;
      report.blockers = [...new Set([...report.blockers, 'project_skill_dedupe_report_path_unsafe'])].sort();
    }
  }
  return report;
}

function compareSkillPriority(root: string, a: SkillRegistryEntry, b: SkillRegistryEntry): number {
  const confinedA = skillEntryIsLexicallyConfined(root, a) ? 1 : 0;
  const confinedB = skillEntryIsLexicallyConfined(root, b) ? 1 : 0;
  if (confinedA !== confinedB) return confinedB - confinedA;
  const currentA = a.status === 'managed-current' ? 1 : 0;
  const currentB = b.status === 'managed-current' ? 1 : 0;
  return currentB - currentA || b.active_priority - a.active_priority || a.path.localeCompare(b.path);
}

function actionRow(
  canonicalName: string,
  action: ProjectSkillDedupeAction['action'],
  entry: SkillRegistryEntry,
  quarantinePath: string | null,
  reason: string
): ProjectSkillDedupeAction {
  return {
    canonical_name: canonicalName,
    action,
    path: entry.path,
    quarantine_path: quarantinePath,
    reason
  };
}

async function maybeQuarantine(root: string, canonical: string, entry: SkillRegistryEntry, fix: boolean, reason: string): Promise<string | null> {
  if (!fix) return null;
  return quarantineSkill(root, canonical, entry, reason);
}

async function quarantineSkill(root: string, canonical: string, entry: SkillRegistryEntry, reason: string): Promise<string | null> {
  const boundary = path.resolve(root);
  const sourceDir = path.dirname(entry.path);
  if (!skillEntryIsProjectOwned(boundary, entry)) return null;
  const sourceInspection = await inspectConfinedPath(boundary, sourceDir);
  if (!sourceInspection.exists) return null;
  if (sourceInspection.leafSymlink || !sourceInspection.stat?.isDirectory()) {
    throw new Error(`project_skill_source_not_safe_directory:${sourceDir}`);
  }
  const stamp = `${Date.now()}-${process.pid}`;
  const base = path.join(boundary, '.sneakoscope', 'quarantine', 'skills', canonical, stamp);
  const container = await uniqueConfinedPath(boundary, base);
  const target = path.join(container, path.basename(sourceDir));
  await ensureConfinedDirectory(boundary, container);
  const recordPath = path.join(container, 'quarantine-record.json');
  await writeJsonAtomic(recordPath, {
    schema: 'sks.skill-quarantine-record.v1',
    generated_at: nowIso(),
    source_path: sourceDir,
    quarantine_path: target,
    canonical_name: canonical,
    reason,
    content_sha256: entry.content_sha256
  });
  try {
    await moveConfinedPath(boundary, sourceDir, target);
  } catch (error: unknown) {
    await removeManagedPathVerified(boundary, recordPath).catch(() => undefined);
    await removeConfinedDirectoryIfEmpty(boundary, container).catch(() => undefined);
    throw error;
  }
  return target;
}

function skillEntryIsLexicallyConfined(root: string, entry: SkillRegistryEntry): boolean {
  return isLexicallyConfined(root, path.dirname(entry.path));
}

function skillEntryIsProjectOwned(root: string, entry: SkillRegistryEntry): boolean {
  if (entry.scope !== 'project') return false;
  const sourceDir = path.dirname(entry.path);
  return [
    path.join(root, '.agents', 'skills'),
    path.join(root, '.codex', 'skills')
  ].some((scanRoot) => isLexicallyConfined(scanRoot, sourceDir));
}
