import fsp from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_VERSION, packageRoot, readJson, runProcess, which } from '../fsx.js';
import { guardedPackageInstall, guardContextForRoute } from '../safety/mutation-guard.js';
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js';
import { comparePackageVersions } from '../update-check.js';

export interface GlobalSksInstallCandidate {
  bin: string | null;
  real_bin: string | null;
  package_root: string | null;
  prefix: string | null;
  version: string | null;
  source: string;
  source_repo_exempt: boolean;
  keep: boolean;
  remove: boolean;
  reason: string;
}

export interface GlobalSksInstallCleanupResult {
  schema: 'sks.global-sks-install-cleanup.v1';
  ok: boolean;
  fix: boolean;
  source_root: string;
  package: 'sneakoscope';
  candidates: GlobalSksInstallCandidate[];
  kept: GlobalSksInstallCandidate[];
  removable: GlobalSksInstallCandidate[];
  removed: Array<{ prefix: string; package_root: string | null; ok: boolean; status: number | null; error: string | null }>;
  blockers: string[];
}

export async function cleanDuplicateGlobalSksInstalls(opts: {
  root?: string;
  fix?: boolean;
  env?: NodeJS.ProcessEnv;
  npmBin?: string | null;
} = {}): Promise<GlobalSksInstallCleanupResult> {
  const env = opts.env || process.env;
  const sourceRoot = await realpathOrSelf(opts.root || packageRoot());
  const npmBin = opts.npmBin === undefined ? await which('npm') : opts.npmBin;
  const candidates = await discoverGlobalSksInstallCandidates({ env, npmBin, sourceRoot });
  const planned = planGlobalSksInstallCleanup(candidates, { sourceRoot });
  const removed: GlobalSksInstallCleanupResult['removed'] = [];
  const blockers: string[] = [...planned.blockers];
  if (opts.fix === true && planned.removable.length > 0) {
    if (!npmBin) {
      blockers.push('npm_not_found_for_duplicate_global_sks_cleanup');
    } else {
      const cleanupContract = createRequestedScopeContract({
        route: 'doctor',
        userRequest: 'sks doctor --fix duplicate global SKS cleanup',
        projectRoot: sourceRoot,
        overrides: { package_install: true }
      });
      const guardContext = guardContextForRoute(sourceRoot, cleanupContract, 'sks doctor --fix duplicate global SKS cleanup');
      for (const candidate of planned.removable) {
        if (!candidate.prefix) {
          blockers.push(`duplicate_global_sks_missing_prefix:${candidate.package_root || candidate.bin || 'unknown'}`);
          continue;
        }
        const uninstallArgs = ['uninstall', '-g', 'sneakoscope', '--prefix', candidate.prefix, '--silent'];
        const result = await guardedPackageInstall(
          guardContext,
          `sneakoscope duplicate global install at ${candidate.prefix}`,
          { confirmed: true, command: npmBin, args: uninstallArgs, env, timeoutMs: 15000, maxOutputBytes: 8192 }
        ).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
        const ok = result.code === 0;
        if (!ok) blockers.push(`duplicate_global_sks_uninstall_failed:${candidate.prefix}`);
        removed.push({
          prefix: candidate.prefix,
          package_root: candidate.package_root,
          ok,
          status: result.code,
          error: ok ? null : String(result.stderr || result.stdout || 'npm uninstall failed').trim()
        });
      }
    }
  }
  return {
    schema: 'sks.global-sks-install-cleanup.v1',
    ok: blockers.length === 0,
    fix: opts.fix === true,
    source_root: sourceRoot,
    package: 'sneakoscope',
    candidates: planned.candidates,
    kept: planned.kept,
    removable: planned.removable,
    removed,
    blockers
  };
}

