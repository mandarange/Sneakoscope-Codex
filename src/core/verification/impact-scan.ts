import path from 'node:path';
import { listFilesRecursive, readText, runProcess, which } from '../fsx.js';

export interface ImpactSymbol {
  name: string;
  file: string;
  kind: 'export' | 'local';
}

export interface ImpactReference {
  symbol: string;
  file: string;
  line: number;
  text: string;
}

export interface ImpactReport {
  schema: 'sks.impact-scan.v1';
  changed_symbols: ImpactSymbol[];
  references: ImpactReference[];
  cochange_required: string[];
  tool: 'ast-grep' | 'ripgrep' | 'builtin';
}

type ScanTool = ImpactReport['tool'];

const DECL_RE = /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)\b/;
const TEXT_EXT_RE = /\.(?:[cm]?[jt]sx?|json|md|css|scss|html|yml|yaml|toml)$/i;

export async function scanImpact(root: string, changedFiles: string[], patchText: string): Promise<ImpactReport> {
  const symbols = extractChangedExportedSymbols(patchText, changedFiles);
  const tool = await pickScanTool();
  const references: ImpactReference[] = [];
  for (const sym of symbols) {
    references.push(...await findReferences(root, sym.name, tool, { excludeFile: sym.file }));
  }
  const patchFiles = new Set(changedFiles.map(normalizePath));
  const cochange = [...new Set(references.map((ref) => ref.file))]
    .filter((file) => !patchFiles.has(normalizePath(file)));
  return {
    schema: 'sks.impact-scan.v1',
    changed_symbols: symbols,
    references,
    cochange_required: cochange,
    tool
  };
}

export function extractChangedExportedSymbols(patchText: string, changedFiles: string[]): ImpactSymbol[] {
  const symbols: ImpactSymbol[] = [];
  let currentFile = normalizePath(changedFiles[0] || '');
  for (const rawLine of String(patchText || '').split(/\r?\n/)) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = normalizePath(rawLine.slice('+++ b/'.length));
      continue;
    }
    if (rawLine.startsWith('--- ') || !rawLine.startsWith('-')) continue;
    const line = rawLine.slice(1);
    const match = line.match(DECL_RE);
    if (!match?.[1]) continue;
    symbols.push({ name: match[1], file: currentFile, kind: 'export' });
  }
  return dedupeSymbols(symbols);
}

export async function pickScanTool(): Promise<ScanTool> {
  if (await which('ast-grep')) return 'ast-grep';
  if (await which('rg')) return 'ripgrep';
  return 'builtin';
}

export async function findReferences(root: string, symbol: string, tool: ScanTool, opts: { excludeFile?: string } = {}): Promise<ImpactReference[]> {
  const normalizedExclude = normalizePath(opts.excludeFile || '');
  if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) return [];
  if (tool === 'ast-grep') {
    const refs = await astGrepReferences(root, symbol, normalizedExclude);
    if (refs.length) return refs;
  }
  if (tool === 'ast-grep' || tool === 'ripgrep') {
    const refs = await ripgrepReferences(root, symbol, normalizedExclude);
    if (refs.length || tool === 'ripgrep') return refs;
  }
  return builtinReferences(root, symbol, normalizedExclude);
}

async function astGrepReferences(root: string, symbol: string, excludeFile: string): Promise<ImpactReference[]> {
  const result = await runProcess('ast-grep', ['run', '-p', symbol, '--json', root], {
    cwd: root,
    timeoutMs: 15_000,
    maxOutputBytes: 512 * 1024
  }).catch(() => null);
  if (!result || result.code !== 0 || !result.stdout.trim()) return [];
  const refs: ImpactReference[] = [];
  try {
    const rows = JSON.parse(result.stdout);
    for (const row of Array.isArray(rows) ? rows : []) {
      const file = normalizePath(path.relative(root, String(row.file || row.path || '')));
      if (!file || file === excludeFile || shouldIgnorePath(file)) continue;
      refs.push({
        symbol,
        file,
        line: Number(row.range?.start?.line || row.line || 1),
        text: String(row.text || row.lines || '').trim().slice(0, 240)
      });
    }
  } catch {
    return [];
  }
  return capReferences(refs);
}

async function ripgrepReferences(root: string, symbol: string, excludeFile: string): Promise<ImpactReference[]> {
  const result = await runProcess('rg', ['-n', '--glob', '!node_modules', '--glob', '!.git', '--glob', '!dist', `\\b${escapeRegex(symbol)}\\b`, '.'], {
    cwd: root,
    timeoutMs: 15_000,
    maxOutputBytes: 512 * 1024
  }).catch(() => null);
  if (!result || (result.code !== 0 && !result.stdout)) return [];
  return capReferences(String(result.stdout || '').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) return [];
    const file = normalizePath(match[1] || '');
    if (!file || file === excludeFile || shouldIgnorePath(file)) return [];
    return [{ symbol, file, line: Number(match[2] || 1), text: String(match[3] || '').trim().slice(0, 240) }];
  }));
}

async function builtinReferences(root: string, symbol: string, excludeFile: string): Promise<ImpactReference[]> {
  const files = await listFilesRecursive(root, { ignore: ['.git', 'node_modules', 'dist', '.sneakoscope/tmp', '.sneakoscope/arenas'], maxFiles: 30_000 });
  const word = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  const refs: ImpactReference[] = [];
  for (const abs of files) {
    const file = normalizePath(path.relative(root, abs));
    if (!TEXT_EXT_RE.test(file) || file === excludeFile || shouldIgnorePath(file)) continue;
    const text = await readText(abs, '').catch(() => '');
    if (!word.test(String(text))) continue;
    const lines = String(text).split(/\r?\n/);
    let perFile = 0;
    for (let index = 0; index < lines.length && perFile < 50; index += 1) {
      if (!word.test(lines[index] || '')) continue;
      refs.push({ symbol, file, line: index + 1, text: String(lines[index] || '').trim().slice(0, 240) });
      perFile += 1;
    }
  }
  return capReferences(refs);
}

function capReferences(refs: ImpactReference[]): ImpactReference[] {
  const perFile = new Map<string, number>();
  const out: ImpactReference[] = [];
  for (const ref of refs) {
    const key = `${ref.symbol}:${ref.file}`;
    const count = perFile.get(key) || 0;
    if (count >= 50) continue;
    perFile.set(key, count + 1);
    out.push(ref);
  }
  return out.slice(0, 500);
}

function dedupeSymbols(symbols: ImpactSymbol[]): ImpactSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((sym) => {
    const key = `${sym.file}:${sym.name}:${sym.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldIgnorePath(file: string): boolean {
  return file.startsWith('node_modules/') || file.startsWith('.git/') || file.startsWith('dist/');
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
