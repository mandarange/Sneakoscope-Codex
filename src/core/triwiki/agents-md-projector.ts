import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, nowIso, readJson, readText, writeTextAtomic } from '../fsx.js';

export interface ProjectorReport {
  ok: boolean;
  reason: string | null;
  written: string[];
  hot_dirs?: Array<{ path: string; score: number; files: string[] }>;
}

const BEGIN = '<!-- BEGIN SKS PROJECT MEMORY (auto) -->';
const END = '<!-- END SKS PROJECT MEMORY -->';

export async function projectTriwikiToAgentsMd(root: string, opts: { maxLocalFiles?: number } = {}): Promise<ProjectorReport> {
  const pack = await readJson<any>(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null);
  if (!pack) return { ok: false, reason: 'no_context_pack', written: [] };
  const written: string[] = [];
  const rootContent = buildRootSections(pack);
  written.push(await upsertManagedBlock(path.join(root, 'AGENTS.md'), rootContent));
  const hotDirs = await scoreComplexDirs(root, pack, opts.maxLocalFiles ?? 8);
  for (const dir of hotDirs) {
    written.push(await upsertManagedBlock(path.join(root, dir.path, 'AGENTS.md'), buildLocalSection(pack, dir)));
  }
  return { ok: true, reason: null, written, hot_dirs: hotDirs };
}

export async function removeTriwikiAgentsMdBlocks(root: string): Promise<string[]> {
  const files = await collectAgentsMdFiles(root);
  const changed: string[] = [];
  for (const file of files) {
    const prev = await readText(file, '');
    const next = removeManagedBlock(String(prev || '')).trim();
    if (next !== String(prev || '').trim()) {
      await writeTextAtomic(file, next ? `${next}\n` : '');
      changed.push(file);
    }
  }
  return changed;
}

async function upsertManagedBlock(file: string, content: string): Promise<string> {
  const prev = await readText(file, '');
  const block = `${BEGIN}\n${content.trim()}\n${END}`;
  const next = String(prev || '').includes(BEGIN)
    ? String(prev || '').replace(new RegExp(`${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`), block)
    : `${String(prev || '').trim()}\n\n${block}\n`;
  if (next !== prev) {
    await ensureDir(path.dirname(file));
    await writeTextAtomic(file, next.trimStart());
  }
  return file;
}

function removeManagedBlock(text: string): string {
  return text.replace(new RegExp(`\\n?${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`, 'g'), '\n').replace(/\n{3,}/g, '\n\n');
}

function buildRootSections(pack: any): string {
  const claims = compactClaims(pack).slice(0, 8);
  const modules = compactModules(pack).slice(0, 8);
  const wrongness = compactWrongness(pack).slice(0, 5);
  return [
    `# SKS Project Memory`,
    ``,
    `Generated: ${nowIso()}`,
    `Source: .sneakoscope/wiki/context-pack.json`,
    ``,
    `## Architecture Summary`,
    claims.length ? claims.map((claim) => `- ${claim}`).join('\n') : '- No high-trust TriWiki claims available yet.',
    ``,
    `## Core Modules`,
    modules.length ? modules.map((item) => `- ${item}`).join('\n') : '- No module map entries available yet.',
    ``,
    `## Recent Lessons`,
    wrongness.length ? wrongness.map((item) => `- ${item}`).join('\n') : '- No wrongness-ledger lessons available yet.'
  ].join('\n');
}

function buildLocalSection(pack: any, dir: { path: string; files: string[] }): string {
  const claims = compactClaims(pack)
    .filter((claim) => claim.includes(dir.path))
    .slice(0, 6);
  return [
    `# SKS Local Project Memory: ${dir.path}`,
    ``,
    `Generated: ${nowIso()}`,
    ``,
    `## Local Anchors`,
    dir.files.slice(0, 8).map((file) => `- ${file}`).join('\n') || '- No file anchors available.',
    ``,
    `## TriWiki Notes`,
    claims.length ? claims.map((claim) => `- ${claim}`).join('\n') : '- Use root AGENTS.md SKS Project Memory plus nearby source files as authority.'
  ].join('\n');
}

