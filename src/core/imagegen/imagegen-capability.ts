import os from 'node:os';
import path from 'node:path';
import { codexLbEnvPath, parseShellEnvValue } from '../codex-lb/codex-lb-env.js';
import { nowIso, readText, runProcess, which } from '../fsx.js';

export async function detectImagegenCapability(opts: any = {}) {
  const codexBin = opts.codexBin || await which('codex').catch(() => null);
  const codexApp = await detectCodexAppImagegen(codexBin, opts);
  const env = opts.env || process.env;
  const openaiApiKeyPresent = Boolean(opts.apiKey || env.OPENAI_API_KEY);
  const codexLb = await detectCodexLbImagegenAuth(opts, env);
  const imageApiAuthPresent = openaiApiKeyPresent || codexLb.available;
  const fakeAdapterEnabled = opts.fake === true || process.env.SKS_TEST_FAKE_IMAGEGEN === '1';
  return {
    schema: 'sks.imagegen-capability.v1',
    ok: true,
    created_at: nowIso(),
    model: 'gpt-image-2',
    codex_app: codexApp,
    codex_lb: codexLb,
    openai_images_api: {
      available: imageApiAuthPresent,
      auth_source: openaiApiKeyPresent ? 'OPENAI_API_KEY' : codexLb.available ? 'CODEX_LB_API_KEY' : null,
      codex_lb_proxy: codexLb.available ? { base_url: codexLb.base_url, env_key: codexLb.env_key } : null,
      endpoints: {
        images_edits_supported: imageApiAuthPresent,
        images_generations_supported: imageApiAuthPresent,
        responses_image_generation_supported: imageApiAuthPresent
      },
      blocker: imageApiAuthPresent ? null : (codexLb.blocker === 'codex_lb_api_key_missing' ? 'codex_lb_api_key_missing' : 'openai_api_key_missing')
    },
    fake_adapter: {
      available: fakeAdapterEnabled,
      env: 'SKS_TEST_FAKE_IMAGEGEN=1',
      source: 'mock_like_fixture',
      real_generation_claim_allowed: false
    },
    supports_reference_image: codexApp.available || imageApiAuthPresent || fakeAdapterEnabled,
    gpt_image_2_input_fidelity_automatic: true,
    input_fidelity_must_be_omitted: true,
    supported_workflows: {
      ux_review_callouts: codexApp.available || imageApiAuthPresent || fakeAdapterEnabled,
      ppt_slide_callouts: codexApp.available || imageApiAuthPresent || fakeAdapterEnabled,
      structured_extraction_required_after_generation: true
    },
    blockers: codexApp.available || imageApiAuthPresent || fakeAdapterEnabled ? [] : ['imagegen_capability_missing']
  };
}

async function detectCodexLbImagegenAuth(opts: any = {}, env: any = process.env) {
  const home = opts.home || env.HOME || process.env.HOME || os.homedir();
  const configPath = opts.configPath || path.join(home, '.codex', 'config.toml');
  const configText = typeof opts.configText === 'string'
    ? opts.configText
    : await readText(configPath, '').catch(() => '');
  const block = tomlTableBlock(configText, 'model_providers.codex-lb');
  const selected = opts.codexLbSelected === true || topLevelTomlString(configText, 'model_provider') === 'codex-lb';
  const providerConfigured = Boolean(block);
  const requiresOpenAiAuth = tomlBoolean(block, 'requires_openai_auth');
  const envKey = tomlString(block, 'env_key');
  const baseUrl = tomlString(block, 'base_url') || String(env.CODEX_LB_BASE_URL || '').trim();
  const envPath = opts.codexLbEnvPath || codexLbEnvPath(home);
  const envText = typeof opts.codexLbEnvText === 'string'
    ? opts.codexLbEnvText
    : await readText(envPath, '').catch(() => '');
  const keyFromEnv = envKey ? String(env[envKey] || '').trim() : '';
  const keyFromFile = envKey ? parseShellEnvValue(envText, envKey) : '';
  const apiKeyPresent = Boolean(opts.codexLbApiKey || keyFromEnv || keyFromFile);
  const apiKeySource = opts.codexLbApiKey ? 'option' : keyFromEnv ? 'process.env' : keyFromFile ? 'env-file' : null;
  const blocker = codexLbAuthBlocker({
    selected,
    providerConfigured,
    requiresOpenAiAuth,
    envKey,
    baseUrl,
    apiKeyPresent
  });
  return {
    available: blocker === null,
    selected,
    provider_configured: providerConfigured,
    requires_openai_auth: requiresOpenAiAuth,
    openai_auth_disabled: requiresOpenAiAuth === false,
    env_key: envKey || null,
    base_url: baseUrl || null,
    env_path: envPath,
    api_key: {
      present: apiKeyPresent,
      source: apiKeySource,
      redacted: true
    },
    blocker
  };
}

