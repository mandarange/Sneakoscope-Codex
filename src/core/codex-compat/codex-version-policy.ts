export const CODEX_COMPAT_SCHEMA = 'sks.codex-compat.v2';
export const CODEX_REQUIRED_BASELINE_TAG = 'rust-v0.136.0';
export const CODEX_REQUIRED_VERSION = '0.136.0';
export const CODEX_HOOK_SCHEMA_BASELINE_TAG = 'latest';
export const CODEX_HOOK_SCHEMA_VERSION = 'main-2026-06-01';

export function compareSemverLike(a: unknown, b: unknown): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
    const left = pa[i] ?? 0;
    const right = pb[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

export function parseCodexVersionText(text: unknown): string | null {
  const match = String(text || '').match(/\b(?:rust-v)?(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[1] ?? null;
}

export function requiredCodexVersionFromBaseline(value: unknown): string {
  return parseCodexVersionText(value) || CODEX_REQUIRED_VERSION;
}

export function codexVersionPolicy(detected: { available?: boolean; version?: string | null; source?: string | null } = {}, opts: { requiredBaseline?: string | null; explicitRequire?: boolean } = {}) {
  const requiredBaseline = opts.requiredBaseline || CODEX_REQUIRED_BASELINE_TAG;
  const requiredVersion = requiredCodexVersionFromBaseline(requiredBaseline);
  if (!detected.available || !detected.version) {
    return {
      ok: opts.explicitRequire === true ? false : true,
      status: opts.explicitRequire === true ? 'blocked_missing_required_codex' : 'integration_optional',
      required_baseline: requiredBaseline,
      required_version: requiredVersion,
      warnings: [`codex binary not detected; release checks use ${requiredBaseline} compatibility policy and vendored ${CODEX_HOOK_SCHEMA_BASELINE_TAG} hook snapshots`]
    };
  }
  if (compareSemverLike(detected.version, requiredVersion) >= 0) {
    return { ok: true, status: 'ok', required_baseline: requiredBaseline, required_version: requiredVersion, warnings: [] as string[] };
  }
  return {
    ok: false,
    status: 'blocked_below_required_baseline',
    required_baseline: requiredBaseline,
    required_version: requiredVersion,
    warnings: [
      `detected Codex ${detected.version} from ${detected.source || 'unknown'}; upgrade to ${requiredBaseline} or newer`
    ]
  };
}

function parseVersionParts(value: unknown): number[] {
  const parsed = parseCodexVersionText(value) || String(value || '0.0.0');
  return parsed.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}