export function planGlobalSksInstallCleanup(
  rawCandidates: GlobalSksInstallCandidate[],
  opts: { sourceRoot: string }
): { candidates: GlobalSksInstallCandidate[]; kept: GlobalSksInstallCandidate[]; removable: GlobalSksInstallCandidate[]; blockers: string[] } {
  const deduped = dedupeCandidates(rawCandidates).map((candidate) => ({
    ...candidate,
    source_repo_exempt: candidate.source_repo_exempt || samePath(candidate.package_root, opts.sourceRoot) || samePath(candidate.real_bin, opts.sourceRoot) || insidePath(candidate.real_bin, opts.sourceRoot)
  }));
  const globalCandidates = deduped.filter((candidate) => candidate.package_root && !candidate.source_repo_exempt);
  const sorted = [...globalCandidates].sort((a, b) => {
    const versionCompare = comparePackageVersions(b.version || '0.0.0', a.version || '0.0.0');
    if (versionCompare !== 0) return versionCompare;
    return scoreCandidate(b) - scoreCandidate(a);
  });
  const keepRoot = sorted[0]?.package_root || null;
  const candidates = deduped.map((candidate) => {
    if (candidate.source_repo_exempt) {
      return { ...candidate, keep: true, remove: false, reason: 'source_repo_exempt' };
    }
    if (!candidate.package_root) {
      return { ...candidate, keep: false, remove: false, reason: 'not_a_global_sneakoscope_package' };
    }
    if (samePath(candidate.package_root, keepRoot)) {
      return { ...candidate, keep: true, remove: false, reason: 'kept_single_global_install' };
    }
    return { ...candidate, keep: false, remove: Boolean(candidate.prefix), reason: candidate.prefix ? 'duplicate_global_install' : 'duplicate_global_install_missing_prefix' };
  });
  const removable = candidates.filter((candidate) => candidate.remove && !candidate.source_repo_exempt);
  const blockers = candidates
    .filter((candidate) => candidate.reason === 'duplicate_global_install_missing_prefix')
    .map((candidate) => `duplicate_global_sks_missing_prefix:${candidate.package_root || candidate.bin || 'unknown'}`);
  return {
    candidates,
    kept: candidates.filter((candidate) => candidate.keep),
    removable,
    blockers
  };
}

async function discoverGlobalSksInstallCandidates(opts: { env: NodeJS.ProcessEnv; npmBin: string | null; sourceRoot: string }): Promise<GlobalSksInstallCandidate[]> {
  const bins = whichAll('sks', opts.env);
  const candidates: GlobalSksInstallCandidate[] = [];
  for (const bin of bins) {
    try {
      await fsp.access(bin);
    } catch {
      continue;
    }
    candidates.push(await candidateFromBin(bin, opts.sourceRoot));
  }
  if (opts.npmBin) {
    const prefix = await npmPrefix(opts.npmBin, opts.env);
    const root = await npmRoot(opts.npmBin, opts.env);
    const packageRootPath = root ? path.join(root, 'sneakoscope') : null;
    const version = packageRootPath ? await packageVersion(packageRootPath) : null;
    if (packageRootPath && version) {
      candidates.push({
        bin: null,
        real_bin: null,
        package_root: await realpathOrSelf(packageRootPath),
        prefix,
        version,
        source: 'npm-prefix-g',
        source_repo_exempt: samePath(packageRootPath, opts.sourceRoot),
        keep: false,
        remove: false,
        reason: 'discovered'
      });
    }
  }
  return candidates;
}

async function candidateFromBin(bin: string, sourceRoot: string): Promise<GlobalSksInstallCandidate> {
  const realBin = await realpathOrSelf(bin);
  const packageRootPath = await findSneakoscopePackageRoot(path.dirname(realBin));
  const prefix = packageRootPath ? inferNpmPrefix(packageRootPath) : null;
  const version = packageRootPath ? await packageVersion(packageRootPath) : null;
  return {
    bin,
    real_bin: realBin,
    package_root: packageRootPath,
    prefix,
    version,
    source: 'PATH',
    source_repo_exempt: samePath(packageRootPath, sourceRoot) || insidePath(realBin, sourceRoot),
    keep: false,
    remove: false,
    reason: 'discovered'
  };
}

