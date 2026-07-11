import path from 'node:path';
import os from 'node:os';
import { exists, readJson, readText, runProcess, which } from '../fsx.js';

export type CodexLbEnvSource = 'process.env' | 'keychain' | 'env-file' | 'legacy-env-file' | 'project-local' | 'missing';

export type CodexLbEnvLoadResult = {
  schema: 'sks.codex-lb-env.v1';
  configured: boolean;
  missing: string[];
  source: CodexLbEnvSource;
  source_priority: CodexLbEnvSource[];
  base_url: string | null;
  api_key: {
    present: boolean;
    source: CodexLbEnvSource | null;
    redacted: true;
    fingerprint: string | null;
  };
  secret_api_key: string | null;
  env_paths: string[];
  keychain: {
    checked: boolean;
    available: boolean;
    status: string;
  };
};

export type CodexLbModelCatalogResult = {
  schema: 'sks.codex-lb-model-catalog.v1';
  ok: boolean;
  status: 'ready' | 'blocked';
  models: string[];
  model_efforts: Record<string, string[]>;
  http_status: number | null;
  blockers: string[];
};

export function codexLbEnvPath(home: unknown = process.env.HOME || os.homedir()): string {
  return path.join(String(home || os.homedir()), '.codex', 'sks-codex-lb.env');
}

export function legacyCodexLbEnvPath(home: unknown = process.env.HOME || os.homedir()): string {
  return path.join(String(home || os.homedir()), '.codex', 'sks.env');
}

export function codexLbMetadataPath(home: unknown = process.env.HOME || os.homedir()): string {
  return path.join(String(home || os.homedir()), '.codex', 'sks-codex-lb.json');
}

export function codexLbHealthPath(home: unknown = process.env.HOME || os.homedir()): string {
  return path.join(String(home || os.homedir()), '.codex', 'sks-codex-lb-health.json');
}

export async function readLbHealth(home: unknown = process.env.HOME || os.homedir()) {
  const file = codexLbHealthPath(home);
  const raw = await readJson<any>(file, null);
  if (!raw || typeof raw !== 'object') return null;
  const degraded = Array.isArray(raw.degraded_models)
    ? raw.degraded_models.map((model: unknown) => String(model)).filter(Boolean)
    : [];
  return {
    ok: raw.ok !== false,
    degraded_models: degraded,
    quota_low: raw.quota_low === true,
    source: file,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null
  };
}

export async function readCodexLbModelCatalog(opts: {
  loadedEnv?: CodexLbEnvLoadResult;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<CodexLbModelCatalogResult> {
  const loaded = opts.loadedEnv || await loadCodexLbEnv();
  if (!loaded.configured || !loaded.base_url || !loaded.secret_api_key) {
    return {
      schema: 'sks.codex-lb-model-catalog.v1',
      ok: false,
      status: 'blocked',
      models: [],
      model_efforts: {},
      http_status: null,
      blockers: loaded.missing.length ? loaded.missing.map((item) => `codex_lb_missing:${item}`) : ['codex_lb_not_configured']
    };
  }
  const transportBlocker = codexLbBaseUrlSecurityBlocker(loaded.base_url);
  if (transportBlocker) {
    return {
      schema: 'sks.codex-lb-model-catalog.v1',
      ok: false,
      status: 'blocked',
      models: [],
      model_efforts: {},
      http_status: null,
      blockers: [transportBlocker]
    };
  }
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const response = await fetchImpl(`${loaded.base_url}/models`, {
      headers: { Authorization: `Bearer ${loaded.secret_api_key}` },
      signal: AbortSignal.timeout(Math.max(250, Number(opts.timeoutMs || 5000)))
    });
    const payload = await response.json().catch(() => null);
    const models = normalizeCodexLbModelCatalogPayload(payload);
    const apiEfforts = normalizeCodexModelEffortCatalogPayload(payload);
    const cachePath = path.join(String(process.env.CODEX_HOME || path.join(os.homedir(), '.codex')), 'models_cache.json');
    const cachePayload = await readJson<any>(cachePath, null).catch(() => null);
    const cachedEfforts = normalizeCodexModelEffortCatalogPayload(cachePayload);
    const modelEfforts = Object.fromEntries(models.map((model) => [model, apiEfforts[model] || cachedEfforts[model] || []]));
    const ok = response.ok && models.length > 0;
    return {
      schema: 'sks.codex-lb-model-catalog.v1',
      ok,
      status: ok ? 'ready' : 'blocked',
      models,
      model_efforts: modelEfforts,
      http_status: response.status,
      blockers: [
        ...(response.ok ? [] : [`codex_lb_models_http_${response.status}`]),
        ...(models.length ? [] : ['codex_lb_model_catalog_empty'])
      ]
    };
  } catch {
    return {
      schema: 'sks.codex-lb-model-catalog.v1',
      ok: false,
      status: 'blocked',
      models: [],
      model_efforts: {},
      http_status: null,
      blockers: ['codex_lb_model_catalog_unavailable']
    };
  }
}

export function normalizeCodexModelEffortCatalogPayload(payload: any): Record<string, string[]> {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const model = String(row?.id || row?.model || row?.slug || row?.name || '').trim();
    if (!model) continue;
    const effortRows = row?.supportedReasoningEfforts
      || row?.supported_reasoning_levels
      || row?.supported_reasoning_efforts
      || row?.reasoning_efforts
      || [];
    const efforts = (Array.isArray(effortRows) ? effortRows : [])
      .map((entry: any) => String(entry?.reasoningEffort || entry?.effort || entry || '').trim().toLowerCase())
      .filter(Boolean);
    result[model] = [...new Set<string>(efforts)];
  }
  return result;
}

