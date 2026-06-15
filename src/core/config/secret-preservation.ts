import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureDir, nowIso, readJson, readText, sha256, writeJsonAtomic } from '../fsx.js';
import { PROTECTED_SECRET_KEYS, PROTECTED_SUPABASE_ENV_KEYS } from './supabase-secret-preservation.js';

export interface SecretFingerprint {
  key: string;
  source: string;
  present: boolean;
  redacted_preview: string;
  value_sha256: string | null;
}

export interface SecretPreservationSnapshot {
  schema: 'sks.secret-preservation-snapshot.v1';
  generated_at: string;
  root: string;
  fingerprints: SecretFingerprint[];
}

export interface SecretPreservationGuardReport {
  schema: 'sks.secret-preservation-guard.v1';
  generated_at: string;
  ok: boolean;
  operation: string;
  before_path: string;
  after_path: string;
  restored_keys_count: number;
  missing_after: Array<{ key: string; source: string }>;
  raw_values_recorded: false;
}

export async function captureSecretPreservationSnapshot(input: {
  root: string;
  artifactPath?: string | null;
}): Promise<SecretPreservationSnapshot> {
  const root = path.resolve(input.root);
  const sources = secretSources(root);
  const fingerprints: SecretFingerprint[] = [];
  for (const source of sources) {
    const text = await readText(source, null);
    if (typeof text !== 'string') continue;
    if (source.endsWith('.json')) {
      const json = await readJson<Record<string, unknown>>(source, {}).catch(() => ({}));
      fingerprints.push(...fingerprintsFromObject(json, source));
    } else {
      fingerprints.push(...fingerprintsFromText(text, source));
    }
  }
  const snapshot: SecretPreservationSnapshot = {
    schema: 'sks.secret-preservation-snapshot.v1',
    generated_at: nowIso(),
    root,
    fingerprints: dedupeFingerprints(fingerprints)
  };
  if (input.artifactPath) await writeJsonAtomic(input.artifactPath, snapshot).catch(() => undefined);
  return snapshot;
}

export async function withSecretPreservationGuard<T>(
  root: string,
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  const resolvedRoot = path.resolve(root);
  const reportDir = path.join(resolvedRoot, '.sneakoscope', 'reports');
  await ensureDir(reportDir);
  const beforePath = path.join(reportDir, 'secret-preservation-before.json');
  const afterPath = path.join(reportDir, 'secret-preservation-after.json');
  const guardPath = path.join(reportDir, 'secret-preservation-guard.json');
  const before = await captureSecretPreservationSnapshot({ root: resolvedRoot, artifactPath: beforePath });
  let result: T;
  try {
    result = await fn();
  } catch (err: unknown) {
    await writeJsonAtomic(guardPath, {
      schema: 'sks.secret-preservation-guard.v1',
      generated_at: nowIso(),
      ok: false,
      operation: operationName,
      before_path: beforePath,
      after_path: null,
      restored_keys_count: 0,
      missing_after: [],
      raw_values_recorded: false,
      operation_error: err instanceof Error ? err.message : String(err)
    }).catch(() => undefined);
    throw err;
  }
  const after = await captureSecretPreservationSnapshot({ root: resolvedRoot, artifactPath: afterPath });
  const missing = missingProtectedSecrets(before, after);
  const report: SecretPreservationGuardReport = {
    schema: 'sks.secret-preservation-guard.v1',
    generated_at: nowIso(),
    ok: missing.length === 0,
    operation: operationName,
    before_path: beforePath,
    after_path: afterPath,
    restored_keys_count: 0,
    missing_after: missing,
    raw_values_recorded: false
  };
  await writeJsonAtomic(guardPath, report).catch(() => undefined);
  if (missing.length) {
    throw new Error(`secret_preservation_failed:${missing.map((item) => `${item.source}:${item.key}`).join(',')}`);
  }
  return result;
}

export function missingProtectedSecrets(before: SecretPreservationSnapshot, after: SecretPreservationSnapshot): Array<{ key: string; source: string }> {
  const afterMap = new Map(after.fingerprints.filter((fp) => fp.present).map((fp) => [`${fp.source}\0${fp.key}`, fp]));
  return before.fingerprints
    .filter((fp) => fp.present && fp.value_sha256)
    .filter((fp) => !afterMap.has(`${fp.source}\0${fp.key}`))
    .map((fp) => ({ key: fp.key, source: fp.source }));
}

function secretSources(root: string): string[] {
  const home = process.env.HOME || os.homedir();
  return [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.sneakoscope/config.json',
    '.codex/config.toml'
  ].map((rel) => path.join(root, rel)).concat(path.join(home, '.codex', 'config.toml'));
}

function fingerprintsFromText(text: string, source: string): SecretFingerprint[] {
  const rows: SecretFingerprint[] = [];
  for (const key of PROTECTED_SECRET_KEYS) {
    const value = readAssignment(text, key);
    if (!value) continue;
    rows.push(fingerprint(String(key), source, value));
  }
  for (const envKey of PROTECTED_SUPABASE_ENV_KEYS) {
    const value = readAssignment(text, envKey);
    if (value) rows.push(fingerprint(envKey, source, value));
  }
  return rows;
}

function fingerprintsFromObject(value: unknown, source: string): SecretFingerprint[] {
  const flat = flattenObject(value);
  const rows: SecretFingerprint[] = [];
  for (const [key, raw] of Object.entries(flat)) {
    if (!PROTECTED_SECRET_KEYS.includes(key as never)) continue;
    rows.push(fingerprint(key, source, String(raw)));
  }
  return rows;
}

function fingerprint(key: string, source: string, value: string): SecretFingerprint {
  return {
    key,
    source,
    present: Boolean(value),
    redacted_preview: redactPreview(value),
    value_sha256: value ? sha256(value) : null
  };
}

function readAssignment(text: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*(?:export\\s+)?${escaped.replace(/\\\./g, '\\s*\\.\\s*')}\\s*=\\s*(.+?)\\s*$`, 'm');
  const raw = String(text || '').match(re)?.[1]?.trim() || '';
  return unquote(raw);
}

function unquote(value: string): string {
  const trimmed = String(value || '').trim().replace(/\s+#.*$/, '');
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function redactPreview(value: string): string {
  const text = String(value || '');
  if (!text) return '';
  const head = text.slice(0, Math.min(3, text.length));
  const tail = text.length > 6 ? text.slice(-3) : '';
  return `${head}...${tail || 'redacted'}(${text.length})`;
}

function flattenObject(value: unknown, prefix = ''): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) Object.assign(out, flattenObject(child, nextKey));
    else if (child != null) out[nextKey] = String(child);
  }
  return out;
}

function dedupeFingerprints(fingerprints: SecretFingerprint[]): SecretFingerprint[] {
  const byKey = new Map<string, SecretFingerprint>();
  for (const fp of fingerprints) byKey.set(`${fp.source}\0${fp.key}`, fp);
  return [...byKey.values()].sort((a, b) => a.source.localeCompare(b.source) || a.key.localeCompare(b.key));
}
