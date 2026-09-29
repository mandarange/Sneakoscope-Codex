import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface CodexAuthSnapshot {
  path: string;
  exists: boolean;
  sha256: string | null;
  semantic_fingerprint: string | null;
  mode: 'chatgpt_oauth' | 'openai_api_key' | 'mixed' | 'unknown' | 'missing';
  has_refresh_token: boolean;
  has_access_token: boolean;
  has_api_key: boolean;
}

export async function captureCodexAuthSnapshot(input: {
  home?: string;
  authPath?: string;
} = {}): Promise<CodexAuthSnapshot> {
  const home = input.home || process.env.HOME || os.homedir();
  const authPath = input.authPath || path.join(home, '.codex', 'auth.json');
  let bytes: Buffer;
  try {
    const stat = await fsp.lstat(authPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('desktop_auth_not_regular_file');
    bytes = await fsp.readFile(authPath);
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return {
        path: authPath,
        exists: false,
        sha256: null,
        semantic_fingerprint: null,
        mode: 'missing',
        has_refresh_token: false,
        has_access_token: false,
        has_api_key: false
      };
    }
    throw error;
  }

  const parsed = parseJsonObject(bytes.toString('utf8'));
  const hasRefreshToken = containsNamedSecret(parsed, /^(?:refresh_token|refreshToken)$/);
  const hasAccessToken = containsNamedSecret(parsed, /^(?:access_token|accessToken)$/);
  const hasIdToken = containsNamedSecret(parsed, /^(?:id_token|idToken)$/);
  const apiKey = findNamedSecret(parsed, /^(?:key|api_key|apiKey|openai_api_key|OPENAI_API_KEY)$/);
  const hasApiKey = Boolean(apiKey);
  const authMode = stringField(parsed, ['auth_mode', 'authMode', 'mode']).toLowerCase();
  const oauth = hasRefreshToken || hasAccessToken || hasIdToken || /chatgpt|oauth|browser/.test(authMode);
  const mode = oauth && hasApiKey
    ? 'mixed'
    : oauth
      ? 'chatgpt_oauth'
      : hasApiKey
        ? 'openai_api_key'
        : 'unknown';

  return {
    path: authPath,
    exists: true,
    sha256: sha256(bytes),
    semantic_fingerprint: oauth ? oauthSemanticFingerprint(parsed) : null,
    mode,
    has_refresh_token: hasRefreshToken,
    has_access_token: hasAccessToken,
    has_api_key: hasApiKey
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function containsNamedSecret(value: unknown, keyPattern: RegExp): boolean {
  return Boolean(findNamedSecret(value, keyPattern));
}

function findNamedSecret(value: unknown, keyPattern: RegExp): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, entry] of Object.entries(value)) {
    if (keyPattern.test(key) && typeof entry === 'string' && entry.trim()) return entry.trim();
    const nested = findNamedSecret(entry, keyPattern);
    if (nested) return nested;
  }
  return null;
}

function stringField(value: Record<string, unknown> | null, keys: string[]): string {
  if (!value) return '';
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'string') return entry;
  }
  return '';
}

function oauthSemanticFingerprint(parsed: Record<string, unknown> | null): string | null {
  const identity: Record<string, string> = {};
  collectIdentityFields(parsed, identity);
  for (const token of collectTokenValues(parsed, /^(?:id_token|idToken|access_token|accessToken)$/)) {
    collectIdentityFields(decodeJwtClaims(token), identity);
  }
  if (Object.keys(identity).length === 0) return null;
  const sortedIdentity = Object.fromEntries(
    Object.entries(identity).sort(([left], [right]) => left.localeCompare(right))
  );
  return sha256(JSON.stringify(sortedIdentity));
}

function collectIdentityFields(value: unknown, output: Record<string, string>): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      /^(?:sub|email|account_id|accountId|chatgpt_account_id|chatgptAccountId|user_id|userId|organization_id|organizationId)$/i.test(key)
      && (typeof entry === 'string' || typeof entry === 'number')
    ) {
      output[key.toLowerCase()] = String(entry);
    }
    if (typeof entry === 'object') collectIdentityFields(entry, output);
  }
}

function collectTokenValues(value: unknown, keyPattern: RegExp, output: string[] = []): string[] {
  if (!value || typeof value !== 'object') return output;
  for (const [key, entry] of Object.entries(value)) {
    if (keyPattern.test(key) && typeof entry === 'string' && entry.trim()) output.push(entry);
    else if (typeof entry === 'object') collectTokenValues(entry, keyPattern, output);
  }
  return output;
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return parseJsonObject(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