function whichAll(cmd: string, env: NodeJS.ProcessEnv): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, cmd);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

async function findSneakoscopePackageRoot(start: string): Promise<string | null> {
  let current = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    const pkg = await readJson<any>(path.join(current, 'package.json'), null).catch(() => null);
    if (pkg?.name === 'sneakoscope') return await realpathOrSelf(current);
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return null;
}

async function packageVersion(root: string): Promise<string | null> {
  const pkg = await readJson<any>(path.join(root, 'package.json'), null).catch(() => null);
  return typeof pkg?.version === 'string' ? pkg.version : null;
}

function inferNpmPrefix(packageRootPath: string): string | null {
  const root = path.resolve(packageRootPath);
  const marker = `${path.sep}lib${path.sep}node_modules${path.sep}sneakoscope`;
  const markerIndex = root.lastIndexOf(marker);
  if (markerIndex > 0) return root.slice(0, markerIndex);
  const plainMarker = `${path.sep}node_modules${path.sep}sneakoscope`;
  const plainIndex = root.lastIndexOf(plainMarker);
  if (plainIndex > 0) return root.slice(0, plainIndex);
  return null;
}

async function npmPrefix(npmBin: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const result = await runProcess(npmBin, ['prefix', '-g', '--silent'], { env, timeoutMs: 2500, maxOutputBytes: 4096 }).catch(() => null);
  return result?.code === 0 ? String(result.stdout || '').trim().split(/\r?\n/).pop() || null : null;
}

async function npmRoot(npmBin: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const result = await runProcess(npmBin, ['root', '-g', '--silent'], { env, timeoutMs: 2500, maxOutputBytes: 4096 }).catch(() => null);
  return result?.code === 0 ? String(result.stdout || '').trim().split(/\r?\n/).pop() || null : null;
}

function dedupeCandidates(candidates: GlobalSksInstallCandidate[]): GlobalSksInstallCandidate[] {
  const map = new Map<string, GlobalSksInstallCandidate>();
  for (const candidate of candidates) {
    const key = candidate.package_root || candidate.real_bin || candidate.bin || `${candidate.source}:${map.size}`;
    const prior = map.get(key);
    if (!prior) map.set(key, candidate);
    else map.set(key, {
      ...prior,
      bin: prior.bin || candidate.bin,
      real_bin: prior.real_bin || candidate.real_bin,
      prefix: prior.prefix || candidate.prefix,
      version: prior.version || candidate.version,
      source: `${prior.source},${candidate.source}`,
      source_repo_exempt: prior.source_repo_exempt || candidate.source_repo_exempt
    });
  }
  return [...map.values()];
}

function scoreCandidate(candidate: GlobalSksInstallCandidate): number {
  return (candidate.bin ? 2 : 0) + (candidate.prefix ? 1 : 0);
}

async function realpathOrSelf(value: string): Promise<string> {
  try {
    return await fsp.realpath(value);
  } catch {
    return path.resolve(value);
  }
}

function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && path.resolve(a) === path.resolve(b));
}

function insidePath(value: string | null | undefined, root: string | null | undefined): boolean {
  if (!value || !root) return false;
  const rel = path.relative(path.resolve(root), path.resolve(value));
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function currentSourceCandidate(sourceRoot = packageRoot()): GlobalSksInstallCandidate {
  return {
    bin: path.join(sourceRoot, 'dist', 'bin', 'sks.js'),
    real_bin: path.join(sourceRoot, 'dist', 'bin', 'sks.js'),
    package_root: sourceRoot,
    prefix: null,
    version: PACKAGE_VERSION,
    source: 'source-root',
    source_repo_exempt: true,
    keep: true,
    remove: false,
    reason: 'source_repo_exempt'
  };
}
