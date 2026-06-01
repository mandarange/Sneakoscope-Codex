import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { exists, nowIso, packageRoot, readText, sha256 } from '../fsx.js';

export const MAD_SKS_IMMUTABLE_GUARD_SCHEMA = 'sks.mad-sks-immutable-harness-guard.v1';
export const MAD_SKS_PROTECTED_CORE_SCHEMA = 'sks.mad-sks-protected-core.v1';
export const MAD_SKS_PROTECTED_CORE_SNAPSHOT_SCHEMA = 'sks.mad-sks-protected-core-snapshot.v1';

export interface ProtectedCoreEntry {
  id: string;
  path: string;
  relative_path?: string;
  absolute_path: string;
  match: 'exact' | 'subtree';
  required: boolean;
}

export interface ProtectedCoreResolution {
  schema: typeof MAD_SKS_PROTECTED_CORE_SCHEMA;
  package_root: string;
  target_root: string;
  engine_source_exception: boolean;
  protection_mode: 'active' | 'engine_source_exception';
  generated_at: string;
  protected_paths: ProtectedCoreEntry[];
}

const PROTECTED_CORE_PATHS: Array<Omit<ProtectedCoreEntry, 'absolute_path'>> = [
  { id: 'packageRoot', path: '.', match: 'exact', required: true },
  { id: 'installed_bin', path: 'dist/bin/sks.js', match: 'exact', required: false },
  { id: 'dist', path: 'dist', match: 'subtree', required: false },
  { id: 'src_core', path: 'src/core', match: 'subtree', required: true },
  { id: 'src_cli', path: 'src/cli', match: 'subtree', required: true },
  { id: 'src_commands', path: 'src/commands', match: 'subtree', required: true },
  { id: 'scripts', path: 'scripts', match: 'subtree', required: true },
  { id: 'schemas', path: 'schemas', match: 'subtree', required: false },
  { id: 'rust_crate', path: 'crates/sks-core', match: 'subtree', required: false },
  { id: 'package_json', path: 'package.json', match: 'exact', required: true },
  { id: 'package_lock', path: 'package-lock.json', match: 'exact', required: false },
  { id: 'tsconfig', path: 'tsconfig.json', match: 'exact', required: false },
  { id: 'readme', path: 'README.md', match: 'exact', required: false },
  { id: 'changelog', path: 'CHANGELOG.md', match: 'exact', required: false },
  { id: 'release_readiness_doc', path: 'docs/release-readiness.md', match: 'exact', required: false },
  { id: 'managed_hooks', path: '.codex/managed-hooks', match: 'subtree', required: false },
  { id: 'immutable_policy', path: '.sneakoscope/policies/immutable-harness.json', match: 'exact', required: false },
  { id: 'agents_policy', path: 'AGENTS.md', match: 'exact', required: false }
];

export function isMadSksEngineSourceException(packageRootInput: string, targetRootInput: string = packageRootInput): boolean {
  const base = path.resolve(packageRootInput);
  const target = path.resolve(targetRootInput || base);
  if (!isInside(target, base)) return false;
  return isSneakoscopeEngineSourceRootSync(base);
}

export function resolveProtectedCore(input: string | { packageRoot?: string; targetRoot?: string } = packageRoot()): ProtectedCoreResolution {
  const base = path.resolve(typeof input === 'string' ? input : input.packageRoot || packageRoot());
  const targetRoot = path.resolve(typeof input === 'string' ? input : input.targetRoot || base);
  const engineSourceException = isMadSksEngineSourceException(base, targetRoot);
  return {
    schema: MAD_SKS_PROTECTED_CORE_SCHEMA,
    package_root: base,
    target_root: targetRoot,
    engine_source_exception: engineSourceException,
    protection_mode: engineSourceException ? 'engine_source_exception' : 'active',
    generated_at: nowIso(),
    protected_paths: engineSourceException ? [] : PROTECTED_CORE_PATHS.map((entry) => ({
      ...entry,
      relative_path: entry.path === '.' ? '.' : entry.path,
      absolute_path: path.resolve(base, entry.path)
    }))
  };
}

