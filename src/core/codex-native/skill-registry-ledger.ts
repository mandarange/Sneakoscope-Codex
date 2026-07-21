import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { canonicalFilesystemPath, nowIso, readText, sha256 } from '../fsx.js';
import { inspectConfinedPath, isLexicallyConfined } from '../managed-path-safety.js';
import { buildSksCoreSkillManifest, isSksManagedCoreSkillContent } from './core-skill-manifest.js';
import { canonicalSkillName, skillDisplayNameFromMarkdown } from './skill-name-canonicalizer.js';
import { loadSkillsManifest } from '../init/skills.js';
import { writeRootConfinedJsonReport } from './confined-report-writer.js';

export interface SkillRegistryEntry {
  schema: 'sks.skill-registry-entry.v1';
  root: string;
  scope: 'project' | 'global' | 'codex-home' | 'user';
  canonical_name: string;
  display_name: string;
  path: string;
  managed_by_sks: boolean;
  content_sha256: string;
  active_priority: number;
  status: 'active' | 'duplicate' | 'quarantined' | 'user-owned' | 'managed-current' | 'managed-drift' | 'shadowed-official';
  blockers: string[];
}

export interface SkillRegistryLedger {
  schema: 'sks.skill-registry-ledger.v1';
  generated_at: string;
  ok: boolean;
  root: string;
  entries: SkillRegistryEntry[];
  active_unique_by_canonical_name: boolean;
  active_entries: SkillRegistryEntry[];
  duplicate_active_canonical_names: string[];
  duplicate_canonical_names: string[];
  blockers: string[];
}

