import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { nowIso, writeJsonAtomic } from './fsx.js';
import {
  LEAN_CHANGE_EVIDENCE_SCHEMA,
  type LeanFinding,
  type LeanSimplificationMarker,
  leanPolicyReference,
  parseLeanSimplificationMarkerLine
} from './lean-engineering-policy.js';

export const CODE_STRUCTURE_THRESHOLDS = {
  warning: 1000,
  review: 2000,
  split_required_review: 3000
};

const DEFAULT_INCLUDE = new Set(['.js', '.ts', '.tsx', '.jsx', '.cjs', '.mjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sneakoscope', 'dist', 'build', 'coverage']);
const SOURCE_DIR_RE = /^(src|test|tests|schemas|scripts|crates|docs)\//;
const SOURCE_EXT_RE = /\.(js|ts|tsx|jsx|cjs|mjs|json|md|rs|toml)$/;
const FALLBACK_RE = /\b(fallback|legacy|shim|compat|mock|catch-all|catch all|default provider)\b/i;
const CONFIG_FLAG_RE = /\b(process\.env|SKS_[A-Z0-9_]+|CODEX_[A-Z0-9_]+|[A-Z][A-Z0-9_]{5,})\b/;
const ABSTRACTION_RE = /\b(interface|abstract class|class|factory|provider|adapter|registry|orchestrator|manager)\b/;

export async function scanCodeStructure(root: any, opts: any = {}) {
  const changedScope = await collectChangedScope(root, opts);
  const files = await resolveScanFiles(root, opts, changedScope);
  const touched = new Set((opts.touchedFiles || []).map((file: any) => normalizeRel(root, file)));
  const changedSet = new Set((changedScope.source_files || []).map((file: string) => normalizeSlashes(file)));
  const entries: any[] = [];
  const intentionalSimplifications: LeanSimplificationMarker[] = [];

  for (const file of files) {
    const rel = normalizeRel(root, file);
    const text = await fsp.readFile(file, 'utf8').catch(() => '');
    const lineCount = text ? text.split(/\n/).length : 0;
    const status = structureStatus(lineCount);
    const changedByDiff = changedSet.has(rel);
    if (status === 'ok' && !opts.includeOk && !changedByDiff) continue;
    const signals = analyzeTextSignals(rel, text, changedByDiff);
    intentionalSimplifications.push(...signals.lean_markers);
    entries.push({
      path: rel,
      line_count: lineCount,
      status,
      generated_or_vendor: isGeneratedOrVendor(rel),
      touched_by_mission: touched.size ? touched.has(rel) : changedByDiff,
      recommended_action: recommendedAction(rel, lineCount),
      exception: lineCount >= CODE_STRUCTURE_THRESHOLDS.split_required_review && !isGeneratedOrVendor(rel)
        ? {
            file: rel,
            line_count: lineCount,
            why_not_split_now: opts.exception || 'No split was performed in this scan-only gate.',
            risk: lineCount >= 4000 ? 'high' : 'medium',
            next_split_candidate: nextSplitCandidate(rel),
            temporary_until: 'next substantial edit to this file'
          }
        : null,
      lean_signals: signals
    });
  }

  const dependencyDelta = await collectDependencyDelta(root, changedScope.base);
  const fallbackSites = await collectAddedFallbackSites(root, changedScope);
  const runnableChecks = collectRunnableChecks(changedScope);
  const semanticReview = buildSemanticReview({
    entries,
    changedScope,
    dependencyDelta,
    fallbackSites,
    intentionalSimplifications,
    runnableChecks
  });
  const leanChangeEvidence = buildLeanChangeEvidence({
    changedScope,
    dependencyDelta,
    fallbackSites,
    intentionalSimplifications,
    runnableChecks,
    semanticReview
  });

  return {
    schema_version: 1,
    mission_id: opts.missionId || null,
    scanned_at: nowIso(),
    thresholds: CODE_STRUCTURE_THRESHOLDS,
    files: entries.sort((a: any, b: any) => b.line_count - a.line_count),
    changed_scope: changedScope,
    dependencies_added: dependencyDelta.added,
    dependencies_removed: dependencyDelta.removed,
    fallback_sites_added: fallbackSites,
    intentional_simplifications: intentionalSimplifications,
    runnable_checks: runnableChecks,
    semantic_review: semanticReview,
    lean_change_evidence: leanChangeEvidence,
    actions_taken: opts.actions_taken || [],
    remaining_risks: entries.filter((entry: any) => entry.exception).map((entry: any) => `${entry.path}: ${entry.status}`)
  };
}

