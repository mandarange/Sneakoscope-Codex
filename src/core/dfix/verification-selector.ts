import fsp from 'node:fs/promises';
import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';

export async function selectDfixVerification(root: string, dir: string, input: any = {}) {
  const selection = await buildDfixVerificationSelection(root, input);
  await writeJsonAtomic(path.join(dir, 'dfix-verification-selection.json'), selection);
  return selection;
}

export async function buildDfixVerificationSelection(root: string, input: any = {}) {
  const changedFiles = Array.from(new Set<string>((input.changedFiles || input.changed_files || []).map((file: any) => String(file))));
  const pkg = await readJson<any>(path.join(root, 'package.json'), null);
  const scripts: Record<string, unknown> = pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const hasTsconfig = await existsFile(path.join(root, 'tsconfig.json'));
  const hasCargo = await existsFile(path.join(root, 'crates', 'sks-core', 'Cargo.toml')) || await existsFile(path.join(root, 'Cargo.toml'));
  const hasPyproject = await existsFile(path.join(root, 'pyproject.toml'));
  const candidates: Array<{ command: string; reason: string; confidence: number; expected_duration_budget_ms: number }> = [];
  if (changedFiles.some((file) => /(?:^|\/)test\/.*\.(?:test|spec)\.(?:mjs|js|ts)$/.test(file)) && scripts['test:unit']) candidates.push({ command: 'npm run test:unit', reason: 'test_file_changed', confidence: 0.82, expected_duration_budget_ms: 15000 });
  if (changedFiles.some((file) => /^src\/core\/dfix/.test(file)) && scripts['dfix:fixture']) candidates.push({ command: 'npm run dfix:fixture', reason: 'dfix_source_changed', confidence: 0.9, expected_duration_budget_ms: 3000 });
  if (changedFiles.some((file) => /^src\/core\/dfix/.test(file)) && scripts['dfix:verification']) candidates.push({ command: 'npm run dfix:verification', reason: 'dfix_source_changed', confidence: 0.88, expected_duration_budget_ms: 3000 });
  if (changedFiles.some((file) => /\.(?:json|schema\.json)$/.test(file)) && scripts['schema:check']) candidates.push({ command: 'npm run schema:check', reason: 'schema_file_changed', confidence: 0.76, expected_duration_budget_ms: 10000 });
  if (changedFiles.some((file) => /^docs\/|\.md$/.test(file)) && scripts.packcheck) candidates.push({ command: 'npm run packcheck', reason: 'docs_or_script_light_check', confidence: 0.68, expected_duration_budget_ms: 5000 });
  if (hasTsconfig && scripts.typecheck) candidates.push({ command: 'npm run typecheck', reason: 'typescript_project', confidence: 0.72, expected_duration_budget_ms: 30000 });
  if (hasCargo && changedFiles.some((file) => /^crates\/|\.rs$/.test(file))) candidates.push({ command: 'cargo check --manifest-path crates/sks-core/Cargo.toml', reason: 'rust_changed', confidence: 0.82, expected_duration_budget_ms: 30000 });
  if (hasPyproject) candidates.push({ command: 'python -m pytest', reason: 'python_project', confidence: 0.62, expected_duration_budget_ms: 30000 });
  if (scripts['test:unit']) candidates.push({ command: 'npm run test:unit', reason: 'unit_fallback', confidence: 0.58, expected_duration_budget_ms: 30000 });
  if (scripts.test) candidates.push({ command: 'npm test', reason: 'full_fallback', confidence: 0.45, expected_duration_budget_ms: 120000 });
  const unique = dedupe(candidates);
  const best = unique[0] || { command: 'npm test', reason: 'default_fallback', confidence: 0.35, expected_duration_budget_ms: 120000 };
  return {
    schema: 'sks.dfix-verification-selection.v1',
    created_at: nowIso(),
    changed_files: changedFiles,
    package_scripts_detected: Object.keys(scripts),
    candidates: unique,
    fastest_sufficient_command: best.command,
    best_command: best.command,
    confidence: best.confidence,
    expected_duration_budget_ms: best.expected_duration_budget_ms,
    full_verification_fallback: scripts.test ? 'npm test' : null,
    artifact: 'dfix-verification-selection.json'
  };
}

function dedupe(candidates: Array<{ command: string; reason: string; confidence: number; expected_duration_budget_ms: number }>) {
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.confidence - a.confidence || a.expected_duration_budget_ms - b.expected_duration_budget_ms)
    .filter((candidate) => {
      if (seen.has(candidate.command)) return false;
      seen.add(candidate.command);
      return true;
    });
}

async function existsFile(file: string) {
  try {
    return (await fsp.stat(file)).isFile();
  } catch {
    return false;
  }
}
