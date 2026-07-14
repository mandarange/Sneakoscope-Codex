export interface ParsedSemVer {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
  build: string[];
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SEMVER_CANDIDATE = /(?:^|[^0-9A-Za-z])((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z+.-])/g;

export function parseSemVer(value: string | null | undefined): ParsedSemVer | null {
  const raw = String(value || '').trim();
  const match = raw.match(SEMVER);
  if (!match) return null;
  const prerelease = match[4]
    ? match[4].split('.').map((identifier) => /^\d+$/.test(identifier) ? Number(identifier) : identifier)
    : [];
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    build: match[5] ? match[5].split('.') : []
  };
}

export function extractSemVer(text: string | null | undefined): string | null {
  const source = String(text || '');
  for (const match of source.matchAll(SEMVER_CANDIDATE)) {
    const candidate = match[1] || '';
    if (parseSemVer(candidate)) return candidate;
  }
  return null;
}

export function compareSemVer(
  left: string | ParsedSemVer | null | undefined,
  right: string | ParsedSemVer | null | undefined
): number | null {
  const a = typeof left === 'string' || left == null ? parseSemVer(left) : left;
  const b = typeof right === 'string' || right == null ? parseSemVer(right) : right;
  if (!a || !b) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const ai = a.prerelease[index];
    const bi = b.prerelease[index];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    if (ai === bi) continue;
    if (typeof ai === 'number' && typeof bi === 'string') return -1;
    if (typeof ai === 'string' && typeof bi === 'number') return 1;
    return ai > bi ? 1 : -1;
  }
  return 0;
}

export function isSemVerUpdateAvailable(latest: string | null | undefined, current: string | null | undefined): boolean {
  return compareSemVer(latest, current) === 1;
}