function codexLbAuthBlocker(state: any) {
  if (!state.selected) return 'codex_lb_not_selected';
  if (!state.providerConfigured) return 'codex_lb_provider_missing';
  if (state.requiresOpenAiAuth !== false) {
    return state.requiresOpenAiAuth === true ? 'codex_lb_requires_openai_auth' : 'codex_lb_requires_openai_auth_not_disabled';
  }
  if (state.envKey !== 'CODEX_LB_API_KEY') return 'codex_lb_env_key_missing_or_unsupported';
  if (!state.baseUrl) return 'codex_lb_base_url_missing';
  if (!state.apiKeyPresent) return 'codex_lb_api_key_missing';
  return null;
}

async function detectCodexAppImagegen(codexBin: string | null, opts: any = {}) {
  if (opts.codexAppAvailable === true || process.env.SKS_CODEX_APP_IMAGEGEN_AVAILABLE === '1') {
    return { available: true, detector: 'env_or_option', blocker: null, raw: null };
  }
  if (!codexBin) return { available: false, detector: 'codex_binary_missing', blocker: 'codex_binary_missing', raw: null };
  const jsonRun = await runProcess(codexBin, ['features', 'list', '--json'], {
    timeoutMs: opts.timeoutMs || 5000,
    maxOutputBytes: 64 * 1024
  }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  let parsed: any = null;
  try {
    const candidate = JSON.parse(jsonRun.stdout || 'null');
    parsed = hasCodexFeatureSignal(candidate) ? candidate : null;
  } catch {}
  let plainRun: any = null;
  if (!parsed) {
    plainRun = await runProcess(codexBin, ['features', 'list'], {
      timeoutMs: opts.timeoutMs || 5000,
      maxOutputBytes: 64 * 1024
    }).catch((err: unknown) => ({ code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }));
  }
  if (!parsed && plainRun?.code !== 0) {
    return {
      available: false,
      detector: 'codex_features_list',
      blocker: 'codex_app_imagegen_not_detected',
      raw: String(plainRun?.stderr || plainRun?.stdout || jsonRun.stderr || '').slice(0, 2000)
    };
  }
  const rawText = String(plainRun?.stdout || plainRun?.stderr || jsonRun.stdout || jsonRun.stderr || '');
  const available = codexFeatureEnabled(parsed, rawText);
  return {
    available,
    detector: 'codex_features_list',
    blocker: available ? null : 'codex_app_imagegen_not_detected',
    raw: parsed || rawText.slice(0, 2000)
  };
}

function hasCodexFeatureSignal(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

function codexFeatureEnabled(parsed: any, rawText: string): boolean {
  const parsedValue = parsedFeatureEnabled(parsed);
  if (parsedValue !== null) return parsedValue;
  const plainValue = plainFeatureEnabled(rawText);
  if (plainValue !== null) return plainValue;
  const haystack = JSON.stringify(parsed || rawText || '');
  return /image[_-]?generation|imagegen|\$imagegen/i.test(haystack)
    && !/false|disabled|missing/i.test(String(parsed?.image_generation ?? parsed?.features?.image_generation ?? ''));
}

function parsedFeatureEnabled(parsed: any): boolean | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const direct = boolish(parsed.image_generation ?? parsed.imageGeneration ?? parsed.imagegen);
  if (direct !== null) return direct;
  const featureMap = parsed.features && typeof parsed.features === 'object' && !Array.isArray(parsed.features)
    ? boolish(parsed.features.image_generation ?? parsed.features.imageGeneration ?? parsed.features.imagegen)
    : null;
  if (featureMap !== null) return featureMap;
  const featureLists = [
    Array.isArray(parsed) ? parsed : null,
    Array.isArray(parsed.features) ? parsed.features : null
  ].filter(Boolean);
  for (const list of featureLists) {
    for (const item of list as any[]) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name ?? item.key ?? item.id ?? item.feature ?? '');
      if (!/^image[_-]?generation$|^imagegen$/i.test(name)) continue;
      const value = boolish(item.enabled ?? item.value ?? item.available ?? item.status);
      if (value !== null) return value;
    }
  }
  return null;
}

function plainFeatureEnabled(rawText: string): boolean | null {
  for (const line of rawText.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/).filter(Boolean);
    if (columns.length < 2) continue;
    if (!/^image[_-]?generation$|^imagegen$/i.test(columns[0] || '')) continue;
    return boolish(columns[columns.length - 1]);
  }
  return null;
}

function boolish(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;
  if (/^(true|enabled|available|on|yes)$/i.test(value.trim())) return true;
  if (/^(false|disabled|missing|off|no)$/i.test(value.trim())) return false;
  return null;
}

function topLevelTomlString(text: any = '', key: any = '') {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  return tomlString(topLevel, key);
}

function tomlTableBlock(text: any = '', table: any = '') {
  const re = new RegExp(`(^|\\n)\\[${escapeRegExp(table)}\\]([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|\\s*$)`);
  return String(text || '').match(re)?.[2] || '';
}

function tomlString(text: any = '', key: any = '') {
  const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*(?:#.*)?(?=\\n|$)`);
  return String(text || '').match(re)?.[2] || '';
}

function tomlBoolean(text: any = '', key: any = '') {
  const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*(?:#.*)?(?=\\n|$)`, 'i');
  const raw = String(text || '').match(re)?.[2];
  if (!raw) return null;
  return raw.toLowerCase() === 'true';
}

function escapeRegExp(value: unknown) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
