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
  toolVersions?: Record<string, string>;
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
  release_gates_hash: string;
  env_allowlist_hash: string;
  fixture_version: string;
  tool_version: string;
  tool_versions: Record<string, string>;
  file_count: number;
  missing_inputs: string[];
  redacted_env_keys: string[];
  unsupported_globs: string[];
}

const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.sneakoscope/cache',
  '.sneakoscope/reports',
  '.sneakoscope/missions',
  '.sneakoscope/quarantine',
  'dist',
  '.claude',
  '.cache',
  'coverage',
  'build'
]);

export function computeTriWikiCacheKey(input: TriWikiCacheKeyInput): TriWikiCacheKey {
  const root = path.resolve(input.root);
  const sourceFiles = collectInputFiles(root, input.inputs);
  const implementationFiles = collectInputFiles(root, input.implementationFiles || []);
  const packageLock = hashPathIfPresent(root, 'package-lock.json');
  const releaseGates = hashPathIfPresent(root, 'release-gates.v2.json');
  const env = envFingerprint(input.envAllowlist || []);
  const envHash = hashJson(env.records);
  const fixtureVersion = input.fixtureVersion || 'fixture-v1';
  const toolVersion = input.toolVersion || readPackageVersion(root);
  const toolVersions = { sks: toolVersion, ...(input.toolVersions || {}) };
  const inputHash = hashJson(sourceFiles.records);
  const implementationHash = hashJson(implementationFiles.records);
  const key = hashJson({
    schema: TRIWIKI_CACHE_KEY_SCHEMA,
    id: input.id,
    input_hash: inputHash,
    implementation_hash: implementationHash,
    package_lock_hash: packageLock.hash,
    release_gates_hash: releaseGates.hash,
    env_allowlist_hash: envHash,
    fixture_version: fixtureVersion,
    tool_versions: toolVersions,
    salt: input.salt || ''
  });
  return {
    schema: TRIWIKI_CACHE_KEY_SCHEMA,
    id: input.id,
    key,
    input_hash: inputHash,
    implementation_hash: implementationHash,
    package_lock_hash: packageLock.hash,
    release_gates_hash: releaseGates.hash,
    env_allowlist_hash: envHash,
    fixture_version: fixtureVersion,
    tool_version: toolVersion,
    tool_versions: toolVersions,
    file_count: sourceFiles.records.length,
    missing_inputs: [...sourceFiles.missing, ...packageLock.missing, ...releaseGates.missing],
    redacted_env_keys: env.redacted_keys,
    unsupported_globs: [...sourceFiles.unsupported, ...implementationFiles.unsupported]
  };
}

export function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value, stableJsonReplacer));
}

export function collectInputFiles(root: string, patterns: string[]): { records: Array<{ path: string; hash: string; size: number; mode: string }>; missing: string[]; unsupported: string[] } {
  const files = new Set<string>();
  const missing: string[] = [];
  const unsupported: string[] = [];
  for (const pattern of patterns) {
    if (/[{}]/.test(pattern)) {
      unsupported.push(`unsupported_brace_glob:${pattern}`);
      continue;
    }
    const normalized = normalizePattern(pattern);
    if (!isSafeRelativePattern(root, normalized)) {
      unsupported.push(`outside_root_or_unsafe_input:${pattern}`);
      continue;
    }
    const matches = expandInputPattern(root, normalized);
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
    else if (hashed.unsupported?.length) unsupported.push(...hashed.unsupported);
    else if (hashed.record) records.push(hashed.record);
  }
  return { records, missing: [...new Set(missing)].sort(), unsupported: [...new Set(unsupported)].sort() };
}

function expandInputPattern(root: string, normalized: string): string[] {
  if (!normalized.includes('*')) {
    const absolute = path.resolve(root, normalized);
    if (!fs.existsSync(absolute) || !safeInputPath(root, absolute, true)) return [];
    return listFiles(root, absolute);
  }
  const regex = globToRegex(normalized);
  const prefix = staticGlobPrefix(normalized);
  const start = path.resolve(root, prefix || '.');
  if (!isWithinRoot(root, start) || !safeInputPath(root, start, false)) return [];
  return listFiles(root, start).filter((rel) => regex.test(rel));
}

