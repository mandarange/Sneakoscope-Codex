import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { nowIso, readText, sha256, writeJsonAtomic } from '../fsx.js';
import { buildSksCoreSkillManifest, isSksManagedCoreSkillContent } from './core-skill-manifest.js';
import { canonicalSkillName, skillDisplayNameFromMarkdown } from './skill-name-canonicalizer.js';
import { loadSkillsManifest } from '../init/skills.js';

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
  const scanRoots = [
    { root: path.join(root, '.agents', 'skills'), scope: 'project' as const, priority: 100 },
    { root: path.join(root, '.codex', 'skills'), scope: 'project' as const, priority: 80 },
    { root: path.join(os.homedir(), '.agents', 'skills'), scope: 'global' as const, priority: 60 },
    { root: path.join(codexHome, 'skills'), scope: 'codex-home' as const, priority: 60 },
    ...(input.extraRoots || [])
  ];
  const manifest = await loadSkillsManifest().catch(() => null);
  const officialNames = new Set<string>((manifest?.skills || []).map((skill: any) => canonicalSkillName(skill.canonical_name)));
  const aliasNames = new Set<string>((manifest?.skills || []).flatMap((skill: any) => (skill.deprecated_aliases || []).map((name: any) => canonicalSkillName(name))));
  const manifestByName = new Map([
    ...buildSksCoreSkillManifest().skills.map((skill) => [skill.canonical_name, skill.content_sha256] as const),
    ...(manifest?.skills || []).map((skill: any) => [canonicalSkillName(skill.canonical_name), String(skill.content_sha256 || '')] as const)
  ]);
  const entries: SkillRegistryEntry[] = [];
  for (const scanRoot of scanRoots) {
    const rows = await fs.readdir(scanRoot.root, { withFileTypes: true }).catch(() => []);
    for (const row of rows) {
      if (!row.isDirectory()) continue;
      const skillPath = path.join(scanRoot.root, row.name, 'SKILL.md');
      const text = await readText(skillPath, null);
      if (typeof text !== 'string') continue;
      const displayName = skillDisplayNameFromMarkdown(text, row.name);
      const canonical = canonicalSkillName(displayName || row.name);
      const hash = sha256(text);
      const officialName = officialNames.has(canonical) || aliasNames.has(canonical);
      const managed = isSksManagedCoreSkillContent(text) || text.includes('BEGIN SKS MANAGED SKILL') || officialName;
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
  const blockers = duplicateActiveNames.map((name) => `duplicate_active_skill_name:${name}`);
  const ledger: SkillRegistryLedger = {
    schema: 'sks.skill-registry-ledger.v1',
    generated_at: nowIso(),
    ok: activeUnique,
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
  if (reportPath) await writeJsonAtomic(reportPath, ledger).catch(() => undefined);
  return ledger;
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
