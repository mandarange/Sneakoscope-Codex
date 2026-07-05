import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { collectInputFiles } from './triwiki-cache-key.js';

export const CODE_INDEX_SCHEMA = 'sks.code-index.v1';

export interface CodeIndexModuleCard {
  module_id: string;
  paths: string[];
  entry_points: string[];
  exports_summary: string[];
  dependency_edges: string[];
  file_count: number;
  loc: number;
  risk: 'low' | 'medium' | 'high';
}

export interface CodeIndex {
  schema: 'sks.code-index.v1';
  generated_at: string;
  root: string;
  modules: CodeIndexModuleCard[];
  truncated: boolean;
  scanned_file_count: number;
  scanned_files_cap: number;
}

const DEFAULT_MAX_LINES_PER_FILE = 120;
const DEFAULT_MAX_FILES = 4000;
const CODE_EXT_RE = /\.(js|ts|tsx|jsx|cjs|mjs)$/;
const ENTRY_FILE_RE = /^(index|mod)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const EXPORT_LINE_RE = /^\s*export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum|abstract\s+class|async\s+function)\s+[A-Za-z0-9_$]+/;
const EXPORT_BRACE_RE = /^\s*export\s*\{/;
const EXPORT_STAR_RE = /^\s*export\s*\*/;
const IMPORT_SPEC_RE = /(?:from\s+|require\()\s*['"](\.\.?\/[^'"]+)['"]/g;

// High fan-in or a large file surface both correlate with change blast-radius; simple counts avoid needing a real dependency graph.
const RISK_HIGH_FAN_IN = 5;
const RISK_HIGH_FILE_COUNT = 40;
const RISK_MEDIUM_FAN_IN = 2;
const RISK_MEDIUM_FILE_COUNT = 15;

export async function scanCodebaseIndex(root: string, opts: { maxLinesPerFile?: number; maxFiles?: number } = {}): Promise<CodeIndex> {
  const resolvedRoot = path.resolve(root);
  const maxLinesPerFile = opts.maxLinesPerFile ?? DEFAULT_MAX_LINES_PER_FILE;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const inventory = listSourceFiles(resolvedRoot);
  const truncatedByCap = inventory.length > maxFiles;
  const scannedFiles = truncatedByCap ? inventory.slice(0, maxFiles) : inventory;
  const boundaries = inferModuleBoundaries(resolvedRoot);
  const fileRecords = readFileRecords(resolvedRoot, scannedFiles, maxLinesPerFile);
  const modulesByPath = assignFilesToModules(boundaries, fileRecords);
  const moduleIdForFile = buildFileToModuleIdIndex(modulesByPath);
  const cards = buildModuleCards(resolvedRoot, modulesByPath, moduleIdForFile);
  return {
    schema: CODE_INDEX_SCHEMA,
    generated_at: new Date().toISOString(),
    root: resolvedRoot,
    modules: cards,
    truncated: truncatedByCap,
    scanned_file_count: scannedFiles.length,
    scanned_files_cap: maxFiles
  };
}

interface FileRecord {
  rel: string;
  loc: number;
  exportLines: string[];
  importSpecifiers: string[];
}

interface ModuleBoundary {
  module_id: string;
  dir: string;
}

function listSourceFiles(root: string): string[] {
  const gitFiles = tryGitLsFiles(root);
  const all = gitFiles !== null ? gitFiles : walkFallback(root);
  return all.filter((rel) => CODE_EXT_RE.test(rel)).sort();
}

function tryGitLsFiles(root: string): string[] | null {
  try {
    const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0 || result.error) return null;
    return String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function walkFallback(root: string): string[] {
  const collected = collectInputFiles(root, ['.']);
  return collected.records.map((record) => record.path);
}

function inferModuleBoundaries(root: string): ModuleBoundary[] {
  const boundaries: ModuleBoundary[] = [];
  const seen = new Set<string>();
  const addBoundary = (dir: string) => {
    const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    boundaries.push({ module_id: moduleIdFromDir(normalized), dir: normalized });
  };
  for (const sourceRoot of listDirs(root, '.').filter((name) => name === 'src' || name === 'source' || name === 'lib')) {
    for (const topLevel of listDirs(root, sourceRoot)) {
      addBoundary(topLevel);
      for (const nested of listDirs(root, topLevel)) addBoundary(nested);
    }
  }
  const workspaces = readWorkspaceGlobs(root);
  for (const glob of workspaces) {
    for (const dir of resolveWorkspaceGlob(root, glob)) addBoundary(dir);
  }
  return boundaries.sort((a, b) => a.dir.localeCompare(b.dir));
}

function listDirs(root: string, rel: string): string[] {
  const absolute = rel === '.' ? root : path.join(root, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true });
  } catch (error) {
    if (isMissingOrInaccessible(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory() && !isExcludedDirName(entry.name))
    .map((entry) => (rel === '.' ? entry.name : `${rel}/${entry.name}`))
    .sort();
}

function isExcludedDirName(name: string): boolean {
  return name === '.git' || name === 'node_modules' || name === 'dist' || name === 'build' || name === 'coverage' || name === '__tests__' || name.startsWith('.');
}

function isMissingOrInaccessible(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR' || code === 'EPERM' || code === 'EISDIR';
}

function readWorkspaceGlobs(root: string): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { workspaces?: string[] | { packages?: string[] } };
    if (!pkg.workspaces) return [];
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    return pkg.workspaces.packages || [];
  } catch {
    return [];
  }
}

function resolveWorkspaceGlob(root: string, glob: string): string[] {
  const normalized = glob.replace(/\\/g, '/');
  if (!normalized.includes('*')) {
    return fs.existsSync(path.join(root, normalized)) ? [normalized.replace(/\/+$/, '')] : [];
  }
  const starIndex = normalized.indexOf('*');
  const prefix = normalized.slice(0, starIndex).replace(/\/+$/, '');
  return listDirs(root, prefix || '.');
}

function moduleIdFromDir(dir: string): string {
  return dir.replace(/^src\//, '').replace(/\//g, '-') || 'root';
}

function readFileRecords(root: string, files: string[], maxLinesPerFile: number): FileRecord[] {
  const out: FileRecord[] = [];
  for (const rel of files) {
    const absolute = path.join(root, rel);
    let text = '';
    try {
      text = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      if (isMissingOrInaccessible(error)) continue;
      throw error;
    }
    const lines = text.split(/\r?\n/);
    const loc = lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    const scanLines = lines.slice(0, maxLinesPerFile);
    const exportLines: string[] = [];
    for (const line of scanLines) {
      if (EXPORT_LINE_RE.test(line) || EXPORT_BRACE_RE.test(line) || EXPORT_STAR_RE.test(line)) {
        exportLines.push(line.trim());
      }
    }
    const importSpecifiers: string[] = [];
    for (const line of scanLines) {
      IMPORT_SPEC_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = IMPORT_SPEC_RE.exec(line))) {
        if (match[1]) importSpecifiers.push(match[1]);
      }
    }
    out.push({ rel, loc, exportLines, importSpecifiers });
  }
  return out;
}

