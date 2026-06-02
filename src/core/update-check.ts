import path from 'node:path';
import { PACKAGE_VERSION, packageRoot, readJson, runProcess, which } from './fsx.js';

export interface SksUpdateCheckOptions {
  packageName?: string;
  currentVersion?: string;
  registry?: string;
  npmBin?: string | null;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface SksVersionCandidate {
  version: string;
  source: string;
}

export interface SksEffectiveVersionResult {
  current: string;
  runtime_current: string;
  package_root_current: string | null;
  path_current: string | null;
  npm_global_current: string | null;
  candidates: SksVersionCandidate[];
  errors: string[];
}

export interface SksUpdateCheckResult {
  schema: 'sks.update-check.v2';
  package: string;
  current: string;
  runtime_current: string;
  package_root_current: string | null;
  path_current: string | null;
  npm_global_current: string | null;
  version_candidates: SksVersionCandidate[];
  latest: string | null;
  update_available: boolean;
  status: 'current' | 'available' | 'unavailable';
  mode: 'function';
  route_required: false;
  pipeline_required: false;
  command: string | null;
  npm_bin: string | null;
  registry: string;
  error: string | null;
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

export async function runSksUpdateCheck(options: SksUpdateCheckOptions = {}): Promise<SksUpdateCheckResult> {
  const packageName = options.packageName || 'sneakoscope';
  const registry = options.registry || DEFAULT_REGISTRY;
  const env = options.env || process.env;
  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  const effectiveOptions: SksUpdateCheckOptions = {
    packageName,
    currentVersion: options.currentVersion || PACKAGE_VERSION,
    npmBin,
    env
  };
  if (options.timeoutMs !== undefined) effectiveOptions.timeoutMs = options.timeoutMs;
  if (options.maxOutputBytes !== undefined) effectiveOptions.maxOutputBytes = options.maxOutputBytes;
  const effective = await detectEffectiveSksVersion(effectiveOptions);
  const current = effective.current;
  const override = env[versionOverrideEnvName(packageName)];
  if (override) return buildResult({ packageName, current, effective, latest: override, registry, npmBin });

  if (!npmBin) {
    return buildResult({
      packageName,
      current,
      effective,
      latest: null,
      registry,
      npmBin: null,
      error: 'npm not found on PATH'
    });
  }

  const args = ['view', packageName, 'version', '--silent', '--registry', registry];
  const result = await runProcess(npmBin, args, {
    env,
    timeoutMs: options.timeoutMs ?? 5000,
    maxOutputBytes: options.maxOutputBytes ?? 4096
  }).catch((err: unknown) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err)
  }));
  if (result.code !== 0) {
    return buildResult({
      packageName,
      current,
      effective,
      latest: null,
      registry,
      npmBin,
      error: `${result.stderr || result.stdout || 'npm view failed'}`.trim()
    });
  }
  return buildResult({
    packageName,
    current,
    effective,
    latest: String(result.stdout || '').trim().split(/\s+/).pop() || null,
    registry,
    npmBin
  });
}

