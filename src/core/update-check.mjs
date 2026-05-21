import { PACKAGE_VERSION, runProcess, which } from './fsx.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';

export async function runSksUpdateCheck(options = {}) {
  const packageName = options.packageName || 'sneakoscope';
  const current = options.currentVersion || PACKAGE_VERSION;
  const registry = options.registry || DEFAULT_REGISTRY;
  const env = options.env || process.env;
  const override = env[versionOverrideEnvName(packageName)];
  if (override) return buildResult({ packageName, current, latest: override, registry, npmBin: null });

  const npmBin = options.npmBin === undefined ? await which('npm') : options.npmBin;
  if (!npmBin) {
    return buildResult({
      packageName,
      current,
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
  }).catch((err) => ({
    code: 1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err)
  }));
  if (result.code !== 0) {
    return buildResult({
      packageName,
      current,
      latest: null,
      registry,
      npmBin,
      error: `${result.stderr || result.stdout || 'npm view failed'}`.trim()
    });
  }
  return buildResult({
    packageName,
    current,
    latest: String(result.stdout || '').trim().split(/\s+/).pop() || null,
    registry,
    npmBin
  });
}

export function formatSksUpdateCheckText(result) {
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

export function comparePackageVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function buildResult(input) {
  const updateAvailable = Boolean(input.latest && comparePackageVersions(input.latest, input.current) > 0);
  return {
    schema: 'sks.update-check.v2',
    package: input.packageName,
    current: input.current,
    runtime_current: PACKAGE_VERSION,
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

function versionOverrideEnvName(packageName) {
  return `SKS_NPM_VIEW_${packageName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
}