export async function writeCodeStructureReport(root: any, dir: any, opts: any = {}) {
  const report = await scanCodeStructure(root, opts);
  await writeJsonAtomic(path.join(dir, 'code-structure-report.json'), report);
  return report;
}

export function leanChangeEvidenceFromReport(report: any) {
  if (report?.lean_change_evidence) return report.lean_change_evidence;
  return buildLeanChangeEvidence({
    changedScope: report?.changed_scope || emptyChangedScope('unknown', 'HEAD'),
    dependencyDelta: {
      added: report?.dependencies_added || [],
      removed: report?.dependencies_removed || []
    },
    fallbackSites: report?.fallback_sites_added || [],
    intentionalSimplifications: report?.intentional_simplifications || [],
    runnableChecks: report?.runnable_checks || [],
    semanticReview: report?.semantic_review || { status: 'needs-review', findings: [] }
  });
}

async function resolveScanFiles(root: string, opts: any, changedScope: any) {
  if (opts.files?.length) return opts.files.map((file: any) => path.resolve(root, file));
  const changedSourceFiles = (changedScope.source_files || [])
    .filter((file: string) => DEFAULT_INCLUDE.has(path.extname(file)))
    .map((file: string) => path.resolve(root, file));
  if ((opts.changed || opts.changedSince || opts.changedFiles?.length) && changedSourceFiles.length) return changedSourceFiles;
  return listSourceFiles(root);
}

async function collectChangedScope(root: string, opts: any) {
  if (opts.changedFiles?.length) {
    const changedFiles: string[] = Array.from(new Set<string>(opts.changedFiles.map((file: string) => normalizeRel(root, file))));
    return {
      ...emptyChangedScope('explicit', opts.changedSince || 'HEAD'),
      changed_files: changedFiles,
      source_files: changedFiles.filter(isSourceLike),
      entries: changedFiles.map((file) => ({ path: file, status: 'M', lines_added: 0, lines_deleted: 0 }))
    };
  }

  const shouldCollect = opts.changed || opts.changedSince;
  if (!shouldCollect) return emptyChangedScope('full', opts.changedSince || 'HEAD');
  const base = String(opts.changedSince || (typeof opts.changed === 'string' ? opts.changed : 'HEAD'));
  const numstat = gitLines(root, ['diff', '--numstat', base, '--']);
  const nameStatus = gitLines(root, ['diff', '--name-status', base, '--']);
  const untracked = gitLines(root, ['ls-files', '--others', '--exclude-standard']);
  const entriesByPath = new Map<string, any>();

  for (const line of numstat) {
    const parts = line.split(/\t/);
    if (parts.length < 3) continue;
    const linesAdded = parseNumstat(parts[0] || '0');
    const linesDeleted = parseNumstat(parts[1] || '0');
    const rel = normalizeSlashes(parts.slice(2).join('\t'));
    entriesByPath.set(rel, {
      path: rel,
      status: 'M',
      lines_added: linesAdded,
      lines_deleted: linesDeleted
    });
  }

  for (const line of nameStatus) {
    const parts = line.split(/\t/).filter(Boolean);
    if (parts.length < 2) continue;
    const status = parts[0];
    const rel = normalizeSlashes(parts[parts.length - 1] || '');
    if (!rel) continue;
    const existing = entriesByPath.get(rel) || { path: rel, lines_added: 0, lines_deleted: 0 };
    entriesByPath.set(rel, { ...existing, status });
  }

  for (const rel of untracked.map(normalizeSlashes).filter(Boolean)) {
    if (entriesByPath.has(rel)) continue;
    const text = await fsp.readFile(path.join(root, rel), 'utf8').catch(() => '');
    entriesByPath.set(rel, {
      path: rel,
      status: 'A',
      lines_added: text ? text.split(/\n/).length : 0,
      lines_deleted: 0
    });
  }

  const entries = [...entriesByPath.values()].filter((entry) => entry.path);
  const changedFiles = entries.map((entry) => entry.path);
  const sourceFiles = changedFiles.filter(isSourceLike);
  const linesAdded = entries.reduce((sum, entry) => sum + Number(entry.lines_added || 0), 0);
  const linesDeleted = entries.reduce((sum, entry) => sum + Number(entry.lines_deleted || 0), 0);
  return {
    mode: 'git-diff',
    base,
    changed_files: changedFiles,
    files_added: entries.filter((entry) => String(entry.status || '').startsWith('A')).length,
    files_deleted: entries.filter((entry) => String(entry.status || '').startsWith('D')).length,
    lines_added: linesAdded,
    lines_deleted: linesDeleted,
    net_lines: linesAdded - linesDeleted,
    source_files: sourceFiles,
    entries
  };
}