export async function detectEffectiveSksVersion(options: SksUpdateCheckOptions = {}): Promise<SksEffectiveVersionResult> {
  const packageName = options.packageName || 'sneakoscope';
  const env = options.env || process.env;
  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  const candidates: SksVersionCandidate[] = [];
  const errors: string[] = [];
  const add = (version: string | null | undefined, source: string) => {
    const parsed = parseVersionText(version || '');
    if (parsed) candidates.push({ version: parsed, source });
  };
  add(options.currentVersion || PACKAGE_VERSION, 'runtime');
  add(env.SKS_INSTALLED_SKS_VERSION, 'env:SKS_INSTALLED_SKS_VERSION');
  const pkg = await readJson<any>(path.join(packageRoot(), 'package.json'), {}).catch(() => ({}));
  add(pkg?.version, 'packageRoot:package.json');

  const sks = await which('sks').catch(() => null);
  if (sks) {
    const result = await runProcess(sks, ['--version'], {
      timeoutMs: 2000,
      maxOutputBytes: 4096,
      env: { ...env, SKS_DISABLE_UPDATE_CHECK: '1' }
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (result.code === 0) add(result.stdout, `PATH:${sks}`);
    else errors.push(`path_sks_version:${String(result.stderr || result.stdout || 'failed').trim()}`);
  }

  if (npmBin) {
    const npmGlobal = await detectNpmGlobalPackageVersion(npmBin, packageName, env, {
      timeoutMs: options.timeoutMs ?? 2500,
      maxOutputBytes: options.maxOutputBytes ?? 8192
    }).catch((err: any) => ({ version: null, error: err?.message || String(err) }));
    add(npmGlobal.version, `npm-global:${packageName}`);
    if (npmGlobal.error) errors.push(`npm_global_version:${npmGlobal.error}`);
  }

  const pathCandidate = candidates.find((candidate) => candidate.source.startsWith('PATH:'))?.version || null;
  const npmGlobalCandidate = candidates.find((candidate) => candidate.source.startsWith('npm-global:'))?.version || null;
  const packageRootCandidate = candidates.find((candidate) => candidate.source === 'packageRoot:package.json')?.version || null;
  const current = highestPackageVersion(candidates.map((candidate) => candidate.version));
  return {
    current,
    runtime_current: PACKAGE_VERSION,
    package_root_current: packageRootCandidate,
    path_current: pathCandidate,
    npm_global_current: npmGlobalCandidate,
    candidates,
    errors
  };
}

async function detectNpmGlobalPackageVersion(
  npmBin: string,
  packageName: string,
  env: NodeJS.ProcessEnv,
  opts: { timeoutMs: number; maxOutputBytes: number }
): Promise<{ version: string | null; error?: string }> {
  const result = await runProcess(npmBin, ['list', '-g', packageName, '--json', '--depth=0', '--silent'], {
    env,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: opts.maxOutputBytes
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (result.code === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      const version = parseVersionText(parsed?.dependencies?.[packageName]?.version || '');
      if (version) return { version };
    } catch {}
  }
  const rootResult = await runProcess(npmBin, ['root', '-g', '--silent'], {
    env,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: opts.maxOutputBytes
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const root = String(rootResult.stdout || '').trim().split(/\r?\n/).pop();
  if (root) {
    const pkg = await readJson<any>(path.join(root, packageName, 'package.json'), null).catch(() => null);
    const version = parseVersionText(pkg?.version || '');
    if (version) return { version };
  }
  return { version: null, error: String(result.stderr || result.stdout || rootResult.stderr || 'npm global package not found').trim() };
}

export function formatSksUpdateCheckText(result: SksUpdateCheckResult): string {
  const lines = [
    'Update Check',
    `Current: ${result.current}`,
    `Latest:  ${result.latest || 'unknown'}`,
    `Update:  ${result.update_available ? 'available' : 'not needed'}`
  ];
  if (result.error) lines.push(`Error:   ${result.error}`);
  if (result.command) lines.push(`Run:     ${result.command}`);
  lines.push('Mode:    function-only');
  return lines.join('\n');
}

export function comparePackageVersions(a: string | null | undefined, b: string | null | undefined): number {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function buildResult(input: {
  packageName: string;
  current: string;
  effective: SksEffectiveVersionResult;
  latest: string | null;
  registry: string;
  npmBin: string | null;
  error?: string | null;
}): SksUpdateCheckResult {
  const updateAvailable = Boolean(input.latest && comparePackageVersions(input.latest, input.current) > 0);
  return {
    schema: 'sks.update-check.v2',
    package: input.packageName,
    current: input.current,
    runtime_current: PACKAGE_VERSION,
    package_root_current: input.effective.package_root_current,
    path_current: input.effective.path_current,
    npm_global_current: input.effective.npm_global_current,
    version_candidates: input.effective.candidates,
    latest: input.latest,
    update_available: updateAvailable,
    status: input.error ? 'unavailable' : updateAvailable ? 'available' : 'current',
    mode: 'function',
    route_required: false,
    pipeline_required: false,
    command: updateAvailable ? `npm i -g ${input.packageName}@${input.latest} --registry ${input.registry}` : null,
    npm_bin: input.npmBin,
    registry: input.registry,
    error: input.error || null
  };
}

function versionOverrideEnvName(packageName: string): string {
  return `SKS_NPM_VIEW_${packageName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
}

function parseVersionText(text: string): string | null {
  const match = String(text || '').match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match ? match[0] : null;
}

function highestPackageVersion(versions: Array<string | null | undefined>): string {
  return versions
    .filter((version): version is string => typeof version === 'string' && version.length > 0)
    .reduce((best, candidate) => comparePackageVersions(candidate, best) > 0 ? candidate : best, '0.0.0');
}
