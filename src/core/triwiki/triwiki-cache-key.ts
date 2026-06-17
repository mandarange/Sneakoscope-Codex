import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TRIWIKI_CACHE_KEY_SCHEMA = 'sks.triwiki-cache-key.v1';

export interface TriWikiCacheKeyInput {
  root: string;
  id: string;
  inputs: string[];
  implementationFiles?: string[];
  toolVersion?: string;
  envAllowlist?: string[];
  fixtureVersion?: string;
  salt?: string;
}

export interface TriWikiCacheKey {
  schema: typeof TRIWIKI_CACHE_KEY_SCHEMA;
  id: string;
  key: string;
  input_hash: string;
  implementation_hash: string;
  package_lock_hash: string;
  env_allowlist_hash: string;
  fixture_version: string;
  tool_version: string;
  file_count: number;
  missing_inputs: string[];
}

const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.sneakoscope/cache',
  '.sneakoscope/reports',
  '.sneakoscope/missions',
  '.sneakoscope/quarantine',
  'dist'
]);

export function computeTriWikiCacheKey(input: TriWikiCacheKeyInput): TriWikiCacheKey {
  const root = path.resolve(input.root);
  const sourceFiles = collectInputFiles(root, input.inputs);
  const implementationFiles = collectInputFiles(root, input.implementationFiles || []);
  const packageLock = hashPathIfPresent(root, 'package-lock.json');
  const envHash = hashJson(envFingerprint(input.envAllowlist || []));
  const fixtureVersion = input.fixtureVersion || 'fixture-v1';
  const toolVersion = input.toolVersion || readPackageVersion(root);
  const inputHash = hashJson(sourceFiles.records);
  const implementationHash = hashJson(implementationFiles.records);
  const key = hashJson({
    schema: TRIWIKI_CACHE_KEY_SCHEMA,
    id: input.id,
    input_hash: inputHash,
    implementation_hash: implementationHash,
    package_lock_hash: packageLock.hash,
    env_allowlist_hash: envHash,
    fixture_version: fixtureVersion,
    tool_version: toolVersion,
    salt: input.salt || ''
  });
  return {
    schema: TRIWIKI_CACHE_KEY_SCHEMA,
    id: input.id,
    key,
    input_hash: inputHash,
    implementation_hash: implementationHash,
    package_lock_hash: packageLock.hash,
    env_allowlist_hash: envHash,
    fixture_version: fixtureVersion,
    tool_version: toolVersion,
    file_count: sourceFiles.records.length,
    missing_inputs: [...sourceFiles.missing, ...packageLock.missing]
  };
}

export function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value, stableJsonReplacer));
}

export function collectInputFiles(root: string, patterns: string[]): { records: Array<{ path: string; hash: string; size: number; mode: string }>; missing: string[] } {
  const files = new Set<string>();
  const missing: string[] = [];
  for (const pattern of patterns) {
    const matches = expandInputPattern(root, pattern);
    if (!matches.length) {
      const literal = path.resolve(root, pattern);
      if (fs.existsSync(literal)) files.add(relativeUnix(root, literal));
      else missing.push(pattern);
    } else {
      for (const match of matches) files.add(match);
    }
  }
  const records: Array<{ path: string; hash: string; size: number; mode: string }> = [];
  for (const rel of [...files].sort()) {
    const hashed = hashPathIfPresent(root, rel);
    if (hashed.missing.length) missing.push(rel);
    else if (hashed.record) records.push(hashed.record);
  }
  return { records, missing: [...new Set(missing)].sort() };
}

function expandInputPattern(root: string, pattern: string): string[] {
  const normalized = normalizePattern(pattern);
  if (!normalized.includes('*')) {
    const absolute = path.resolve(root, normalized);
    if (!fs.existsSync(absolute)) return [];
    return listFiles(root, absolute);
  }
  const regex = globToRegex(normalized);
  return listFiles(root, root).filter((rel) => regex.test(rel));
}

function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split('')
    .map((char) => {
      if (char === '*') return '*';
      return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
    })
    .join('');
  const regex = escaped
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${regex}$`);
}

function listFiles(root: string, start: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(start)) return out;
  const stat = fs.lstatSync(start);
  if (stat.isSymbolicLink() || stat.isFile()) return [relativeUnix(root, start)];
  if (!stat.isDirectory()) return out;
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const relDir = relativeUnix(root, dir);
    if (relDir && isExcluded(relDir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const rel = relativeUnix(root, absolute);
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(rel);
    }
  }
  return out.sort();
}

function isExcluded(rel: string): boolean {
  for (const dir of DEFAULT_EXCLUDED_DIRS) {
    if (rel === dir || rel.startsWith(`${dir}/`)) return true;
  }
  return false;
}

function hashPathIfPresent(root: string, rel: string): { hash: string; missing: string[]; record?: { path: string; hash: string; size: number; mode: string } } {
  const absolute = path.resolve(root, rel);
  if (!fs.existsSync(absolute)) return { hash: 'missing', missing: [rel] };
  const stat = fs.lstatSync(absolute);
  const mode = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'dir' : 'file';
  if (stat.isDirectory()) {
    const files = listFiles(root, absolute).map((file) => hashPathIfPresent(root, file).record).filter((record): record is { path: string; hash: string; size: number; mode: string } => Boolean(record));
    const hash = hashJson(files);
    return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: files.length, mode } };
  }
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(absolute);
    const hash = hashJson({ rel, target, mode });
    return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: target.length, mode } };
  }
  const hash = hashFileChunked(absolute, stat.size);
  return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: stat.size, mode } };
}

function hashFileChunked(file: string, size: number): string {
  const h = crypto.createHash('sha256');
  h.update(`size:${size}:`);
  const chunk = 256 * 1024;
  const fd = fs.openSync(file, 'r');
  try {
    if (size <= chunk * 3) {
      h.update(fs.readFileSync(file));
    } else {
      for (const offset of [0, Math.max(0, Math.floor(size / 2) - Math.floor(chunk / 2)), Math.max(0, size - chunk)]) {
        const buffer = Buffer.alloc(chunk);
        const read = fs.readSync(fd, buffer, 0, chunk, offset);
        h.update(`@${offset}:`);
        h.update(buffer.subarray(0, read));
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function envFingerprint(keys: string[]): Array<{ key: string; present: boolean; fingerprint: string }> {
  return [...new Set(keys)].sort().map((key) => {
    const value = process.env[key];
    return {
      key,
      present: value !== undefined,
      fingerprint: value === undefined ? 'missing' : hashText(`${key}:${value}`)
    };
  });
}

function readPackageVersion(root: string): string {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string };
    return json.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function relativeUnix(root: string, absolute: string): string {
  return path.relative(root, absolute).replace(/\\/g, '/');
}

function stableJsonReplacer(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = record[key];
    return acc;
  }, {});
}
