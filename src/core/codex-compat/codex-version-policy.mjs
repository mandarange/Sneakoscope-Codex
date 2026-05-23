export const CODEX_COMPAT_SCHEMA = 'sks.codex-compat.v1';
export const CODEX_REQUIRED_BASELINE_TAG = 'rust-v0.133.0';
export const CODEX_REQUIRED_VERSION = '0.133.0';
export const CODEX_HOOK_SCHEMA_BASELINE_TAG = 'latest';
export const CODEX_HOOK_SCHEMA_VERSION = 'main-2026-05-21';
export function compareSemverLike(a, b) {
    const pa = parseVersionParts(a);
    const pb = parseVersionParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length, 3); i += 1) {
        const left = pa[i] ?? 0;
        const right = pb[i] ?? 0;
        if (left > right)
            return 1;
        if (left < right)
            return -1;
    }
    return 0;
}
export function parseCodexVersionText(text) {
    const match = String(text || '').match(/\b(?:rust-v)?(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
    return match?.[1] ?? null;
}
export function codexVersionPolicy(detected = {}) {
    if (!detected.available || !detected.version) {
        return {
            ok: true,
            status: 'integration_optional',
            warnings: [`codex binary not detected; release checks use ${CODEX_REQUIRED_BASELINE_TAG} compatibility policy and vendored ${CODEX_HOOK_SCHEMA_BASELINE_TAG} hook snapshots`]
        };
    }
    if (compareSemverLike(detected.version, CODEX_REQUIRED_VERSION) >= 0) {
        return { ok: true, status: 'ok', warnings: [] };
    }
    return {
        ok: true,
        status: 'compatibility_degraded',
        warnings: [
            `detected Codex ${detected.version} from ${detected.source || 'unknown'}; upgrade to ${CODEX_REQUIRED_BASELINE_TAG} or newer`
        ]
    };
}
function parseVersionParts(value) {
    const parsed = parseCodexVersionText(value) || String(value || '0.0.0');
    return parsed.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
}
//# sourceMappingURL=codex-version-policy.js.map