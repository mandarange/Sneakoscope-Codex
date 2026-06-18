import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TRIWIKI_MODULE_CARDS, moduleIdsForPath, type TriWikiModuleCard } from './triwiki-module-card.js';
import { buildTriWikiGateImpactMap } from './triwiki-gate-impact-map.js';

export const TRIWIKI_AFFECTED_GRAPH_SCHEMA = 'sks.triwiki-affected-graph.v1';

export interface TriWikiAffectedGraphInput {
  root: string;
  changedFiles?: string[];
  tier?: 'instant' | 'affected' | 'confidence' | 'release';
  cards?: TriWikiModuleCard[];
  changedSince?: string | null;
  baseRef?: string | null;
  headRef?: string | null;
  full?: boolean;
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
  reused_proofs: string[];
  invalidated_proofs: string[];
  required_new_proofs: string[];
}

export function computeTriWikiAffectedGraph(input: TriWikiAffectedGraphInput): TriWikiAffectedGraph {
  const cards = input.cards || DEFAULT_TRIWIKI_MODULE_CARDS;
  const changedFiles = normalizeChangedFiles(resolveChangedFiles(input));
  const affectedModules = new Set<string>();
  let conservativeReason: string | null = null;
  if (input.full) {
    for (const card of cards) affectedModules.add(card.module_id);
    conservativeReason = 'full_release_requested';
  }
  for (const file of changedFiles) {
    const ids = moduleIdsForPath(file, cards);
    for (const id of ids) affectedModules.add(id);
    if (!input.full && ids.includes('unknown')) conservativeReason = 'unknown_changed_file';
  }
  if (!input.full && !changedFiles.length) affectedModules.add('release');
  if (changedFiles.some((file) => file === 'package.json' || file === 'package-lock.json' || file === 'release-gates.v2.json')) {
    conservativeReason = conservativeReason || 'root_release_surface_changed';
    for (const card of cards) affectedModules.add(card.module_id);
  }
  const impactMap = buildTriWikiGateImpactMap(input.root, cards);
  const selected = impactMap.impacts.filter((impact) => input.full || impact.modules.some((moduleId) => affectedModules.has(moduleId)) || conservativeReason === 'root_release_surface_changed');
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
    conservative_reason: conservativeReason,
    reused_proofs: [],
    invalidated_proofs: selected.map((impact) => impact.gate_id).sort(),
    required_new_proofs: selected.map((impact) => impact.gate_id).sort()
  };
}

function resolveChangedFiles(input: TriWikiAffectedGraphInput): string[] {
  if (input.full) return ['*full-release*'];
  if (input.changedFiles && input.changedFiles.length) return input.changedFiles;
  if (input.baseRef && input.headRef) {
    const diff = gitDiffNameStatus(input.root, input.baseRef, input.headRef);
    if (diff.length) return diff;
  }
  if (input.changedSince && input.changedSince !== 'auto') {
    const diff = gitDiffNameStatus(input.root, input.changedSince, 'HEAD');
    if (diff.length) return diff;
  }
  const status = gitChangedFiles(input.root);
  return status.length ? status : [];
}

function normalizeChangedFiles(files: string[]): string[] {
  return [...new Set(files.map((file) => file.trim().replace(/\\/g, '/')).filter(Boolean))].sort();
}

function gitChangedFiles(root: string): string[] {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split('\n')
    .flatMap((line) => parseGitStatusPathLine(line.slice(3).trim()))
    .filter(Boolean)
    .filter((file) => file !== '*full-release*');
}

function gitDiffNameStatus(root: string, base: string, head: string): string[] {
  const result = spawnSync('git', ['diff', '--name-status', '--find-renames', base, head], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split('\n').flatMap((line) => {
    const parts = line.trim().split(/\t+/).filter(Boolean);
    if (!parts.length) return [];
    const status = parts[0] || '';
    if (status.startsWith('R') && parts.length >= 3) return [parts[1]!, parts[2]!];
    if (status === 'D' && parts[1]) return [previousPathOrConservative(root, parts[1])];
    return parts[1] ? [parts[1]] : [];
  }).filter(Boolean);
}

function parseGitStatusPathLine(line: string): string[] {
  if (!line) return [];
  if (line.includes(' -> ')) {
    const [oldPath, newPath] = line.split(' -> ');
    return [oldPath, newPath].filter((value): value is string => Boolean(value));
  }
  return [line];
}

function previousPathOrConservative(root: string, file: string): string {
  return fs.existsSync(path.join(root, file)) ? file : file;
}