export async function evaluateProtectedCorePath(candidate: string, opts: { root?: string; targetRoot?: string; operation?: string } = {}) {
  const root = path.resolve(opts.root || packageRoot());
  const absolute = path.resolve(root, candidate);
  const resolution = resolveProtectedCore({ packageRoot: root, targetRoot: opts.targetRoot || root });
  const realCandidate = await realPathForCheck(absolute);
  if (resolution.engine_source_exception) {
    return {
      schema: MAD_SKS_IMMUTABLE_GUARD_SCHEMA,
      ok: true,
      action: 'allow',
      operation: opts.operation || 'write',
      candidate: absolute,
      real_candidate: realCandidate,
      protected_matches: [],
      symlink_escape_attempt: false,
      wrongness_kind: null,
      engine_source_exception: true,
      protection_mode: resolution.protection_mode,
      generated_at: nowIso()
    };
  }
  const matches = [];
  for (const entry of resolution.protected_paths) {
    const entryReal = await realPathForCheck(entry.absolute_path);
    const direct = pathMatches(absolute, entry.absolute_path, entry.match);
    const real = pathMatches(realCandidate, entryReal, entry.match);
    if (direct || real) {
      matches.push({
        id: entry.id,
        path: entry.path,
        match: entry.match,
        via: direct && real ? 'direct_and_realpath' : direct ? 'direct' : 'realpath',
        absolute_path: entry.absolute_path
      });
    }
  }
  const symlinkEscape = matches.some((match) => match.via === 'realpath' || match.via === 'direct_and_realpath')
    && absolute !== realCandidate;
  return {
    schema: MAD_SKS_IMMUTABLE_GUARD_SCHEMA,
    ok: matches.length === 0,
    action: matches.length ? 'block' : 'allow',
    operation: opts.operation || 'write',
    candidate: absolute,
    real_candidate: realCandidate,
    protected_matches: matches,
    symlink_escape_attempt: symlinkEscape,
    wrongness_kind: symlinkEscape ? 'mad_sks_symlink_escape_attempt' : matches.length ? 'mad_sks_protected_core_write_attempt' : null,
    engine_source_exception: false,
    protection_mode: resolution.protection_mode,
    generated_at: nowIso()
  };
}

export async function evaluateMadSksWrite({
  packageRoot: packageRootInput = packageRoot(),
  targetRoot = packageRootInput,
  operation = 'file_write',
  path: targetPath
}: {
  packageRoot?: string;
  targetRoot?: string;
  operation?: string;
  path: string;
}) {
  const root = path.resolve(packageRootInput);
  const target = path.resolve(targetRoot || root);
  const absolute = path.resolve(targetPath);
  const decision = await evaluateProtectedCorePath(absolute, { root, targetRoot: target, operation });
  const inTarget = isInside(absolute, target);
  return {
    schema: MAD_SKS_IMMUTABLE_GUARD_SCHEMA,
    ok: decision.ok && inTarget,
    decision: decision.ok && inTarget ? 'allowed' : 'blocked',
    reason: !inTarget ? 'outside_target_root' : decision.ok ? null : 'protected_core_path',
    operation,
    package_root: root,
    target_root: target,
    path: absolute,
    protected_core: decision,
    wrongness_kind: decision.wrongness_kind
  };
}

export interface SnapshotProtectedCoreOptions {
  // 'content' (default): read + sha256 every file (strong integrity). Used by the
  //   release gates (mad-sks:immutable-harness / no-harness-modification) and by
  //   materializeMadSksRun's before/after comparison.
  // 'metadata': hash only lstat metadata (mtimeMs+size+mode) per file — no file
  //   reads. Used for the interactive `sks --mad` launch 'before' snapshot, which
  //   is only persisted (env + policy json) and never compared during the session,
  //   so the ~10MB/1900-file content hash is wasted work on the launch hot path.
  mode?: 'content' | 'metadata';
}

export async function snapshotProtectedCore(root: string = packageRoot(), label = 'snapshot', opts: SnapshotProtectedCoreOptions = {}) {
  const mode = opts.mode === 'metadata' ? 'metadata' : 'content';
  const resolution = resolveProtectedCore(root);
  const entries = [];
  for (const entry of resolution.protected_paths) {
    entries.push(mode === 'metadata' ? await metadataHashProtectedEntry(entry) : await hashProtectedEntry(entry));
  }
  const digest = sha256(entries.map((entry) => `${entry.id}:${entry.hash || 'missing'}:${entry.file_count}:${entry.bytes}`).join('\n'));
  return {
    schema: MAD_SKS_PROTECTED_CORE_SNAPSHOT_SCHEMA,
    label,
    digest_mode: mode,
    generated_at: nowIso(),
    package_root: resolution.package_root,
    engine_source_exception: resolution.engine_source_exception,
    protection_mode: resolution.protection_mode,
    digest,
    snapshot_hash: digest,
    entries
  };
}

export async function buildProtectedCoreSnapshot({
  packageRoot: packageRootInput = packageRoot(),
  label = 'snapshot'
}: {
  packageRoot?: string;
  label?: string;
} = {}) {
  return snapshotProtectedCore(packageRootInput, label);
}

