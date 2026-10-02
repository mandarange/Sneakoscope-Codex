import { CODEX_MIN_VERSION } from './codex-runtime-contract.js';

export const CODEX_COMPAT_SCHEMA = 'sks.codex-compat.v2';
export const CODEX_HOOK_SCHEMA_BASELINE_TAG = 'latest';
export const CODEX_HOOK_SCHEMA_VERSION = 'latest';

const UPDATE_CTA = 'prefer latest Codex CLI via `sks codex update` or Menu Bar / SKS Center → Update Codex CLI Now';

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

/** True when `version` parses and is at or above the supported floor. */
export function meetsCodexFloor(version: unknown): boolean {
  const parsed = parseCodexVersionText(version);
  return Boolean(parsed && compareSemverLike(parsed, CODEX_MIN_VERSION) >= 0);
}

export type CodexVersionPolicyStatus =
  | 'ok'
  | 'integration_optional'
  | 'blocked_below_minimum_supported';

/**
 * Supported-floor policy for a detected Codex. Newer runtimes are always accepted; a missing Codex is
 * optional for routes that do not invoke it; an installed Codex below the floor is rejected instead of
 * entering a compatibility path.
 */
export function codexVersionPolicy(
  detected: { available?: boolean; version?: string | null; source?: string | null } = {}
) {
  if (!detected.available || !detected.version) {
    return {
      ok: true,
      status: 'integration_optional' as CodexVersionPolicyStatus,
      minimum_supported_version: CODEX_MIN_VERSION,
      update_available_hint: true,
      warnings: [
        `codex binary not detected; release checks use vendored ${CODEX_HOOK_SCHEMA_BASELINE_TAG} hook snapshots`,
        UPDATE_CTA
      ]
    };
  }
  if (compareSemverLike(detected.version, CODEX_MIN_VERSION) >= 0) {
    return {
      ok: true,
      status: 'ok' as CodexVersionPolicyStatus,
      minimum_supported_version: CODEX_MIN_VERSION,
      update_available_hint: false,
      warnings: [] as string[]
    };
  }
  return {
    ok: false,
    status: 'blocked_below_minimum_supported' as CodexVersionPolicyStatus,
    minimum_supported_version: CODEX_MIN_VERSION,
    update_available_hint: true,
    warnings: [
      `detected Codex ${detected.version} from ${detected.source || 'unknown'}; below the supported minimum ${CODEX_MIN_VERSION}`,
      UPDATE_CTA
    ]
  };
}

/** Naruto spawn precheck: the resolved Codex must be known and at or above the supported floor. */
export function assertCodexFloor(version: unknown): { ok: boolean; blockers: string[]; guidance: string[] } {
  const detected = parseCodexVersionText(version);
  if (meetsCodexFloor(detected)) return { ok: true, blockers: [], guidance: [] };
  return {
    ok: false,
    blockers: [
      detected ? `codex_below_supported_floor:${detected}` : 'codex_version_unknown',
      'update_codex_cli'
    ],
    guidance: [
      'Update Codex CLI to the preferred latest: `sks codex update` or Menu Bar / SKS Center → Update Codex CLI Now.',
      `Naruto needs Codex ${CODEX_MIN_VERSION} or newer.`
    ]
  };
}

function parseVersionParts(value: unknown): number[] {
  const parsed = parseCodexVersionText(value) || String(value || '0.0.0');
  return parsed.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}