export async function buildSkillRegistryLedger(input: {
  root: string;
  reportPath?: string | null;
  extraRoots?: Array<{ root: string; scope: SkillRegistryEntry['scope']; priority: number }>;
}): Promise<SkillRegistryLedger> {
  const root = path.resolve(input.root);
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const home = os.homedir();
  const codexHomeBoundary = isLexicallyConfined(home, codexHome) ? home : path.dirname(path.resolve(codexHome));
  const scanRootResolution = await dedupeSkillRegistryScanRoots([
    { root: path.join(root, '.agents', 'skills'), boundary: root, scope: 'project' as const, priority: 100 },
    { root: path.join(root, '.codex', 'skills'), boundary: root, scope: 'project' as const, priority: 80 },
    { root: path.join(home, '.agents', 'skills'), boundary: home, scope: 'global' as const, priority: 60 },
    { root: path.join(codexHome, 'skills'), boundary: codexHomeBoundary, scope: 'codex-home' as const, priority: 60 },
    ...(input.extraRoots || [])
  ]);
  const scanRoots = scanRootResolution.roots;
  const manifest = await loadSkillsManifest().catch(() => null);
  const officialNames = new Set<string>((manifest?.skills || []).map((skill: any) => canonicalSkillName(skill.canonical_name)));
  const aliasNames = new Set<string>((manifest?.skills || []).flatMap((skill: any) => (skill.deprecated_aliases || []).map((name: any) => canonicalSkillName(name))));
  const manifestByName = new Map<string, string>();
  const managedDigestsByName = new Map<string, Set<string>>();
  const addManagedDigest = (name: unknown, digest: unknown) => {
    const canonical = canonicalSkillName(String(name || ''));
    const boundedDigest = String(digest || '').toLowerCase();
    if (!canonical || !/^[a-f0-9]{64}$/.test(boundedDigest)) return;
    const digests = managedDigestsByName.get(canonical) || new Set<string>();
    digests.add(boundedDigest);
    managedDigestsByName.set(canonical, digests);
  };
  for (const skill of buildSksCoreSkillManifest().skills) {
    manifestByName.set(skill.canonical_name, skill.content_sha256);
    addManagedDigest(skill.canonical_name, skill.content_sha256);
  }
  for (const skill of manifest?.skills || []) {
    const canonical = canonicalSkillName(skill?.canonical_name);
    const currentDigest = String(skill?.content_sha256 || '').toLowerCase();
    if (canonical && /^[a-f0-9]{64}$/.test(currentDigest)) manifestByName.set(canonical, currentDigest);
    for (const name of [canonical, ...(skill?.deprecated_aliases || []).map((alias: unknown) => canonicalSkillName(String(alias || '')))]) {
      addManagedDigest(name, currentDigest);
      for (const digest of skill?.hash_history || []) addManagedDigest(name, digest);
    }
  }
  const entries: SkillRegistryEntry[] = [];
  for (const scanRoot of scanRoots) {
    const rows = await fs.readdir(scanRoot.root, { withFileTypes: true }).catch(() => []);
    for (const row of rows) {
      if (!row.isDirectory()) continue;
      const skillPath = path.join(scanRoot.root, row.name, 'SKILL.md');
      if (scanRoot.boundary) {
        const inspection = await inspectConfinedPath(scanRoot.boundary, skillPath).catch(() => null);
        if (!inspection?.exists || inspection.leafSymlink || !inspection.stat?.isFile()) continue;
      }
      const text = await readText(skillPath, null);
      if (typeof text !== 'string') continue;
      const displayName = skillDisplayNameFromMarkdown(text, row.name);
      const canonical = canonicalSkillName(displayName || row.name);
      const hash = sha256(text);
      const officialName = officialNames.has(canonical) || aliasNames.has(canonical);
      const managed = isRecognizedSksManagedSkillContent(text)
        || Boolean(officialName && managedDigestsByName.get(canonical)?.has(hash));
      const expected = manifestByName.get(canonical);
      const status: SkillRegistryEntry['status'] = managed
        ? expected && expected === hash ? 'managed-current' : 'managed-drift'
        : 'user-owned';
      entries.push({
        schema: 'sks.skill-registry-entry.v1',
        root: scanRoot.root,
        scope: scanRoot.scope,
        canonical_name: canonical,
        display_name: displayName || row.name,
        path: skillPath,
        managed_by_sks: managed,
        content_sha256: hash,
        active_priority: scanRoot.priority,
        status,
        blockers: []
      });
    }
  }
  const grouped = groupByCanonical(entries);
  const duplicates = [...grouped.entries()].filter(([, group]) => group.length > 1).map(([name]) => name).sort();
  for (const group of grouped.values()) {
    const official = group.some((entry) => officialNames.has(entry.canonical_name) || aliasNames.has(entry.canonical_name));
    group.sort((a, b) => compareRegistryPriority(a, b, official));
    group.forEach((entry, index) => {
      if (group.length > 1 && index > 0) entry.status = official && entry.scope === 'project' ? 'shadowed-official' : 'duplicate';
    });
  }
  const activeEntries = entries.filter((entry) => entry.status !== 'quarantined' && entry.status !== 'shadowed-official');
  const activeGrouped = groupByCanonical(activeEntries);
  const duplicateActiveNames = [...activeGrouped.entries()].filter(([, group]) => group.length > 1).map(([name]) => name).sort();
  const activeUnique = duplicateActiveNames.length === 0;
  const blockers = [
    ...scanRootResolution.blockers,
    ...duplicateActiveNames.map((name) => `duplicate_active_skill_name:${name}`)
  ];
  const ledger: SkillRegistryLedger = {
    schema: 'sks.skill-registry-ledger.v1',
    generated_at: nowIso(),
    ok: activeUnique && blockers.length === 0,
    root,
    entries,
    active_unique_by_canonical_name: activeUnique,
    active_entries: activeEntries,
    duplicate_active_canonical_names: duplicateActiveNames,
    duplicate_canonical_names: duplicates,
    blockers
  };
  const reportPath = input.reportPath === null
    ? null
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'skill-registry-ledger.json');
  if (reportPath) {
    const written = await writeRootConfinedJsonReport({ root, reportPath, value: ledger });
    if (!written) {
      ledger.ok = false;
      ledger.blockers = [...new Set([...ledger.blockers, 'skill_registry_report_path_unsafe'])].sort();
    }
  }
  return ledger;
}

const SKS_MANAGED_SKILL_MARKER_RE = /BEGIN SKS (?:IMMUTABLE CORE|MANAGED) SKILL/;
function isRecognizedSksManagedSkillContent(text: string): boolean {
  return isSksManagedCoreSkillContent(text) || SKS_MANAGED_SKILL_MARKER_RE.test(text);
}

