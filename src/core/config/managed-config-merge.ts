import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { isProtectedSecretKey, PROTECTED_SECRET_KEYS } from './supabase-secret-preservation.js';

export interface ManagedConfigMergeResult {
  schema: 'sks.managed-config-merge.v1';
  generated_at: string;
  ok: boolean;
  path: string;
  format: 'json' | 'toml' | 'env';
  changed: boolean;
  backup_path: string | null;
  protected_keys_preserved: string[];
  preserved_secret_lines_sha256: string[];
  idempotent: boolean;
  blockers: string[];
}

export async function writeManagedJsonConfig(file: string, current: Record<string, unknown>, managed: Record<string, unknown>): Promise<ManagedConfigMergeResult> {
  const next = safeMergeObject(current, managed);
  const before = `${JSON.stringify(current, null, 2)}\n`;
  const after = `${JSON.stringify(next, null, 2)}\n`;
  return writeMergedText(file, before, after, 'json', protectedKeysPresent(current));
}

export async function writeManagedTomlConfig(file: string, currentText: string, managedBlocks: string[]): Promise<ManagedConfigMergeResult> {
  let next = String(currentText || '').trimEnd();
  for (const block of managedBlocks) next = upsertTomlBlockPreservingSecrets(next, block);
  return writeMergedText(file, currentText, `${next.trim()}\n`, 'toml', protectedKeysInText(currentText));
}

export async function writeManagedEnvConfig(file: string, currentText: string, managedLines: string[]): Promise<ManagedConfigMergeResult> {
  const existingKeys = new Set(String(currentText || '').split(/\r?\n/).map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter((value): value is string => Boolean(value)));
  const additions = managedLines.filter((line) => {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1] || '';
    return key && !existingKeys.has(key) && !isProtectedSecretKey(key);
  });
  const next = additions.length ? `${String(currentText || '').replace(/\s*$/, '\n')}${additions.join('\n')}\n` : String(currentText || '');
  return writeMergedText(file, currentText, next, 'env', protectedKeysInText(currentText));
}

export function safeMergeObject(current: Record<string, unknown>, managed: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(managed)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (isProtectedSecretKey(dotted) && current[key] != null) continue;
    if (isPlainObject(value) && isPlainObject(current[key])) out[key] = safeMergeObject(current[key] as Record<string, unknown>, value, dotted);
    else out[key] = value;
  }
  return out;
}

function upsertTomlBlockPreservingSecrets(text: string, block: string): string {
  const header = block.match(/^\s*\[([^\]]+)\]/)?.[1];
  if (!header) return text;
  const lines = String(text || '').trimEnd().split('\n');
  const start = lines.findIndex((line) => line.trim() === `[${header}]`);
  const blockLines = block.trim().split('\n');
  if (start === -1) return [...lines.filter((line) => line.length), '', ...blockLines].join('\n');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index] || '')) {
      end = index;
      break;
    }
  }
  const existingBody = lines.slice(start + 1, end);
  const nextBody = [...existingBody];
  for (const managedLine of blockLines.slice(1)) {
    const managedKey = managedLine.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1] || '';
    if (!managedKey) {
      if (!nextBody.includes(managedLine)) nextBody.push(managedLine);
      continue;
    }
    const existingIndex = nextBody.findIndex((line) => (line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1] || '') === managedKey);
    const protectedLine = isProtectedSecretKey(`${header}.${managedKey}`) || isProtectedSecretKey(managedKey);
    if (existingIndex === -1) nextBody.push(managedLine);
    else if (!protectedLine) nextBody[existingIndex] = managedLine;
  }
  lines.splice(start, end - start, blockLines[0] || `[${header}]`, ...nextBody);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function writeMergedText(
  file: string,
  before: string,
  after: string,
  format: ManagedConfigMergeResult['format'],
  preserved: string[]
): Promise<ManagedConfigMergeResult> {
  await ensureDir(path.dirname(file));
  let backupPath: string | null = null;
  if (before !== after) {
    if (before.trim()) {
      backupPath = `${file}.sks-managed-merge-${Date.now()}.bak`;
      await fs.writeFile(backupPath, before, 'utf8');
    }
    await writeTextAtomic(file, after);
  }
  const preservedSecretLineHashes = protectedSecretLineHashes(before);
  return {
    schema: 'sks.managed-config-merge.v1',
    generated_at: nowIso(),
    ok: true,
    path: file,
    format,
    changed: before !== after,
    backup_path: backupPath,
    protected_keys_preserved: preserved,
    preserved_secret_lines_sha256: preservedSecretLineHashes,
    idempotent: before === after || protectedSecretLineHashes(after).every((hash) => preservedSecretLineHashes.includes(hash)),
    blockers: []
  };
}

function protectedKeysPresent(value: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const key of PROTECTED_SECRET_KEYS) if (lookupPath(value, key) != null) found.push(String(key));
  return found;
}

function protectedKeysInText(text: string): string[] {
  const found = new Set<string>();
  for (const key of PROTECTED_SECRET_KEYS) {
    if (new RegExp(`(^|\\n)\\s*(?:export\\s+)?${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`).test(text)) found.add(String(key));
  }
  let section = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = String(sectionMatch[1] || '');
      continue;
    }
    const key = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1] || '';
    if (key && section && isProtectedSecretKey(`${section}.${key}`)) found.add(`${section}.${key}`);
  }
  return [...found].sort();
}

function protectedSecretLineHashes(text: string): string[] {
  const hashes: string[] = [];
  let section = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = String(sectionMatch[1] || '');
      continue;
    }
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_.-]+)\s*=/)?.[1] || '';
    if (!key) continue;
    if (isProtectedSecretKey(key) || (section && isProtectedSecretKey(`${section}.${key}`))) hashes.push(sha256(line));
  }
  return hashes.sort();
}

function lookupPath(value: Record<string, unknown>, dotted: string): unknown {
  let current: unknown = value;
  for (const part of dotted.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
