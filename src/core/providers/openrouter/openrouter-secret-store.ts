import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OpenRouterKeyRecord, OpenRouterKeyResolution } from './openrouter-types.js';
import { redactOpenRouterKey } from '../../security/redact-secrets.js';

export const OPENROUTER_KEY_ENV_NAMES = ['OPENROUTER_API_KEY', 'SKS_OPENROUTER_API_KEY'] as const;

export interface OpenRouterSecretPaths {
  readonly sksHome: string;
  readonly secretDir: string;
  readonly keyPath: string;
  readonly metadataPath: string;
}

export function openRouterSecretPaths(env: NodeJS.ProcessEnv = process.env): OpenRouterSecretPaths {
  const sksHome = path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope'));
  const secretDir = path.join(sksHome, 'secrets');
  return {
    sksHome,
    secretDir,
    keyPath: path.join(secretDir, 'openrouter-api-key'),
    metadataPath: path.join(secretDir, 'openrouter-api-key.json')
  };
}

export async function resolveOpenRouterApiKey(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly paths?: OpenRouterSecretPaths;
} = {}): Promise<OpenRouterKeyResolution> {
  const env = input.env || process.env;
  for (const name of OPENROUTER_KEY_ENV_NAMES) {
    const value = String(env[name] || '').trim();
    if (value) {
      return {
        key: value,
        source: 'env',
        env_var: name,
        key_preview: redactOpenRouterKey(value),
        blockers: [],
        warnings: name === 'OPENROUTER_API_KEY' ? [] : ['using_sks_openrouter_api_key_env']
      };
    }
  }
  const stored = await readStoredOpenRouterKey(input.paths || openRouterSecretPaths(env));
  if (stored) {
    return {
      key: stored,
      source: 'user-secret-store',
      key_preview: redactOpenRouterKey(stored),
      blockers: [],
      warnings: []
    };
  }
  return {
    key: null,
    source: null,
    key_preview: null,
    blockers: ['glm_missing_openrouter_key'],
    warnings: []
  };
}

export async function readStoredOpenRouterKey(paths: OpenRouterSecretPaths): Promise<string | null> {
  try {
    const text = await fs.readFile(paths.keyPath, 'utf8');
    const key = text.trim();
    return key || null;
  } catch {
    return null;
  }
}

export async function writeStoredOpenRouterKey(
  value: string,
  input: {
    readonly paths?: OpenRouterSecretPaths;
    readonly nowIso?: () => string;
    readonly previousRecord?: OpenRouterKeyRecord | null;
  } = {}
): Promise<OpenRouterKeyRecord> {
  const key = value.trim();
  if (!key) throw new Error('OpenRouter key is empty.');
  const paths = input.paths || openRouterSecretPaths();
  const now = (input.nowIso || (() => new Date().toISOString()))();
  const previous = input.previousRecord ?? await readOpenRouterKeyRecord(paths);
  await ensureSecretDir(paths.secretDir);
  const tmp = `${paths.keyPath}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  try {
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(`${key}\n`, 'utf8');
      await handle.sync().catch(() => undefined);
    } finally {
      await handle.close().catch(() => undefined);
    }
    await fs.chmod(tmp, 0o600).catch(() => undefined);
    await fs.rename(tmp, paths.keyPath);
    await fs.chmod(paths.keyPath, 0o600).catch(() => undefined);
  } catch (err: unknown) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
  const record: OpenRouterKeyRecord = {
    schema: 'sks.openrouter-key.v1',
    created_at: previous?.created_at || now,
    updated_at: now,
    key_hash: crypto.createHash('sha256').update(key).digest('hex'),
    key_preview: redactOpenRouterKey(key)
  };
  await fs.writeFile(paths.metadataPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(paths.metadataPath, 0o600).catch(() => undefined);
  return record;
}

export async function readOpenRouterKeyRecord(paths: OpenRouterSecretPaths): Promise<OpenRouterKeyRecord | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(paths.metadataPath, 'utf8')) as Partial<OpenRouterKeyRecord>;
    if (parsed.schema !== 'sks.openrouter-key.v1' || !parsed.key_hash || !parsed.key_preview) return null;
    return parsed as OpenRouterKeyRecord;
  } catch {
    return null;
  }
}

async function ensureSecretDir(secretDir: string): Promise<void> {
  await fs.mkdir(secretDir, { recursive: true, mode: 0o700 });
  await fs.chmod(secretDir, 0o700).catch(() => undefined);
}