async function listSourceFiles(root: any, dir: any = root, out: any = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    // Hidden runtime/worktree directories can contain complete repository copies.
    // Only .agents is a source-bearing project directory; all other hidden trees
    // are state, caches, or external workspaces and must stay outside this scan.
    if (entry.name.startsWith('.') && entry.name !== '.agents') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await listSourceFiles(root, full, out);
      continue;
    }
    if (DEFAULT_INCLUDE.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

async function collectDependencyDelta(root: string, base = 'HEAD') {
  const current = await readPackageDependencyNames(path.join(root, 'package.json'));
  const previousText = gitText(root, ['show', `${base}:package.json`]);
  const previous = parsePackageDependencyNames(previousText || '{}');
  return {
    added: [...current].filter((name) => !previous.has(name)).sort(),
    removed: [...previous].filter((name) => !current.has(name)).sort()
  };
}

async function readPackageDependencyNames(file: string) {
  const text = await fsp.readFile(file, 'utf8').catch(() => '{}');
  return parsePackageDependencyNames(text);
}

function parsePackageDependencyNames(text: string) {
  const value = safeJson(text);
  const names = new Set<string>();
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = value?.[section] && typeof value[section] === 'object' ? value[section] : {};
    for (const name of Object.keys(deps)) names.add(`${section}:${name}`);
  }
  return names;
}

async function collectAddedFallbackSites(root: string, changedScope: any) {
  if (!changedScope?.source_files?.length || changedScope.mode !== 'git-diff') return [];
  const diff = gitText(root, ['diff', '--unified=0', changedScope.base || 'HEAD', '--', ...changedScope.source_files]);
  const sites: any[] = [];
  let currentFile = '';
  let currentLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = normalizeSlashes(line.slice('+++ b/'.length));
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      currentLine = Number(hunk[1]) || 0;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (FALLBACK_RE.test(line)) sites.push({ file: currentFile, line: currentLine, text: line.slice(1).trim().slice(0, 160) });
      currentLine += 1;
      continue;
    }
    if (!line.startsWith('-')) currentLine += 1;
  }
  return sites;
}

