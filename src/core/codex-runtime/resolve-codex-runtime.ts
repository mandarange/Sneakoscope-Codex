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
  readonly trusted?: boolean;
  readonly trust_basis?: 'macos_codesign_openai_team_2DC432GLL2' | 'official_package_pin';
}

export interface CodexRuntimeResolution {
  readonly ok: boolean;
  readonly identity: CodexRuntimeIdentity | null;
  readonly blockers: readonly string[];
  readonly candidates: ReadonlyArray<{ source: CodexRuntimeSource; path: string; exists: boolean }>;
}

const OFFICIAL_CODEX_PACKAGE = '@openai/codex';
const OFFICIAL_CODEX_SDK_PACKAGE = '@openai/codex-sdk';

interface OfficialCodexPlatformRuntime {
  readonly packageName: string;
  readonly targetTriple: string;
  readonly versionSuffix: string;
  readonly binaryName: string;
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

export async function resolveOfficialCodexPackageRuntime(input: {
  readonly requestedBy?: string;
} = {}): Promise<CodexRuntimeResolution> {
  const requestedBy = input.requestedBy || 'official-codex-package-runtime-resolver';
  const root = packageRoot();
  const nodeModulesRoot = path.join(root, 'node_modules');
  const basePackageRoot = path.join(nodeModulesRoot, '@openai', 'codex');
  const basePackageJsonPath = path.join(basePackageRoot, 'package.json');
  const platformRuntime = officialCodexPlatformRuntime();
  if (!platformRuntime) {
    return officialRuntimeBlocked(basePackageRoot, 'codex_sdk_official_runtime_platform_unsupported');
  }
  const nativePackageRoot = path.join(nodeModulesRoot, ...platformRuntime.packageName.split('/'));
  const nativeBinaryPath = path.join(
    nativePackageRoot,
    'vendor',
    platformRuntime.targetTriple,
    'bin',
    platformRuntime.binaryName
  );
  const basePackageManifest = await readPackageManifest(basePackageJsonPath);
  if (!basePackageManifest) {
    return officialRuntimeBlocked(
      nativeBinaryPath,
      await exists(basePackageJsonPath)
        ? 'codex_sdk_official_runtime_package_manifest_invalid'
        : 'codex_sdk_official_runtime_package_not_found'
    );
  }
  if (basePackageManifest.name !== OFFICIAL_CODEX_PACKAGE || typeof basePackageManifest.version !== 'string') {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_package_identity_mismatch');
  }

  const sdkPackageRoot = path.join(nodeModulesRoot, '@openai', 'codex-sdk');
  const sdkPackageJsonPath = path.join(sdkPackageRoot, 'package.json');
  const sdkManifest = await readPackageManifest(sdkPackageJsonPath);
  if (!sdkManifest || sdkManifest.name !== OFFICIAL_CODEX_SDK_PACKAGE) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_sdk_package_identity_mismatch');
  }
  const sdkDependencies = recordValue(sdkManifest.dependencies);
  if (sdkDependencies?.[OFFICIAL_CODEX_PACKAGE] !== basePackageManifest.version) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_version_mismatch');
  }

  const optionalDependencies = recordValue(basePackageManifest.optionalDependencies);
  const expectedNativeVersion = `${basePackageManifest.version}-${platformRuntime.versionSuffix}`;
  const expectedNativeAlias = `npm:${OFFICIAL_CODEX_PACKAGE}@${expectedNativeVersion}`;
  if (optionalDependencies?.[platformRuntime.packageName] !== expectedNativeAlias) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_platform_package_mismatch');
  }
  const nativePackageJsonPath = path.join(nativePackageRoot, 'package.json');
  const nativePackageManifest = await readPackageManifest(nativePackageJsonPath);
  if (
    !nativePackageManifest
    || nativePackageManifest.name !== OFFICIAL_CODEX_PACKAGE
    || nativePackageManifest.version !== expectedNativeVersion
  ) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_platform_package_mismatch');
  }
  const runtimeMetadataPath = path.join(nativePackageRoot, 'vendor', platformRuntime.targetTriple, 'codex-package.json');
  const runtimeMetadata = await readPackageManifest(runtimeMetadataPath);
  if (
    runtimeMetadata?.version !== basePackageManifest.version
    || runtimeMetadata.target !== platformRuntime.targetTriple
    || runtimeMetadata.variant !== 'codex'
    || runtimeMetadata.entrypoint !== `bin/${platformRuntime.binaryName}`
  ) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_metadata_mismatch');
  }
  const candidateExists = await exists(nativeBinaryPath);
  if (!candidateExists) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_binary_missing');
  }

  let canonicalNodeModulesRoot: string;
  let canonicalBasePackageRoot: string;
  let canonicalSdkPackageRoot: string;
  let canonicalNativePackageRoot: string;
  let canonicalBinaryPath: string;
  try {
    [
      canonicalNodeModulesRoot,
      canonicalBasePackageRoot,
      canonicalSdkPackageRoot,
      canonicalNativePackageRoot,
      canonicalBinaryPath
    ] = await Promise.all([
      fsp.realpath(nodeModulesRoot),
      fsp.realpath(basePackageRoot),
      fsp.realpath(sdkPackageRoot),
      fsp.realpath(nativePackageRoot),
      fsp.realpath(nativeBinaryPath)
    ]);
  } catch {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_binary_missing', candidateExists);
  }
  if (
    !pathIsWithin(canonicalNodeModulesRoot, canonicalBasePackageRoot)
    || !pathIsWithin(canonicalNodeModulesRoot, canonicalSdkPackageRoot)
    || !pathIsWithin(canonicalNodeModulesRoot, canonicalNativePackageRoot)
  ) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_package_path_mismatch', candidateExists);
  }
  if (!pathIsWithin(canonicalNativePackageRoot, canonicalBinaryPath)) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_binary_path_mismatch', candidateExists);
  }
  const binaryStat = await fsp.stat(canonicalBinaryPath).catch(() => null);
  if (!binaryStat?.isFile()) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_binary_path_mismatch', candidateExists);
  }

  const trust = await verifyOfficialCodexRuntimeTrust(canonicalBinaryPath);
  if (!trust.ok) {
    return officialRuntimeBlocked(nativeBinaryPath, trust.blocker, candidateExists);
  }

  let identity: CodexRuntimeIdentity;
  try {
    identity = {
      ...await codexRuntimeIdentity(nativeBinaryPath, 'project', requestedBy),
      trusted: true,
      trust_basis: trust.trustBasis
    };
  } catch {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_binary_unusable', candidateExists);
  }
  if (
    identity.realpath !== canonicalBinaryPath
    || identity.packageRoot !== canonicalNativePackageRoot
    || identity.packageVersion !== expectedNativeVersion
    || identity.version !== basePackageManifest.version
  ) {
    return officialRuntimeBlocked(nativeBinaryPath, 'codex_sdk_official_runtime_package_identity_mismatch', candidateExists);
  }
  return {
    ok: true,
    identity,
    blockers: [],
    candidates: [{ source: 'project', path: nativeBinaryPath, exists: candidateExists }]
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

async function readPackageManifest(file: string): Promise<Record<string, unknown> | null> {
  try {
    return recordValue(JSON.parse(await fsp.readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function officialCodexPlatformRuntime(): OfficialCodexPlatformRuntime | null {
  const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { packageName: '@openai/codex-darwin-arm64', targetTriple: 'aarch64-apple-darwin', versionSuffix: 'darwin-arm64', binaryName };
  }
  if (process.platform === 'darwin' && process.arch === 'x64') {
    return { packageName: '@openai/codex-darwin-x64', targetTriple: 'x86_64-apple-darwin', versionSuffix: 'darwin-x64', binaryName };
  }
  if (process.platform === 'linux' && process.arch === 'arm64') {
    return { packageName: '@openai/codex-linux-arm64', targetTriple: 'aarch64-unknown-linux-musl', versionSuffix: 'linux-arm64', binaryName };
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return { packageName: '@openai/codex-linux-x64', targetTriple: 'x86_64-unknown-linux-musl', versionSuffix: 'linux-x64', binaryName };
  }
  if (process.platform === 'win32' && process.arch === 'arm64') {
    return { packageName: '@openai/codex-win32-arm64', targetTriple: 'aarch64-pc-windows-msvc', versionSuffix: 'win32-arm64', binaryName };
  }
  if (process.platform === 'win32' && process.arch === 'x64') {
    return { packageName: '@openai/codex-win32-x64', targetTriple: 'x86_64-pc-windows-msvc', versionSuffix: 'win32-x64', binaryName };
  }
  return null;
}

function pathIsWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function verifyOfficialCodexRuntimeTrust(binaryPath: string): Promise<
  | { ok: true; trustBasis: 'macos_codesign_openai_team_2DC432GLL2' | 'official_package_pin' }
  | { ok: false; blocker: string }
> {
  if (process.platform !== 'darwin') {
    return { ok: true, trustBasis: 'official_package_pin' };
  }
  const codesign = '/usr/bin/codesign';
  if (!await exists(codesign)) {
    return { ok: false, blocker: 'codex_sdk_official_runtime_codesign_tool_unavailable' };
  }
  const verified = await runProcess(codesign, ['--verify', '--deep', '--strict', binaryPath], {
    timeoutMs: 15_000,
    maxOutputBytes: 64 * 1024
  }).catch(() => null);
  if (!verified || verified.code !== 0 || verified.timedOut) {
    return { ok: false, blocker: 'codex_sdk_official_runtime_codesign_verify_failed' };
  }
  const described = await runProcess(codesign, ['-dv', '--verbose=4', binaryPath], {
    timeoutMs: 15_000,
    maxOutputBytes: 64 * 1024
  }).catch(() => null);
  if (!described || described.code !== 0 || described.timedOut) {
    return { ok: false, blocker: 'codex_sdk_official_runtime_codesign_identity_unavailable' };
  }
  const details = `${described.stdout || ''}\n${described.stderr || ''}`;
  const identityMatches = /^Identifier=codex$/m.test(details)
    && /^TeamIdentifier=2DC432GLL2$/m.test(details)
    && /^Authority=.*OpenAI.*\(2DC432GLL2\)$/m.test(details);
  if (!identityMatches) {
    return { ok: false, blocker: 'codex_sdk_official_runtime_codesign_identity_mismatch' };
  }
  return { ok: true, trustBasis: 'macos_codesign_openai_team_2DC432GLL2' };
}

function officialRuntimeBlocked(
  binaryPath: string,
  blocker: string,
  candidateExists = false
): CodexRuntimeResolution {
  return {
    ok: false,
    identity: null,
    blockers: [blocker],
    candidates: [{ source: 'project', path: binaryPath, exists: candidateExists }]
  };
}
