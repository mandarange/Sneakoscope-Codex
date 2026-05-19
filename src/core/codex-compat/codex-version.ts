import { runProcess, which } from '../fsx.js';
import { codexVersionPolicy, parseCodexVersionText } from './codex-version-policy.js';

export type CodexDetectedVersion = {
  available: boolean;
  version: string | null;
  source: string | null;
  raw?: string;
};

export async function detectCodexVersion(opts: any = {}): Promise<CodexDetectedVersion> {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  if (codexBin) {
    const fromVersion = await detectFromCommand(codexBin, ['--version'], 'codex --version', opts);
    if (fromVersion.version) return fromVersion;
    const fromHelp = await detectFromCommand(codexBin, ['--help'], 'codex --help', opts);
    if (fromHelp.version) return fromHelp;
  }

  const npmDetected = await detectFromNpm(opts);
  if (npmDetected.version) return npmDetected;

  const brewDetected = await detectFromBrew(opts);
  if (brewDetected.version) return brewDetected;

  return { available: false, version: null, source: null };
}

export async function codexVersionReport(opts: any = {}) {
  const detected = await detectCodexVersion(opts);
  const policy = codexVersionPolicy(detected);
  return {
    detected,
    policy
  };
}

async function detectFromCommand(bin: string, args: string[], source: string, opts: any): Promise<CodexDetectedVersion> {
  const result = await runProcess(bin, args, {
    timeoutMs: opts.timeoutMs || 3000,
    maxOutputBytes: 16 * 1024,
    env: opts.env || process.env
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  const raw = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const version = parseCodexVersionText(raw);
  return {
    available: Boolean(version),
    version,
    source: version ? source : null,
    raw
  };
}

async function detectFromNpm(opts: any): Promise<CodexDetectedVersion> {
  const npmBin = opts.npmBin || await which('npm').catch(() => null);
  if (!npmBin) return { available: false, version: null, source: null };
  const result = await runProcess(npmBin, ['list', '-g', '@openai/codex', '--json', '--depth=0'], {
    timeoutMs: opts.timeoutMs || 5000,
    maxOutputBytes: 64 * 1024,
    env: opts.env || process.env
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (!result.stdout) return { available: false, version: null, source: null, raw: result.stderr || '' };
  try {
    const parsed = JSON.parse(result.stdout);
    const version = parsed?.dependencies?.['@openai/codex']?.version || null;
    return { available: Boolean(version), version, source: version ? 'npm @openai/codex' : null, raw: result.stdout };
  } catch {
    return { available: false, version: null, source: null, raw: result.stdout };
  }
}

async function detectFromBrew(opts: any): Promise<CodexDetectedVersion> {
  const brewBin = opts.brewBin || await which('brew').catch(() => null);
  if (!brewBin) return { available: false, version: null, source: null };
  const result = await runProcess(brewBin, ['info', '--cask', 'codex', '--json=v2'], {
    timeoutMs: opts.timeoutMs || 5000,
    maxOutputBytes: 64 * 1024,
    env: opts.env || process.env
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  if (result.code !== 0 || !result.stdout) return { available: false, version: null, source: null, raw: result.stderr || '' };
  const parsed = await parseJsonText(result.stdout);
  const version = parsed?.casks?.[0]?.version || null;
  return { available: Boolean(version), version, source: version ? 'Homebrew cask codex' : null, raw: result.stdout };
}

async function parseJsonText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