export function normalizeCodexLbModelCatalogPayload(payload: any): string[] {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const models: string[] = rows
    .map((row: any) => String(row?.id || row?.model || row?.slug || row?.name || '').trim())
    .filter(Boolean);
  return [...new Set<string>(models)];
}

export function normalizeCodexLbBaseUrl(input: unknown = ''): string {
  let host = String(input || '').trim();
  if (!host) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`;
}

export function codexLbBaseUrlSecurityBlocker(input: unknown): string | null {
  try {
    const url = new URL(String(input || ''));
    if (url.username || url.password) return 'codex_lb_base_url_userinfo_forbidden';
    if (url.protocol === 'https:') return null;
    const host = url.hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '::1' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
    if (url.protocol === 'http:' && loopback) return null;
    return 'codex_lb_insecure_base_url';
  } catch {
    return 'codex_lb_invalid_base_url';
  }
}

export async function loadCodexLbEnv(opts: any = {}): Promise<CodexLbEnvLoadResult> {
  const home = opts.home || process.env.HOME || os.homedir();
  const envPaths = [
    opts.envPath || codexLbEnvPath(home),
    opts.legacyEnvPath || legacyCodexLbEnvPath(home)
  ];
  const sourcePriority: CodexLbEnvSource[] = ['process.env', 'keychain', 'env-file', 'legacy-env-file'];
  if (opts.allowProjectSecrets) sourcePriority.push('project-local');

  const processEnv = pickEnv(process.env);
  const envFile = await readEnvFile(envPaths[0]);
  const legacyEnv = await readEnvFile(envPaths[1]);
  const keychain = await readMacKeychain(opts);
  const projectLocal: { apiKey?: string; baseUrl?: string } = opts.allowProjectSecrets ? await readEnvFile(path.join(opts.root || process.cwd(), '.env')) : {};

  const keySource = processEnv.apiKey ? 'process.env'
    : keychain.apiKey ? 'keychain'
      : envFile.apiKey ? 'env-file'
        : legacyEnv.apiKey ? 'legacy-env-file'
          : projectLocal.apiKey ? 'project-local'
            : 'missing';
  const baseUrlSource = processEnv.baseUrl ? 'process.env'
    : envFile.baseUrl ? 'env-file'
      : legacyEnv.baseUrl ? 'legacy-env-file'
        : projectLocal.baseUrl ? 'project-local'
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

export async function writeCodexLbKeychain(apiKey: unknown, opts: any = {}) {
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

async function readMacKeychain(opts: any = {}) {
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

async function readEnvFile(file: string) {
  const text = await readText(file, '');
  return {
    apiKey: parseShellEnvValue(text, 'CODEX_LB_API_KEY'),
    baseUrl: parseShellEnvValue(text, 'CODEX_LB_BASE_URL')
  };
}

function pickEnv(env: NodeJS.ProcessEnv) {
  return {
    apiKey: String(env.CODEX_LB_API_KEY || '').trim(),
    baseUrl: String(env.CODEX_LB_BASE_URL || '').trim()
  };
}

export function parseShellEnvValue(text: unknown = '', key: unknown = ''): string {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const envMatch = String(text || '').match(re);
  const raw = envMatch?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}

async function sha256Prefix(value: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function redactSecret(text: unknown, secret: unknown): string {
  return String(text || '').split(String(secret || '')).join('[redacted]');
}

function escapeRegExp(value: unknown): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