async function scoreComplexDirs(root: string, pack: any, maxLocalFiles: number) {
  const sourcePaths = extractSourcePaths(pack).filter((file) => !file.includes('node_modules') && !file.startsWith('.git/'));
  const scores = new Map<string, { path: string; score: number; files: Set<string> }>();
  for (const file of sourcePaths) {
    const dir = firstInterestingDir(file);
    if (!dir) continue;
    const row = scores.get(dir) || { path: dir, score: 0, files: new Set<string>() };
    row.score += 2;
    row.files.add(file);
    scores.set(dir, row);
  }
  for (const dir of ['src/core', 'src/commands', 'src/scripts', 'src/cli']) {
    const count = await countFiles(path.join(root, dir)).catch(() => 0);
    if (!count) continue;
    const row = scores.get(dir) || { path: dir, score: 0, files: new Set<string>() };
    row.score += count;
    scores.set(dir, row);
  }
  return [...scores.values()]
    .filter((row) => row.path.split('/').length <= 3)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, maxLocalFiles))
    .map((row) => ({ path: row.path, score: row.score, files: [...row.files].slice(0, 12) }));
}

function compactClaims(pack: any): string[] {
  const rows = flattenRecords(pack).filter((row) => typeof row.claim === 'string' || typeof row.text === 'string' || typeof row.summary === 'string');
  return rows
    .map((row) => sanitizeLine(row.claim || row.text || row.summary))
    .filter(Boolean)
    .slice(0, 40);
}

function compactModules(pack: any): string[] {
  const rows = flattenRecords(pack).filter((row) => row.path || row.source_path || row.file);
  return rows
    .map((row) => sanitizeLine(`${row.path || row.source_path || row.file}${row.summary ? ` - ${row.summary}` : ''}`))
    .filter(Boolean)
    .slice(0, 40);
}

function compactWrongness(pack: any): string[] {
  const rows = flattenRecords(pack).filter((row) => /wrong|lesson|mistake|stale|failure/i.test(String(row.kind || row.type || row.id || '')));
  return rows.map((row) => sanitizeLine(row.lesson || row.summary || row.text || row.claim || row.id)).filter(Boolean).slice(0, 20);
}

function extractSourcePaths(pack: any): string[] {
  return [...new Set(flattenRecords(pack).flatMap((row) => [row.path, row.source_path, row.file, row.rel, row.relative_path]).map((value) => String(value || '').replace(/^\.\//, '')).filter((value) => value.includes('/')))];
}

function flattenRecords(value: any, depth = 0): any[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenRecords(item, depth + 1));
  if (typeof value !== 'object') return [];
  const own = value as Record<string, any>;
  return [own, ...Object.values(own).flatMap((child) => flattenRecords(child, depth + 1))];
}

function firstInterestingDir(file: string): string | null {
  const parts = file.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] === 'src' && parts.length >= 3) return `${parts[0]}/${parts[1]}`;
  return parts[0] || null;
}

async function countFiles(dir: string): Promise<number> {
  const rows = await fsp.readdir(dir, { withFileTypes: true });
  let total = 0;
  for (const row of rows) {
    if (row.name === 'node_modules' || row.name === '.git' || row.name === 'dist') continue;
    const file = path.join(dir, row.name);
    total += row.isDirectory() ? await countFiles(file) : row.isFile() ? 1 : 0;
  }
  return total;
}

async function collectAgentsMdFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    const rows = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const row of rows) {
      if (['.git', 'node_modules', 'dist'].includes(row.name)) continue;
      const file = path.join(dir, row.name);
      if (row.isFile() && row.name === 'AGENTS.md') files.push(file);
      else if (row.isDirectory()) await walk(file, depth + 1);
    }
  }
  await walk(root, 0);
  return files;
}

function sanitizeLine(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
