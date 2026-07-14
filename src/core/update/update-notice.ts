import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { runSksUpdateStatus } from '../update-check.js';
import { persistKnownUpdateStatus, type SksUpdateStatusV3 } from './update-status.js';

export const SKS_UPDATE_NOTICE_SCHEMA = 'sks.update-notice.v1';

export interface SksUpdateNotice {
  schema: typeof SKS_UPDATE_NOTICE_SCHEMA;
  checked_at: string;
  package_name: string;
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  source: 'npm-registry' | 'cache' | 'disabled' | 'error';
  cache_ttl_ms: number;
  message: string;
  error?: string;
}

export async function persistSksUpdateNoticeFromVersions(input: {
  packageName?: string;
  currentVersion: string;
  latestVersion?: string | null;
  error?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<SksUpdateNotice> {
  const status = await persistKnownUpdateStatus({
    currentVersion: input.currentVersion,
    ...(input.packageName === undefined ? {} : { packageName: input.packageName }),
    ...(input.latestVersion === undefined ? {} : { latestVersion: input.latestVersion }),
    ...(input.error === undefined ? {} : { error: input.error }),
    ...(input.env === undefined ? {} : { env: input.env })
  });
  return noticeFromStatus(status, input.packageName || 'sneakoscope');
}

export async function checkSksUpdateNotice(input: {
  packageName?: string;
  currentVersion?: string;
  missionDir?: string | null;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
} = {}): Promise<SksUpdateNotice> {
  const env = input.env || process.env;
  const packageName = input.packageName || env.SKS_UPDATE_NOTICE_PACKAGE || 'sneakoscope';
  const currentVersion = input.currentVersion || env.SKS_PACKAGE_VERSION || '0.0.0';
  const status = await runSksUpdateStatus({
    packageName,
    currentVersion,
    env,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    refresh: false
  });
  const notice = noticeFromStatus(status, packageName);
  if (input.missionDir) await writeJsonAtomic(path.join(input.missionDir, 'update-notice.json'), notice).catch(() => undefined);
  return notice;
}

function noticeFromStatus(status: SksUpdateStatusV3, packageName: string): SksUpdateNotice {
  const current = status.sks.current || '0.0.0';
  const latest = status.sks.latest;
  const ttl = Math.max(0, Date.parse(status.expires_at) - Date.parse(status.generated_at));
  const source: SksUpdateNotice['source'] = status.source === 'live'
    ? 'npm-registry'
    : status.source === 'disabled'
      ? 'disabled'
      : status.source === 'error'
        ? 'error'
        : 'cache';
  const updateAvailable = source !== 'disabled' && status.sks.update_available;
  return {
    schema: SKS_UPDATE_NOTICE_SCHEMA,
    checked_at: status.generated_at,
    package_name: packageName,
    current_version: current,
    latest_version: latest,
    update_available: updateAvailable,
    source,
    cache_ttl_ms: ttl,
    message: source === 'disabled'
      ? 'SKS update notice disabled by environment.'
      : updateAvailable
      ? `SKS ${latest} is available; current ${current}.`
      : `SKS ${current} is current enough; update notice is informational.`,
    ...(status.public_error ? { error: status.public_error } : {})
  };
}