function assignFilesToModules(boundaries: ModuleBoundary[], files: FileRecord[]): Map<string, { boundary: ModuleBoundary; files: FileRecord[] }> {
  const sortedBoundaries = [...boundaries].sort((a, b) => b.dir.length - a.dir.length);
  const map = new Map<string, { boundary: ModuleBoundary; files: FileRecord[] }>();
  for (const boundary of boundaries) map.set(boundary.module_id, { boundary, files: [] });
  for (const file of files) {
    const owner = sortedBoundaries.find((boundary) => file.rel === boundary.dir || file.rel.startsWith(`${boundary.dir}/`));
    if (!owner) continue;
    map.get(owner.module_id)!.files.push(file);
  }
  for (const [moduleId, entry] of map) {
    if (!entry.files.length) map.delete(moduleId);
  }
  return map;
}

function buildFileToModuleIdIndex(modulesByPath: Map<string, { boundary: ModuleBoundary; files: FileRecord[] }>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [moduleId, entry] of modulesByPath) {
    for (const file of entry.files) index.set(file.rel, moduleId);
  }
  return index;
}

function buildModuleCards(root: string, modulesByPath: Map<string, { boundary: ModuleBoundary; files: FileRecord[] }>, moduleIdForFile: Map<string, string>): CodeIndexModuleCard[] {
  const fanIn = new Map<string, number>();
  const dependencyEdgesByModule = new Map<string, Set<string>>();
  for (const [moduleId, entry] of modulesByPath) {
    const edges = new Set<string>();
    for (const file of entry.files) {
      for (const specifier of file.importSpecifiers) {
        const resolvedRel = resolveRelativeImport(root, file.rel, specifier);
        if (!resolvedRel) continue;
        const targetModuleId = moduleIdForFile.get(resolvedRel);
        if (!targetModuleId || targetModuleId === moduleId) continue;
        edges.add(targetModuleId);
      }
    }
    dependencyEdgesByModule.set(moduleId, edges);
    for (const target of edges) fanIn.set(target, (fanIn.get(target) || 0) + 1);
  }
  const cards: CodeIndexModuleCard[] = [];
  for (const [moduleId, entry] of modulesByPath) {
    const files = entry.files;
    const loc = files.reduce((sum, file) => sum + file.loc, 0);
    const exportsSummary = files.flatMap((file) => file.exportLines);
    const dependencyEdges = [...(dependencyEdgesByModule.get(moduleId) || [])].sort();
    const entryPoints = collectEntryPoints(root, entry.boundary.dir, files);
    const fanInCount = fanIn.get(moduleId) || 0;
    const risk = computeRisk(fanInCount, files.length);
    cards.push({
      module_id: moduleId,
      paths: [entry.boundary.dir],
      entry_points: entryPoints,
      exports_summary: exportsSummary,
      dependency_edges: dependencyEdges,
      file_count: files.length,
      loc,
      risk
    });
  }
  return cards.sort((a, b) => a.module_id.localeCompare(b.module_id));
}

