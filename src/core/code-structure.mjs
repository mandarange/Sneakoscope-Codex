import path from 'node:path';
import fsp from 'node:fs/promises';
import { nowIso, writeJsonAtomic } from './fsx.mjs';

export const CODE_STRUCTURE_THRESHOLDS = {
  warning: 1000,
  review: 2000,
  split_required_review: 3000
};

const DEFAULT_INCLUDE = new Set(['.mjs', '.js', '.ts', '.tsx', '.jsx', '.cjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sneakoscope', 'dist', 'build', 'coverage']);

export async function scanCodeStructure(root, opts = {}) {
  const files = opts.files?.length ? opts.files.map((file) => path.resolve(root, file)) : await listSourceFiles(root);
  const touched = new Set((opts.touchedFiles || []).map((file) => path.relative(root, path.resolve(root, file))));
  const entries = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    const lineCount = await countLines(file).catch(() => 0);
    const status = structureStatus(lineCount);
    if (status === 'ok' && !opts.includeOk) continue;
    entries.push({
      path: rel,
      line_count: lineCount,
      status,
      generated_or_vendor: isGeneratedOrVendor(rel),
      touched_by_mission: touched.size ? touched.has(rel) : false,
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
        : null
    });
  }
  return {
    schema_version: 1,
    mission_id: opts.missionId || null,
    scanned_at: nowIso(),
    thresholds: CODE_STRUCTURE_THRESHOLDS,
    files: entries.sort((a, b) => b.line_count - a.line_count),
    actions_taken: opts.actions_taken || [],
    remaining_risks: entries.filter((entry) => entry.exception).map((entry) => `${entry.path}: ${entry.status}`)
  };
}

export async function writeCodeStructureReport(root, dir, opts = {}) {
  const report = await scanCodeStructure(root, opts);
  await writeJsonAtomic(path.join(dir, 'code-structure-report.json'), report);
  return report;
}

async function listSourceFiles(root, dir = root, out = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !['.agents'].includes(entry.name)) {
      if (SKIP_DIRS.has(entry.name)) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await listSourceFiles(root, full, out);
      continue;
    }
    if (DEFAULT_INCLUDE.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

async function countLines(file) {
  const text = await fsp.readFile(file, 'utf8');
  return text ? text.split(/\n/).length : 0;
}

function structureStatus(lines) {
  if (lines >= CODE_STRUCTURE_THRESHOLDS.split_required_review) return 'over_3000_split_required_review';
  if (lines >= CODE_STRUCTURE_THRESHOLDS.review) return 'over_2000_refactor_review';
  if (lines >= CODE_STRUCTURE_THRESHOLDS.warning) return 'over_1000_warning';
  return 'ok';
}

function isGeneratedOrVendor(rel) {
  return /(^|\/)(node_modules|dist|build|coverage)\//.test(rel) || /package-lock\.json$/.test(rel);
}

function recommendedAction(rel, lines) {
  if (lines < CODE_STRUCTURE_THRESHOLDS.warning) return 'none';
  if (/src\/cli\/main\.mjs$/.test(rel)) return 'extract CLI subcommand handlers into focused modules before adding substantial command logic';
  if (/routes|pipeline|init/.test(rel)) return 'extract policy tables or route-specific execution into focused modules';
  return 'identify a cohesive module boundary and extract before adding unrelated logic';
}

function nextSplitCandidate(rel) {
  if (/src\/cli\/main\.mjs$/.test(rel)) return 'goal/wiki/team/eval/db command handlers';
  if (/src\/core\/pipeline\.mjs$/.test(rel)) return 'route prepare handlers and stop-gate evaluators';
  return 'largest cohesive command or policy section';
}
