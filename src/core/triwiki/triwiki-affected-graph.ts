import { spawnSync } from 'node:child_process';
import { DEFAULT_TRIWIKI_MODULE_CARDS, moduleIdsForPath, type TriWikiModuleCard } from './triwiki-module-card.js';
import { buildTriWikiGateImpactMap } from './triwiki-gate-impact-map.js';

export const TRIWIKI_AFFECTED_GRAPH_SCHEMA = 'sks.triwiki-affected-graph.v1';

export interface TriWikiAffectedGraphInput {
  root: string;
  changedFiles?: string[];
  tier?: 'instant' | 'affected' | 'confidence' | 'release';
  cards?: TriWikiModuleCard[];
}

export interface TriWikiAffectedGraph {
  schema: typeof TRIWIKI_AFFECTED_GRAPH_SCHEMA;
  root: string;
  tier: string;
  changed_files: string[];
  affected_modules: string[];
  gate_packs: string[];
  gates: string[];
  release_equivalent_within_scope: boolean;
  confidence: 'instant' | 'affected-release-equivalent' | 'full-release';
  conservative_reason: string | null;
}

export function computeTriWikiAffectedGraph(input: TriWikiAffectedGraphInput): TriWikiAffectedGraph {
  const cards = input.cards || DEFAULT_TRIWIKI_MODULE_CARDS;
  const changedFiles = normalizeChangedFiles(input.changedFiles && input.changedFiles.length ? input.changedFiles : gitChangedFiles(input.root));
  const affectedModules = new Set<string>();
  let conservativeReason: string | null = null;
  for (const file of changedFiles) {
    const ids = moduleIdsForPath(file, cards);
    for (const id of ids) affectedModules.add(id);
    if (ids.includes('unknown')) conservativeReason = 'unknown_changed_file';
  }
  if (!changedFiles.length) affectedModules.add('release');
  if (changedFiles.some((file) => file === 'package.json' || file === 'package-lock.json' || file === 'release-gates.v2.json')) {
    conservativeReason = conservativeReason || 'root_release_surface_changed';
    for (const card of cards) affectedModules.add(card.module_id);
  }
  const impactMap = buildTriWikiGateImpactMap(input.root, cards);
  const selected = impactMap.impacts.filter((impact) => impact.modules.some((moduleId) => affectedModules.has(moduleId)) || conservativeReason === 'root_release_surface_changed');
  const gatePacks = new Set<string>();
  for (const impact of selected) gatePacks.add(impact.gate_pack);
  const tier = input.tier || 'affected';
  return {
    schema: TRIWIKI_AFFECTED_GRAPH_SCHEMA,
    root: input.root,
    tier,
    changed_files: changedFiles,
    affected_modules: [...affectedModules].sort(),
    gate_packs: [...gatePacks].sort(),
    gates: selected.map((impact) => impact.gate_id).sort(),
    release_equivalent_within_scope: tier !== 'instant',
    confidence: tier === 'release' ? 'full-release' : tier === 'instant' ? 'instant' : 'affected-release-equivalent',
    conservative_reason: conservativeReason
  };
}

function normalizeChangedFiles(files: string[]): string[] {
  return [...new Set(files.map((file) => file.trim().replace(/\\/g, '/')).filter(Boolean))].sort();
}

function gitChangedFiles(root: string): string[] {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((line) => line.includes(' -> ') ? line.split(' -> ').pop() || line : line);
}