async function dedupeSkillRegistryScanRoots(
  candidates: Array<{ root: string; boundary?: string; scope: SkillRegistryEntry['scope']; priority: number }>
) {
  const byPath = new Map<string, { root: string; boundary?: string; scope: SkillRegistryEntry['scope']; priority: number }>();
  const blockers: string[] = [];
  for (const candidate of candidates) {
    const normalized = {
      ...candidate,
      root: path.resolve(candidate.root),
      ...(candidate.boundary ? { boundary: path.resolve(candidate.boundary) } : {})
    };
    if (normalized.boundary) {
      try {
        await fs.lstat(normalized.root);
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
        blockers.push(unsafeSkillScanRootBlocker(normalized.scope, 'lstat_failed'));
        continue;
      }
      try {
        const inspection = await inspectConfinedPath(normalized.boundary, normalized.root);
        if (!inspection.exists) continue;
        if (inspection.leafSymlink) {
          blockers.push(unsafeSkillScanRootBlocker(normalized.scope, 'leaf_symlink'));
          continue;
        }
        if (!inspection.stat?.isDirectory()) {
          blockers.push(unsafeSkillScanRootBlocker(normalized.scope, 'not_directory'));
          continue;
        }
      } catch (error: unknown) {
        blockers.push(unsafeSkillScanRootBlocker(normalized.scope, skillScanRootInspectionFailureReason(error)));
        continue;
      }
    }
    const identity = await canonicalFilesystemPath(candidate.root);
    const current = byPath.get(identity);
    if (!current || skillScanScopeRank(normalized.scope) > skillScanScopeRank(current.scope)) {
      byPath.set(identity, normalized);
    }
  }
  return { roots: [...byPath.values()], blockers: [...new Set(blockers)].sort() };
}

type SkillScanRootFailureReason =
  | 'lstat_failed'
  | 'leaf_symlink'
  | 'not_directory'
  | 'boundary_missing'
  | 'boundary_symlink'
  | 'boundary_not_directory'
  | 'escape_refused'
  | 'ancestor_symlink'
  | 'ancestor_not_directory'
  | 'inspection_failed';

function unsafeSkillScanRootBlocker(
  scope: SkillRegistryEntry['scope'],
  reason: SkillScanRootFailureReason
): string {
  return `unsafe_skill_scan_root:${skillScanRootScopeCode(scope)}:${reason}`;
}

function skillScanRootScopeCode(scope: SkillRegistryEntry['scope']): SkillRegistryEntry['scope'] | 'unknown' {
  if (scope === 'project' || scope === 'global' || scope === 'codex-home' || scope === 'user') return scope;
  return 'unknown';
}

function skillScanRootInspectionFailureReason(error: unknown): SkillScanRootFailureReason {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'managed_path_boundary_missing') return 'boundary_missing';
  if (code === 'managed_path_boundary_symlink_refused') return 'boundary_symlink';
  if (code === 'managed_path_boundary_not_directory') return 'boundary_not_directory';
  if (code === 'managed_path_escape_refused') return 'escape_refused';
  if (code === 'managed_path_ancestor_symlink_refused') return 'ancestor_symlink';
  if (code === 'managed_path_ancestor_not_directory') return 'ancestor_not_directory';
  return 'inspection_failed';
}

function skillScanScopeRank(scope: SkillRegistryEntry['scope']): number {
  if (scope === 'global' || scope === 'codex-home') return 3;
  if (scope === 'project') return 2;
  return 1;
}

function compareRegistryPriority(a: SkillRegistryEntry, b: SkillRegistryEntry, official: boolean): number {
  if (official) {
    const globalA = a.scope === 'global' || a.scope === 'codex-home' ? 1 : 0;
    const globalB = b.scope === 'global' || b.scope === 'codex-home' ? 1 : 0;
    if (globalA !== globalB) return globalB - globalA;
  }
  return b.active_priority - a.active_priority || a.path.localeCompare(b.path);
}

export function groupByCanonical(entries: SkillRegistryEntry[]): Map<string, SkillRegistryEntry[]> {
  const grouped = new Map<string, SkillRegistryEntry[]>();
  for (const entry of entries) {
    const current = grouped.get(entry.canonical_name) || [];
    current.push(entry);
    grouped.set(entry.canonical_name, current);
  }
  return grouped;
}