function analyzeTextSignals(rel: string, text: string, changedByDiff: boolean) {
  const lines = text.split(/\r?\n/);
  const imports = lines.filter((line) => /^\s*import\s/.test(line));
  const externalImports = imports
    .map((line) => /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/.exec(line)?.[1] || /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/.exec(line)?.[2] || '')
    .filter((specifier) => specifier && !specifier.startsWith('.') && !specifier.startsWith('node:'));
  const leanMarkers = lines
    .map((line, index) => parseLeanSimplificationMarkerLine(line, rel, index + 1))
    .filter((marker): marker is LeanSimplificationMarker => Boolean(marker));
  const effectiveLines = lines.map((line) => line.trim()).filter(Boolean);
  const forwardingOnly = effectiveLines.length > 0
    && effectiveLines.length <= 10
    && effectiveLines.every((line) => line.startsWith('import ') || line.startsWith('export ') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*'));
  return {
    import_count: imports.length,
    external_dependency_imports: Array.from(new Set(externalImports)).sort(),
    ts_nocheck: /^\s*\/\/\s*@ts-nocheck\b/m.test(text),
    changed_by_diff: changedByDiff,
    forwarding_only: forwardingOnly,
    fallback_markers: countMatches(text, FALLBACK_RE),
    config_flag_markers: countMatches(text, CONFIG_FLAG_RE),
    abstraction_markers: countMatches(text, ABSTRACTION_RE),
    lean_markers: leanMarkers
  };
}

function collectRunnableChecks(changedScope: any) {
  return (changedScope.source_files || [])
    .filter((file: string) => /\b(test|tests|fixture|fixtures|spec|check|__tests__)\b/i.test(file))
    .sort();
}

function buildSemanticReview(input: any) {
  const findings: LeanFinding[] = [];
  for (const dep of input.dependencyDelta.added || []) {
    findings.push({
      tag: 'reuse',
      severity: 'blocker',
      summary: `new dependency requires explicit lean justification: ${dep}`
    });
  }
  if ((input.fallbackSites || []).length) {
    findings.push({
      tag: 'fallback',
      severity: 'review',
      summary: `${input.fallbackSites.length} added fallback/compat/mock marker(s) need authority and proof`
    });
  }
  const changedEntries = (input.entries || input.changedScope?.entries || []);
  if (input.changedScope?.net_lines > 300) {
    findings.push({
      tag: 'shrink',
      severity: 'review',
      summary: `changed diff is +${input.changedScope.net_lines} net lines; confirm this is the smallest sufficient change`
    });
  }
  if ((input.changedScope?.source_files || []).length && !(input.runnableChecks || []).length) {
    findings.push({
      tag: 'verify',
      severity: 'review',
      summary: 'changed source files were detected without a changed runnable check file'
    });
  }
  for (const entry of input.entries || []) {
    if (!entry.lean_signals?.changed_by_diff) continue;
    if (entry.lean_signals.ts_nocheck) {
      findings.push({
        tag: 'verify',
        severity: isLeanOwnedTypeSafetyPath(entry.path) ? 'blocker' : 'review',
        file: entry.path,
        summary: isLeanOwnedTypeSafetyPath(entry.path)
          ? 'changed Lean/architecture-owned file contains @ts-nocheck'
          : 'changed auxiliary fixture/gate file contains @ts-nocheck; keep typed migration scoped'
      });
    }
    if (entry.lean_signals.forwarding_only) {
      findings.push({
        tag: 'reuse',
        severity: 'review',
        file: entry.path,
        summary: 'changed file is forwarding-only; confirm it replaces an older path instead of duplicating an SSOT'
      });
    }
    if (entry.lean_signals.config_flag_markers > 6 || entry.lean_signals.abstraction_markers > 12) {
      findings.push({
        tag: 'yagni',
        severity: 'review',
        file: entry.path,
        summary: 'changed file has dense config/abstraction markers; review for unrequested knobs or layers'
      });
    }
  }
  for (const marker of input.intentionalSimplifications || []) {
    if (marker.status === 'complete') continue;
    findings.push({
      tag: 'shrink',
      severity: 'review',
      file: marker.file,
      line: marker.line,
      summary: `lean simplification marker is incomplete: ${marker.status}`
    });
  }
  const status = findings.some((finding) => finding.severity === 'blocker')
    ? 'blocked'
    : findings.some((finding) => finding.severity === 'review')
      ? 'needs-review'
      : 'pass';
  return { status, findings };
}

function isLeanOwnedTypeSafetyPath(file: string): boolean {
  return [
    'src/core/code-structure.ts',
    'src/core/commands/code-structure-command.ts',
    'src/core/lean-engineering-policy.ts',
    'src/core/codex-control/gpt-final-arbiter.ts',
    'src/core/codex-control/gpt-final-review-schema.ts',
    'src/core/codex-control/codex-fake-sdk-adapter.ts',
    'src/core/agents/native-worker-backend-router.ts',
    'src/scripts/check-architecture.ts',
    'src/scripts/check-command-module-budget.ts',
    'src/scripts/check-pipeline-budget.ts',
    'src/scripts/check-route-modularity.ts',
    'src/scripts/check-publish-tag.ts',
    'src/scripts/gpt-final-arbiter-check.ts',
    'src/scripts/release-registry-check.ts'
  ].includes(file);
}

function buildLeanChangeEvidence(input: any) {
  const changedScope = input.changedScope || emptyChangedScope('unknown', 'HEAD');
  return {
    schema: LEAN_CHANGE_EVIDENCE_SCHEMA,
    ...leanPolicyReference(),
    changed_files: changedScope.changed_files || [],
    files_added: changedScope.files_added || 0,
    files_deleted: changedScope.files_deleted || 0,
    lines_added: changedScope.lines_added || 0,
    lines_deleted: changedScope.lines_deleted || 0,
    net_lines: changedScope.net_lines || 0,
    dependencies_added: input.dependencyDelta?.added || [],
    dependencies_removed: input.dependencyDelta?.removed || [],
    fallback_sites_added: input.fallbackSites || [],
    intentional_simplifications: input.intentionalSimplifications || [],
    runnable_checks: input.runnableChecks || [],
    semantic_review: input.semanticReview || { status: 'needs-review', findings: [] }
  };
}

async function countLines(file: any) {
  const text = await fsp.readFile(file, 'utf8');
  return text ? text.split(/\n/).length : 0;
}

function structureStatus(lines: any) {
  if (lines >= CODE_STRUCTURE_THRESHOLDS.split_required_review) return 'over_3000_split_required_review';
  if (lines >= CODE_STRUCTURE_THRESHOLDS.review) return 'over_2000_refactor_review';
  if (lines >= CODE_STRUCTURE_THRESHOLDS.warning) return 'over_1000_warning';
  return 'ok';
}

function isGeneratedOrVendor(rel: any) {
  return /(^|\/)(node_modules|dist|build|coverage)\//.test(rel) || /package-lock\.json$/.test(rel);
}

function recommendedAction(rel: any, lines: any) {
  if (lines < CODE_STRUCTURE_THRESHOLDS.warning) return 'none';
  if (/src\/cli\/main\.(js|ts)$/.test(rel)) return 'extract CLI subcommand handlers into focused modules before adding substantial command logic';
  if (/routes|pipeline|init/.test(rel)) return 'extract policy tables or route-specific execution into focused modules';
  return 'identify a cohesive module boundary and extract before adding unrelated logic';
}

function nextSplitCandidate(rel: any) {
  if (/src\/cli\/main\.(js|ts)$/.test(rel)) return 'goal/wiki/team/eval/db command handlers';
  if (/src\/core\/pipeline\.(js|ts)$/.test(rel)) return 'route prepare handlers and stop-gate evaluators';
  return 'largest cohesive command or policy section';
}

function countMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}

function isSourceLike(file: string) {
  const rel = normalizeSlashes(file);
  return SOURCE_DIR_RE.test(rel) && SOURCE_EXT_RE.test(rel) && !isGeneratedOrVendor(rel);
}

function parseNumstat(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function gitLines(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).filter(Boolean);
}

function gitText(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return '';
  return String(result.stdout || '');
}

function emptyChangedScope(mode: string, base: string) {
  return {
    mode,
    base,
    changed_files: [],
    files_added: 0,
    files_deleted: 0,
    lines_added: 0,
    lines_deleted: 0,
    net_lines: 0,
    source_files: [],
    entries: []
  };
}

function normalizeRel(root: string, file: string) {
  return normalizeSlashes(path.relative(root, path.resolve(root, file)));
}

function normalizeSlashes(file: string) {
  return String(file || '').replace(/\\/g, '/');
}
