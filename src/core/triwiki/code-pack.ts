import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureDir, exists, nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import type { CodeIndex, CodeIndexModuleCard } from './code-index-scanner.js';

export const CODE_PACK_SCHEMA = 'sks.code-pack.v1';
export const DEFAULT_CODE_PACK_TOKEN_BUDGET = 8000;

export interface CodePackCitation {
  path: string;
  line?: number;
}

export interface CodePackEntry {
  id: string;
  text: string;
  citations: CodePackCitation[];
  trust_score: number;
  freshness: 'fresh' | 'stale' | 'unknown';
  token_cost: number;
}

export interface CodePack {
  schema: typeof CODE_PACK_SCHEMA;
  generated_at: string;
  git_head_sha: string | null;
  source_file_count: number;
  index_digest: string;
  entries: CodePackEntry[];
  token_budget: number;
  total_token_cost: number;
}

export function codePackDir(root: string): string {
  return path.join(root, '.sneakoscope', 'wiki');
}

export function codePackPath(root: string): string {
  return path.join(codePackDir(root), 'code-pack.json');
}

export function codePackPrevPath(root: string): string {
  return path.join(codePackDir(root), 'code-pack.prev.json');
}

export function buildCodePack(root: string, index: CodeIndex, tokenBudget: number = DEFAULT_CODE_PACK_TOKEN_BUDGET): CodePack {
  const entries: CodePackEntry[] = [];
  for (const card of index.modules) {
    const entry = buildEntryForModule(card);
    if (!entry) continue;
    entries.push(entry);
  }
  const totalTokenCost = entries.reduce((sum, entry) => sum + entry.token_cost, 0);
  return {
    schema: CODE_PACK_SCHEMA,
    generated_at: nowIso(),
    git_head_sha: readGitHeadSha(root),
    source_file_count: index.scanned_file_count,
    index_digest: computeIndexDigest(index),
    entries,
    token_budget: tokenBudget,
    total_token_cost: totalTokenCost
  };
}

function buildEntryForModule(card: CodeIndexModuleCard): CodePackEntry | null {
  const citations = collectCitations(card);
  // openwiki principle: an entry with no real repository citation is worse than no entry at all
  if (!citations.length) return null;
  const text = summarizeModule(card);
  return {
    id: `code:${card.module_id}`,
    text,
    citations,
    trust_score: computeTrustScore(card),
    freshness: 'unknown',
    token_cost: Math.ceil(text.length / 4)
  };
}

function collectCitations(card: CodeIndexModuleCard): CodePackCitation[] {
  const paths = [...card.paths, ...card.entry_points].filter(Boolean);
  const seen = new Set<string>();
  const citations: CodePackCitation[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    citations.push({ path: p });
  }
  return citations;
}

function summarizeModule(card: CodeIndexModuleCard): string {
  const role = inferRole(card);
  const primaryPath = card.paths[0] || card.module_id;
  const exportsPart = summarizeExports(card.exports_summary);
  const depsPart = summarizeDependencies(card.dependency_edges);
  const sizePart = `${card.file_count} file${card.file_count === 1 ? '' : 's'}, ${card.loc} loc, ${card.risk} risk`;
  return `${card.module_id} is ${role} at ${primaryPath} (${sizePart}). ${exportsPart} ${depsPart}`.trim().replace(/\s+/g, ' ');
}

function inferRole(card: CodeIndexModuleCard): string {
  const idLower = card.module_id.toLowerCase();
  const pathLower = card.paths.join(' ').toLowerCase();
  if (idLower.includes('test') || pathLower.includes('__tests__')) return 'a test module';
  if (idLower.includes('cli') || pathLower.includes('cli')) return 'a CLI module';
  if (idLower.includes('command')) return 'a command module';
  if (idLower.includes('core')) return 'a core module';
  return 'a module';
}

function summarizeExports(exportsSummary: string[]): string {
  if (!exportsSummary.length) return 'It has no detected top-level exports.';
  const preview = exportsSummary.slice(0, 5).map((line) => line.replace(/^export\s+/, '').replace(/\s*\{\s*$/, '').trim());
  const suffix = exportsSummary.length > preview.length ? `, and ${exportsSummary.length - preview.length} more` : '';
  return `Key exports: ${preview.join('; ')}${suffix}.`;
}

function summarizeDependencies(dependencyEdges: string[]): string {
  if (!dependencyEdges.length) return 'It has no detected cross-module dependencies.';
  const preview = dependencyEdges.slice(0, 5);
  const suffix = dependencyEdges.length > preview.length ? `, and ${dependencyEdges.length - preview.length} more` : '';
  return `Depends on: ${preview.join(', ')}${suffix}.`;
}

function computeTrustScore(card: CodeIndexModuleCard): number {
  // more citable surface (entry points, real exports) correlates with a more reliably summarizable module
  let score = 0.5;
  if (card.entry_points.length > 0) score += 0.2;
  if (card.exports_summary.length > 0) score += 0.2;
  if (card.risk === 'high') score -= 0.15;
  else if (card.risk === 'low') score += 0.1;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function readGitHeadSha(root: string): string | null {
  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0 || result.error) return null;
    const sha = String(result.stdout || '').trim();
    return sha || null;
  } catch {
    return null;
  }
}

function computeIndexDigest(index: CodeIndex): string {
  const stable = index.modules
    .map((card) => ({ module_id: card.module_id, paths: [...card.paths].sort() }))
    .sort((a, b) => a.module_id.localeCompare(b.module_id));
  return sha256(JSON.stringify(stable));
}

export async function validateCodePack(pack: CodePack, root: string): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  for (const entry of pack.entries) {
    if (seenIds.has(entry.id)) {
      issues.push(`duplicate entry id: ${entry.id}`);
    } else {
      seenIds.add(entry.id);
    }
    if (!entry.citations.length) {
      issues.push(`entry ${entry.id} has no citations`);
      continue;
    }
    for (const citation of entry.citations) {
      const absolute = path.join(root, citation.path);
      if (!fs.existsSync(absolute)) {
        issues.push(`entry ${entry.id} citation path does not exist: ${citation.path}`);
      }
    }
  }
  const totalTokenCost = pack.entries.reduce((sum, entry) => sum + entry.token_cost, 0);
  if (totalTokenCost > pack.token_budget) {
    issues.push(`total_token_cost ${totalTokenCost} exceeds token_budget ${pack.token_budget}`);
  }
  return { ok: issues.length === 0, issues };
}

export async function writeCodePackAtomic(root: string, pack: CodePack): Promise<{ ok: boolean; path: string; prev_path: string | null }> {
  const targetPath = codePackPath(root);
  const prevPath = codePackPrevPath(root);
  await ensureDir(codePackDir(root));
  let prevWritten: string | null = null;
  if (await exists(targetPath)) {
    const previous = await readJson<CodePack>(targetPath);
    await writeJsonAtomic(prevPath, previous);
    prevWritten = prevPath;
  }
  await writeJsonAtomic(targetPath, pack);
  return { ok: true, path: targetPath, prev_path: prevWritten };
}
