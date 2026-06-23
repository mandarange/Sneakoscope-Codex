import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exists, packageRoot, runProcess, which } from '../fsx.js';
import { parseCodexVersionText } from '../codex-compat/codex-version-policy.js';

export type CodexRuntimeSource = 'explicit' | 'env' | 'project' | 'path' | 'global-diagnostic';

export interface CodexRuntimeIdentity {
  readonly requestedBy: string;
  readonly path: string;
  readonly realpath: string;
  readonly version: string;
  readonly source: CodexRuntimeSource;
  readonly sha256: string;
  readonly packageRoot: string | null;
  readonly packageVersion: string | null;
  readonly platform: string;
  readonly arch: string;
}

export interface CodexRuntimeResolution {
  readonly ok: boolean;
  readonly identity: CodexRuntimeIdentity | null;
  readonly blockers: readonly string[];
  readonly candidates: ReadonlyArray<{ source: CodexRuntimeSource; path: string; exists: boolean }>;
}

export async function resolveCodexRuntime(input: {
  readonly explicitPath?: string | null;
  readonly requestedBy?: string;
  readonly includeGlobalDiagnostics?: boolean;
} = {}): Promise<CodexRuntimeResolution> {
  const requestedBy = input.requestedBy || 'codex-runtime-resolver';
  const candidates = await codexRuntimeCandidates(input.explicitPath || null, Boolean(input.includeGlobalDiagnostics));
  const found = candidates.find((candidate) => candidate.exists);
  if (!found) {
    return {
      ok: false,
      identity: null,
      blockers: ['codex_runtime_not_found'],
      candidates
    };
  }
  const identity = await codexRuntimeIdentity(found.path, found.source, requestedBy);
  const blockers = identity.version ? [] : ['codex_runtime_version_unavailable'];
  return {
    ok: blockers.length === 0,
    identity,
    blockers,
    candidates
  };
}

export async function codexRuntimeCandidates(explicitPath: string | null, includeGlobalDiagnostics = false) {
  const rows: Array<{ source: CodexRuntimeSource; path: string; exists: boolean }> = [];
  const add = async (source: CodexRuntimeSource, value: unknown) => {
    const candidate = String(value || '').trim();
    if (!candidate) return;
    if (rows.some((row) => row.path === candidate)) return;
    rows.push({ source, path: candidate, exists: await exists(candidate) });
  };
  await add('explicit', explicitPath);
  await add('env', process.env.SKS_CODEX_BIN);
  await add('env', process.env.CODEX_BIN);
  await add('project', path.join(packageRoot(), 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex'));
  const pathCandidate = await which(process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await add(includeGlobalDiagnostics ? 'global-diagnostic' : 'path', pathCandidate);
  return rows;
}

async function codexRuntimeIdentity(bin: string, source: CodexRuntimeSource, requestedBy: string): Promise<CodexRuntimeIdentity> {
  const realpath = await fsp.realpath(bin);
  const versionText = await readCodexVersionText(realpath);
  const packageRootForBin = await findPackageRoot(realpath);
  const packageVersion = packageRootForBin ? await readPackageVersion(packageRootForBin) : null;
  return {
    requestedBy,
    path: bin,
    realpath,
    version: parseCodexVersionText(versionText) || '',
    source,
    sha256: await sha256File(realpath),
    packageRoot: packageRootForBin,
    packageVersion,
    platform: os.platform(),
    arch: os.arch()
  };
}

async function readCodexVersionText(bin: string): Promise<string> {
  const result = await runProcess(bin, ['--version'], { timeoutMs: 10_000, maxOutputBytes: 16 * 1024 }).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
    stdoutBytes: 0,
    stderrBytes: 0,
    truncated: false,
    timedOut: false
  }));
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

async function sha256File(file: string): Promise<string> {
  const data = await fsp.readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function findPackageRoot(startFile: string): Promise<string | null> {
  let dir = path.dirname(startFile);
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'package.json');
    if (await exists(candidate)) return dir;
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

async function readPackageVersion(root: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}
