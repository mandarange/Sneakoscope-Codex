import fs from 'node:fs';
import path from 'node:path';
import { hashJson } from '../triwiki/triwiki-cache-key.js';

export const PROBE_MEMOIZATION_SCHEMA = 'sks.probe-memoization.v1';

export interface ProbeMemoRecord<T> {
  schema: typeof PROBE_MEMOIZATION_SCHEMA;
  key: string;
  probe_id: string;
  created_at: string;
  expires_at: string;
  value: T;
  tool_version: string;
  file_hash?: string;
  env_allowlist_hash: string;
}

export function memoizeProbe<T>(input: {
  root: string;
  probeId: string;
  ttlMs: number;
  version: string;
  envAllowlist?: string[];
  fileHash?: string;
  run: () => T;
}): { value: T; reused: boolean; key: string } {
  const key = hashJson({
    probe_id: input.probeId,
    version: input.version,
    env: envPresence(input.envAllowlist || []),
    file_hash: input.fileHash || null
  });
  const file = probeCachePath(input.root, key);
  const existing = readProbeRecord<T>(file);
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) return { value: existing.value, reused: true, key };
  const value = input.run();
  const record: ProbeMemoRecord<T> = {
    schema: PROBE_MEMOIZATION_SCHEMA,
    key,
    probe_id: input.probeId,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + input.ttlMs).toISOString(),
    value,
    tool_version: input.version,
    ...(input.fileHash ? { file_hash: input.fileHash } : {}),
    env_allowlist_hash: hashJson(envPresence(input.envAllowlist || []))
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return { value, reused: false, key };
}

export async function memoizeProbeAsync<T>(input: {
  root: string;
  probeId: string;
  ttlMs: number;
  version: string;
  envAllowlist?: string[];
  fileHash?: string;
  run: () => Promise<T>;
}): Promise<{ value: T; reused: boolean; key: string }> {
  const key = hashJson({ probe_id: input.probeId, version: input.version, env: envPresence(input.envAllowlist || []), file_hash: input.fileHash || null });
  const file = probeCachePath(input.root, key);
  const existing = readProbeRecord<T>(file);
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    writeProbeReport(input.root, { repeated_probe_count: 1, reused_probe_count: 1, saved_ms_estimate: Math.max(1, input.ttlMs / 1000) });
    return { value: existing.value, reused: true, key };
  }
  const started = Date.now();
  const value = await input.run();
  const record: ProbeMemoRecord<T> = {
    schema: PROBE_MEMOIZATION_SCHEMA,
    key,
    probe_id: input.probeId,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + input.ttlMs).toISOString(),
    value,
    tool_version: input.version,
    ...(input.fileHash ? { file_hash: input.fileHash } : {}),
    env_allowlist_hash: hashJson(envPresence(input.envAllowlist || []))
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  writeProbeReport(input.root, { repeated_probe_count: 1, reused_probe_count: 0, saved_ms_estimate: Math.max(0, Date.now() - started) });
  return { value, reused: false, key };
}

function readProbeRecord<T>(file: string): ProbeMemoRecord<T> | null {
  try {
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as ProbeMemoRecord<T>;
    return json.schema === PROBE_MEMOIZATION_SCHEMA ? json : null;
  } catch {
    return null;
  }
}

function probeCachePath(root: string, key: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'probes', `${key}.json`);
}

function envPresence(keys: string[]): Array<{ name: string; present: boolean }> {
  return [...new Set(keys)].sort().map((name) => ({ name, present: process.env[name] !== undefined }));
}

function writeProbeReport(root: string, report: { repeated_probe_count: number; reused_probe_count: number; saved_ms_estimate: number }): void {
  const file = path.join(root, '.sneakoscope', 'reports', 'probe-memoization.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.probe-memoization-report.v1', ...report }, null, 2)}\n`);
}