export function compareProtectedCoreSnapshots(before: any = {}, after: any = {}) {
  const beforeEntries = new Map((before.entries || []).map((entry: any) => [entry.id, entry]));
  const changed = [];
  for (const entry of after.entries || []) {
    const prev = beforeEntries.get(entry.id) as any;
    if (!prev || prev.hash !== entry.hash || prev.file_count !== entry.file_count || prev.bytes !== entry.bytes) {
      changed.push({ id: entry.id, before: prev || null, after: entry });
    }
  }
  return {
    schema: 'sks.mad-sks-protected-core-comparison.v1',
    ok: changed.length === 0 && before.digest === after.digest,
    before_digest: before.digest || null,
    after_digest: after.digest || null,
    changed
  };
}

async function hashProtectedEntry(entry: ProtectedCoreEntry) {
  if (!(await exists(entry.absolute_path))) {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: false, hash: null, file_count: 0, bytes: 0 };
  }
  const stat = await fsp.lstat(entry.absolute_path);
  if (stat.isFile()) {
    const text = await readText(entry.absolute_path, '');
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(text), file_count: 1, bytes: Buffer.byteLength(text) };
  }
  if (!stat.isDirectory()) {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(`${stat.mode}:${stat.size}`), file_count: 1, bytes: stat.size };
  }
  if (entry.match === 'exact') {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(`dir:${stat.mode}:${stat.uid}:${stat.gid}`), file_count: 1, bytes: 0 };
  }
  const files = await walk(entry.absolute_path);
  let bytes = 0;
  const parts = [];
  for (const file of files.sort()) {
    const buf = await fsp.readFile(file);
    bytes += buf.length;
    parts.push(`${path.relative(entry.absolute_path, file).split(path.sep).join('/')}:${sha256(buf)}`);
  }
  return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(parts.join('\n')), file_count: files.length, bytes };
}

// Cheap variant of hashProtectedEntry: hash only filesystem metadata
// (mtimeMs + size + mode) instead of reading + sha256-ing file contents. Walks the
// same file set so file_count/bytes stay comparable, but avoids the ~10MB read +
// per-file sha256 cost. Only used for the never-compared interactive launch 'before'
// snapshot; integrity-critical callers keep the default 'content' mode.
async function metadataHashProtectedEntry(entry: ProtectedCoreEntry) {
  if (!(await exists(entry.absolute_path))) {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: false, hash: null, file_count: 0, bytes: 0 };
  }
  const stat = await fsp.lstat(entry.absolute_path);
  if (stat.isFile()) {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(`${stat.mtimeMs}:${stat.size}:${stat.mode}`), file_count: 1, bytes: stat.size };
  }
  if (!stat.isDirectory()) {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(`${stat.mode}:${stat.size}`), file_count: 1, bytes: stat.size };
  }
  if (entry.match === 'exact') {
    return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(`dir:${stat.mode}:${stat.uid}:${stat.gid}`), file_count: 1, bytes: 0 };
  }
  const files = await walk(entry.absolute_path);
  let bytes = 0;
  const parts = [];
  for (const file of files.sort()) {
    const st = await fsp.lstat(file);
    bytes += st.size;
    parts.push(`${path.relative(entry.absolute_path, file).split(path.sep).join('/')}:${st.mtimeMs}:${st.size}:${st.mode}`);
  }
  return { id: entry.id, path: entry.path, relative_path: entry.path, present: true, hash: sha256(parts.join('\n')), file_count: files.length, bytes };
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && ['.git', 'node_modules', 'target'].includes(entry.name)) continue;
    if (entry.isDirectory()) await walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}

function pathMatches(candidate: string, protectedPath: string, match: 'exact' | 'subtree') {
  const rel = path.relative(protectedPath, candidate);
  if (match === 'exact') return rel === '';
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isInside(candidate: string, root: string) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isSneakoscopeEngineSourceRootSync(root: string) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg?.name === 'sneakoscope'
      && fs.existsSync(path.join(root, 'src', 'bin', 'sks.ts'))
      && fs.existsSync(path.join(root, 'src', 'core', 'init.ts'))
      && fs.existsSync(path.join(root, 'src', 'core', 'hooks-runtime.ts'));
  } catch {
    return false;
  }
}

async function realPathForCheck(candidate: string) {
  try {
    return await fsp.realpath(candidate);
  } catch {
    const suffix = [];
    let current = path.resolve(candidate);
    while (current !== path.dirname(current)) {
      const parent = path.dirname(current);
      suffix.unshift(path.basename(current));
      try {
        const realParent = await fsp.realpath(parent);
        return path.join(realParent, ...suffix);
      } catch {
        current = parent;
      }
    }
    return path.resolve(candidate);
  }
}
