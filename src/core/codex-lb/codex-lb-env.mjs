import path from 'node:path';
import os from 'node:os';
import { exists, readText, runProcess, which } from '../fsx.mjs';

export function codexLbEnvPath(home = process.env.HOME || os.homedir()) {
  return path.join(String(home || os.homedir()), '.codex', 'sks-codex-lb.env');
}

export function legacyCodexLbEnvPath(home = process.env.HOME || os.homedir()) {
  return path.join(String(home || os.homedir()), '.codex', 'sks.env');
}

export function codexLbMetadataPath(home = process.env.HOME || os.homedir()) {
  return path.join(String(home || os.homedir()), '.codex', 'sks-codex-lb.json');
}

export function normalizeCodexLbBaseUrl(input = '') {
  let host = String(input || '').trim();
  if (!host) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`;
}

export async function loadCodexLbEnv(opts = {}) {
  const home = opts.home || process.env.HOME || os.homedir();
  const envPaths = [
    opts.envPath || codexLbEnvPath(home),
    opts.legacyEnvPath || legacyCodexLbEnvPath(home)
  ];
  const sourcePriority = ['process.env', 'keychain', 'env-file', 'legacy-env-file'];
  if (opts.allowProjectSecrets) sourcePriority.push('project-local');

  const processEnv = pickEnv(process.env);
  const envFile = await readEnvFile(envPaths[0]);
  const legacyEnv = await readEnvFile(envPaths[1]);
  const keychain = await readMacKeychain(opts);
  const projectLocal = opts.allowProjectSecrets ? await readEnvFile(path.join(opts.root || process.cwd(), '.env')) : {};

  const keySource = processEnv.apiKey ? 'process.env'
    : keychain.apiKey ? 'keychain'
      : envFile.apiKey ? 'env-file'
        : legacyEnv.apiKey ? 'legacy-env-file'
          : projectLocal.apiKey ? 'project-local'
            : 'missing';
  const apiKey = processEnv.apiKey || keychain.apiKey || envFile.apiKey || legacyEnv.apiKey || projectLocal.apiKey || '';
  const baseUrl = normalizeCodexLbBaseUrl(processEnv.baseUrl || envFile.baseUrl || legacyEnv.baseUrl || projectLocal.baseUrl || '');
  const missing = [
    ...(apiKey ? [] : ['CODEX_LB_API_KEY']),
    ...(baseUrl ? [] : ['CODEX_LB_BASE_URL'])
  ];
  return {
    schema: 'sks.codex-lb-env.v1',
    configured: missing.length === 0,
    missing,
    source: apiKey ? keySource : 'missing',
    source_priority: sourcePriority,
    base_url: baseUrl || null,
    api_key: {
      present: Boolean(apiKey),
      source: apiKey ? keySource : null,
      redacted: true,
      fingerprint: apiKey ? await sha256Prefix(apiKey) : null
    },
    secret_api_key: apiKey || null,
    env_paths: envPaths,
    keychain: {
      checked: keychain.checked,
      available: keychain.available,
      status: keychain.status
    }
  };
}

export async function writeCodexLbKeychain(apiKey, opts = {}) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, status: 'missing_api_key' };
  if (process.platform !== 'darwin' && !opts.forceMacos) return { ok: false, status: 'not_macos' };
  const security = opts.securityBin || await which('security').catch(() => null) || (await exists('/usr/bin/security') ? '/usr/bin/security' : null);
  if (!security) return { ok: false, status: 'keychain_unavailable' };
  const account = opts.account || process.env.USER || 'sks';
  const service = opts.service || 'sks-codex-lb';
  const result = await runProcess(security, ['add-generic-password', '-U', '-a', account, '-s', service, '-w', key], {
    timeoutMs: 5000,
    maxOutputBytes: 8192
  });
  return {
    ok: result.code === 0,
    status: result.code === 0 ? 'stored' : 'keychain_store_failed',
    account,
    service,
    error: result.code === 0 ? null : redactSecret(result.stderr || result.stdout || 'security add-generic-password failed', key)
  };
}

async function readMacKeychain(opts = {}) {
  if (process.platform !== 'darwin' && !opts.forceMacos) return { checked: false, available: false, status: 'not_macos', apiKey: '' };
  const security = opts.securityBin || await which('security').catch(() => null) || (await exists('/usr/bin/security') ? '/usr/bin/security' : null);
  if (!security) return { checked: true, available: false, status: 'keychain_unavailable', apiKey: '' };
  const account = opts.account || process.env.USER || 'sks';
  const service = opts.service || 'sks-codex-lb';
  const result = await runProcess(security, ['find-generic-password', '-a', account, '-s', service, '-w'], {
    timeoutMs: 5000,
    maxOutputBytes: 8192
  });
  const apiKey = result.code === 0 ? String(result.stdout || '').trim() : '';
  return { checked: true, available: true, status: apiKey ? 'found' : 'missing', apiKey };
}

async function readEnvFile(file) {
  const text = await readText(file, '');
  return {
    apiKey: parseShellEnvValue(text, 'CODEX_LB_API_KEY'),
    baseUrl: parseShellEnvValue(text, 'CODEX_LB_BASE_URL')
  };
}

function pickEnv(env) {
  return {
    apiKey: String(env.CODEX_LB_API_KEY || '').trim(),
    baseUrl: String(env.CODEX_LB_BASE_URL || '').trim()
  };
}

export function parseShellEnvValue(text = '', key = '') {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const envMatch = String(text || '').match(re);
  const raw = envMatch?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}

async function sha256Prefix(value) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function redactSecret(text, secret) {
  return String(text || '').split(String(secret || '')).join('[redacted]');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
