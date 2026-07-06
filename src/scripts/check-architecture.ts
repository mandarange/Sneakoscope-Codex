#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures: string[] = [];
const waivers = loadWaivers();
const changedFiles = changedFileSet();

runGate('pipeline-budget:check');
runGate('pipeline-runtime:check');
checkLargeFiles();
checkTsImports();
checkDistRuntime();
if (failures.length) {
  console.error('Architecture check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Architecture check passed');

function runGate(script: string) {
  const result = spawnSync('npm', ['run', script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) failures.push(`${script}: ${result.stderr || result.stdout}`.trim());
}

function checkFacade(relPath: string, maxLines: number) {
  const file = path.join(root, relPath);
  if (!fs.existsSync(file)) return failures.push(`${relPath}: missing`);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) failures.push(`${relPath}: line count ${lines} > ${maxLines}`);
  if (/from ['"].*\b(team|qa|research|ppt|image-ux-review|db|gx)\b/i.test(text)) failures.push(`${relPath}: imports route implementation domains directly`);
}

function checkLargeFiles() {
  const files: string[] = [];
  walk(path.join(root, 'src'), files);
  for (const file of files) {
    const relPath = path.relative(root, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    if (isWaivedGenerated(relPath)) continue;
    const max = architectureLineLimit(relPath);
    const baselineLines = changedFiles.has(relPath) ? baseLineCount(relPath) : lines;
    if (lines >= 3000) failures.push(`${relPath}: handwritten file ${lines} lines >= 3000 split-review risk`);
    if (baselineLines === null && lines > 400) failures.push(`${relPath}: new source file ${lines} lines > 400`);
    if (changedFiles.has(relPath) && lines > max && (baselineLines === null || lines - baselineLines > 80)) {
      failures.push(`${relPath}: changed file grew to ${lines} lines > ${max} architecture gate`);
    }
    if (changedFiles.has(relPath) && !isRouteDomainAggregator(relPath) && importsUnrelatedRouteDomains(file)) failures.push(`${relPath}: changed file imports 5+ unrelated route domains`);
  }
}

function architectureLineLimit(relPath: string): number {
  if (/^src\/core\/(?:pipeline|trust-kernel|evidence|proof)\//.test(relPath)) return 1200;
  if (/^src\/core\/(?:pipeline|trust-kernel|evidence|proof)/.test(relPath)) return 1200;
  if (/^src\/commands\//.test(relPath) || /^src\/core\/commands\//.test(relPath)) return 900;
  return 1800;
}

function isRouteDomainAggregator(relPath: string): boolean {
  return [
    'src/core/pipeline-internals/runtime-core.ts',
    'src/core/pipeline-internals/runtime-gates.ts'
  ].includes(relPath);
}

function importsUnrelatedRouteDomains(file: string): boolean {
  const text = fs.readFileSync(file, 'utf8');
  const domains = new Set();
  const imports = importSpecs(text);
  for (const domain of ['team', 'qa-loop', 'research', 'ppt', 'image-ux-review', 'db', 'gx', 'wiki']) {
    if (imports.some((spec) => new RegExp(`(^|[/_-])${domain}([/_-]|\\.|$)`, 'i').test(spec))) domains.add(domain);
  }
  return domains.size >= 5;
}

function importSpecs(text: string): string[] {
  const specs: string[] = [];
  const re = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const spec = match[1];
    if (spec) specs.push(spec);
  }
  return specs;
}

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile() && /\.(mjs|js|ts)$/.test(entry.name)) out.push(file);
  }
}

function checkTsImports() {
  const files: string[] = [];
  walk(path.join(root, 'src'), files);
  for (const file of files.filter((item) => item.endsWith('.ts'))) {
    const relPath = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    if (/from\s+['"][^'"]+\.mjs['"]|import\(\s*['"][^'"]+\.mjs['"]\s*\)/.test(text)) {
      failures.push(`${relPath}: TypeScript imports .mjs runtime`);
    }
  }
}

function checkDistRuntime() {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) return;
  const files: string[] = [];
  walk(dist, files);
  for (const file of files) {
    const relPath = path.relative(root, file).split(path.sep).join('/');
    if (relPath.endsWith('.mjs')) failures.push(`${relPath}: dist .mjs runtime forbidden`);
  }
}

function loadWaivers() {
  const file = path.join(root, 'src', 'generated', 'architecture-waivers.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.waivers) ? parsed.waivers : [];
  } catch {
    return [];
  }
}

function isWaivedGenerated(relPath: string): boolean {
  return /^src\/generated\//.test(relPath)
    || waivers.some((waiver: any) => waiver?.schema === 'sks.architecture-waiver.v1'
      && waiver.file === relPath
      && waiver.reason === 'generated'
      && waiver.expires_version);
}

function changedFileSet(): Set<string> {
  const out = new Set<string>();
  for (const line of gitLines(['diff', '--name-only', 'HEAD', '--'])) out.add(normalize(line));
  for (const line of gitLines(['ls-files', '--others', '--exclude-standard'])) out.add(normalize(line));
  return out;
}

function baseLineCount(relPath: string): number | null {
  const result = spawnSync('git', ['show', `HEAD:${relPath}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  const text = String(result.stdout || '');
  return text ? text.split(/\r?\n/).length : 0;
}

function gitLines(args: string[]): string[] {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map(normalize).filter(Boolean);
}

function normalize(file: string): string {
  return String(file || '').replace(/\\/g, '/');
}