function computeRisk(fanIn: number, fileCount: number): 'low' | 'medium' | 'high' {
  if (fanIn >= RISK_HIGH_FAN_IN || fileCount >= RISK_HIGH_FILE_COUNT) return 'high';
  if (fanIn >= RISK_MEDIUM_FAN_IN || fileCount >= RISK_MEDIUM_FILE_COUNT) return 'medium';
  return 'low';
}

function collectEntryPoints(root: string, dir: string, files: FileRecord[]): string[] {
  const entryPoints = new Set<string>();
  const pkgPath = path.join(root, dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { main?: string; bin?: string | Record<string, string>; exports?: unknown };
      if (typeof pkg.main === 'string') entryPoints.add(normalizeEntryPath(dir, pkg.main));
      if (typeof pkg.bin === 'string') entryPoints.add(normalizeEntryPath(dir, pkg.bin));
      else if (pkg.bin && typeof pkg.bin === 'object') {
        for (const value of Object.values(pkg.bin)) if (typeof value === 'string') entryPoints.add(normalizeEntryPath(dir, value));
      }
      for (const value of collectExportsPaths(pkg.exports)) entryPoints.add(normalizeEntryPath(dir, value));
    } catch {
      // malformed package.json at a module boundary is not this scanner's concern; skip entry-point inference for it
    }
  }
  for (const file of files) {
    const base = path.basename(file.rel);
    if (ENTRY_FILE_RE.test(base)) entryPoints.add(file.rel);
  }
  return [...entryPoints].sort();
}

function collectExportsPaths(exportsField: unknown): string[] {
  if (typeof exportsField === 'string') return [exportsField];
  if (!exportsField || typeof exportsField !== 'object') return [];
  const out: string[] = [];
  for (const value of Object.values(exportsField as Record<string, unknown>)) {
    if (typeof value === 'string') out.push(value);
    else out.push(...collectExportsPaths(value));
  }
  return out;
}

function normalizeEntryPath(dir: string, entry: string): string {
  const cleaned = entry.replace(/^\.\//, '');
  return `${dir}/${cleaned}`.replace(/\\/g, '/');
}

function resolveRelativeImport(root: string, fromRel: string, specifier: string): string | null {
  const fromDir = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(fromDir, specifier));
  const candidates = [
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.js`,
    `${joined}.jsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
    `${joined}/index.js`,
    `${joined}/index.jsx`,
    joined
  ];
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate);
    if (!fs.existsSync(absolute)) continue;
    // only resolve to a real file — a bare directory match (no extension) can't be looked up in the file->module index
    if (fs.statSync(absolute).isFile()) return candidate;
  }
  return null;
}
