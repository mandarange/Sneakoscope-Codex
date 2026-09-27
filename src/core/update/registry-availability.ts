import { compareSemVer } from './semver.js';

/**
 * npm lists a new version before its tarball is served: publish answers "may
 * take a few minutes to become available", and for those minutes the version
 * document or the tarball still returns 404. A version is offered as an update
 * only once both answer, so `sks update` never starts an install npm cannot
 * serve yet.
 */

export type VersionDownloadability = 'downloadable' | 'not_yet_downloadable' | 'unknown';

export async function versionDownloadability(input: {
  registry: string;
  packageName: string;
  version: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<VersionDownloadability> {
  const env = input.env || process.env;
  if (!probeEnabled(env)) return 'unknown';
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? 4000;
  const base = input.registry.replace(/\/+$/, '');
  const name = input.packageName.replace('/', '%2F');
  try {
    const doc = await timed(fetchImpl, `${base}/${name}/${encodeURIComponent(input.version)}`, { headers: { accept: 'application/json' } }, timeoutMs);
    if (doc.status === 404) return 'not_yet_downloadable';
    if (!doc.ok) return 'unknown';
    const tarball = (await doc.json().catch(() => null) as any)?.dist?.tarball;
    if (typeof tarball !== 'string' || !/^https?:\/\//.test(tarball)) return 'unknown';
    const head = await timed(fetchImpl, tarball, { method: 'HEAD' }, timeoutMs);
    if (head.ok) return 'downloadable';
    return head.status === 404 ? 'not_yet_downloadable' : 'unknown';
  } catch {
    // Offline or a slow registry: say nothing rather than hide an update.
    return 'unknown';
  }
}

/**
 * The version to offer: the listed one when it is newer and npm serves it (or
 * its availability cannot be checked), else the current version, with the
 * listed one reported as pending.
 */
export async function offeredUpdateVersion(input: {
  listed: string | null;
  current: string;
  registry: string;
  packageName: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<{ latest: string | null; pending: string | null }> {
  const { listed, current } = input;
  if (!listed || (compareSemVer(listed, current) ?? 0) <= 0) return { latest: listed, pending: null };
  const state = await versionDownloadability({
    registry: input.registry,
    packageName: input.packageName,
    version: listed,
    ...(input.env ? { env: input.env } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
  return state === 'not_yet_downloadable' ? { latest: current, pending: listed } : { latest: listed, pending: null };
}

/** `SKS_UPDATE_TARBALL_PROBE=0` turns the probe off; tests enable it explicitly. */
function probeEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.SKS_UPDATE_TARBALL_PROBE;
  if (flag === '0') return false;
  if (flag === '1') return true;
  return !(env.NODE_TEST_CONTEXT || env.SKS_TEST_ISOLATION === '1');
}

async function timed(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
