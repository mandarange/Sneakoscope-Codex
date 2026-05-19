import os from 'node:os';
import { containsPlaintextSecret, redactSecrets } from '../secret-redaction.js';

export function sharedRecordHasSecret(value: unknown): boolean {
  return containsPlaintextSecret(value);
}

export function redactSharedRecord<T>(value: T): T {
  return redactHomePaths(redactSecrets(value)) as T;
}

export function redactHomePaths(value: unknown): unknown {
  const home = os.homedir();
  if (!home) return value;
  if (typeof value === 'string') return value.split(home).join('~');
  if (Array.isArray(value)) return value.map((item) => redactHomePaths(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, candidate] of Object.entries(value)) out[key] = redactHomePaths(candidate);
    return out;
  }
  return value;
}

export function isMockPositiveSharedClaim(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const row = record as Record<string, unknown>;
  if (String(row.schema || '') !== 'sks.triwiki-claim-record.v1') return false;
  const status = String(row.status || 'verified_partial');
  if (status === 'verified_partial' || status === 'negative' || status === 'wrongness') return false;
  const text = JSON.stringify(record).toLowerCase();
  return /\b(mock|fixture|fake|stub)\b/.test(text);
}