function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegex(pattern: string): RegExp {
  let regex = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] || '';
    if (char === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        regex += '(?:.*/)?';
        index += 2;
      } else {
        regex += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      regex += '[^/]*';
      continue;
    }
    regex += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${regex}$`);
}

function staticGlobPrefix(pattern: string): string {
  const segments = pattern.split('/');
  const fixed = segments.slice(0, segments.findIndex((segment) => segment.includes('*')) < 0
    ? segments.length
    : segments.findIndex((segment) => segment.includes('*')));
  return fixed.join('/');
}

function isSafeRelativePattern(root: string, pattern: string): boolean {
  if (!pattern || path.isAbsolute(pattern) || pattern === '..' || pattern.startsWith('../')) return false;
  return isWithinRoot(root, path.resolve(root, pattern.replace(/\*.*$/, '')));
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function listFiles(root: string, start: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(start)) return out;
  if (!safeInputPath(root, start, true)) return out;
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(start);
  } catch (error) {
    if (isMissingOrInaccessible(error)) return out;
    throw error;
  }
  if (stat.isSymbolicLink() || stat.isFile()) return [relativeUnix(root, start)];
  if (!stat.isDirectory()) return out;
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const relDir = relativeUnix(root, dir);
    if (relDir && isExcluded(relDir)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      // dir can vanish or become unreadable between stack push and pop (TOCTOU) — contribute zero files, not a crash
      if (isMissingOrInaccessible(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const rel = relativeUnix(root, absolute);
      if (isExcluded(rel)) continue;
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(rel);
    }
  }
  return out.sort();
}

function isMissingOrInaccessible(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR' || code === 'EPERM';
}

function isExcluded(rel: string): boolean {
  const segments = normalizePattern(rel).split('/');
  if (segments.some((segment) => segment === 'node_modules' || segment === '.git' || segment === '.claude' || segment === '.cache')) return true;
  for (const dir of DEFAULT_EXCLUDED_DIRS) {
    if (rel === dir || rel.startsWith(`${dir}/`)) return true;
  }
  return false;
}

function hashPathIfPresent(root: string, rel: string): { hash: string; missing: string[]; unsupported?: string[]; record?: { path: string; hash: string; size: number; mode: string } } {
  const absolute = path.resolve(root, rel);
  if (!isWithinRoot(root, absolute)) return { hash: 'unsupported', missing: [], unsupported: [`outside_root:${rel}`] };
  if (!fs.existsSync(absolute)) return { hash: 'missing', missing: [rel] };
  if (!safeInputPath(root, absolute, true)) return { hash: 'unsupported', missing: [], unsupported: [`symlink_escape_or_unsafe_input:${rel}`] };
  const stat = fs.lstatSync(absolute);
  const mode = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'dir' : 'file';
  if (stat.isDirectory()) {
    const files = listFiles(root, absolute).map((file) => hashPathIfPresent(root, file).record).filter((record): record is { path: string; hash: string; size: number; mode: string } => Boolean(record));
    const hash = hashJson(files);
    return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: files.length, mode } };
  }
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(absolute);
    const resolved = path.resolve(path.dirname(absolute), target);
    const outsideRoot = !resolved.startsWith(path.resolve(root) + path.sep);
    const hash = hashJson({ rel, target, mode, outside_root: outsideRoot });
    return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: target.length, mode } };
  }
  if (!stat.isFile()) return { hash: 'unsupported', missing: [], unsupported: [`non_regular_input:${rel}`] };
  const hash = hashFileChunked(absolute, stat.size);
  return { hash, missing: [], record: { path: normalizePattern(rel), hash, size: stat.size, mode } };
}

function safeInputPath(root: string, candidate: string, allowFinalSymlink: boolean): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (!isWithinRoot(resolvedRoot, resolvedCandidate)) return false;
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let cursor = resolvedRoot;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index] as string);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      return false;
    }
    if (stat.isSymbolicLink() && !(allowFinalSymlink && index === segments.length - 1)) return false;
  }
  try {
    const finalStat = fs.lstatSync(resolvedCandidate);
    if (finalStat.isSymbolicLink() && allowFinalSymlink) return true;
    const realRoot = fs.realpathSync(resolvedRoot);
    const realCandidate = fs.realpathSync(resolvedCandidate);
    return isWithinRoot(realRoot, realCandidate);
  } catch (error) {
    return false;
  }
}

function hashFileChunked(file: string, size: number): string {
  const h = crypto.createHash('sha256');
  h.update(`size:${size}:`);
  const chunk = 256 * 1024;
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(chunk);
    let offset = 0;
    while (offset < size) {
      const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (read <= 0) break;
      h.update(buffer.subarray(0, read));
      offset += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function envFingerprint(keys: string[]): { records: Array<{ key: string; present: boolean; fingerprint: string }>; redacted_keys: string[] } {
  const redacted: string[] = [];
  const records = [...new Set(keys)].sort().map((key) => {
    const value = process.env[key];
    const secret = /SECRET|TOKEN|PASSWORD|KEY|CREDENTIAL/i.test(key);
    if (secret) redacted.push(key);
    return {
      key,
      present: value !== undefined,
      fingerprint: value === undefined ? 'missing' : secret ? 'redacted-secret' : hashText(`${key}:${hashText(value)}`)
    };
  });
  return { records, redacted_keys: redacted };
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
