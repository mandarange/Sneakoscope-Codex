import path from 'node:path';
import os from 'node:os';
import { ensureDir, readText } from '../core/fsx.js';
import {
  GLM_CODEX_CONFIG_PROFILE_ID,
  GLM_CODEX_CONFIG_PROVIDER_ID,
  GLM_CODEX_CONFIG_REASONING_PROFILES
} from '../core/providers/glm/glm-52-profile.js';
import { GLM_52_OPENROUTER_MODEL } from '../core/providers/glm/glm-52-settings.js';
import type { CodexLbPersistenceMode } from '../core/codex-lb/codex-lb-setup.js';
import {
  removeTopLevelTomlKeyIfValue,
  safeWriteCodexConfigToml,
  upsertTopLevelTomlString,
  upsertTomlTable
} from '../core/codex-runtime/codex-desktop-config-policy.js';
import {
  codexLbConfigPath,
  normalizeCodexLbBaseUrl
} from './install-helpers-codex-lb-shared.js';

export function upsertCodexLbConfig(text: any = '', baseUrl: any, selectDefault = true) {
  let next = selectDefault
    ? upsertTopLevelTomlString(text, 'model_provider', 'codex-lb')
    : removeTopLevelTomlKeyIfValue(text, 'model_provider', 'codex-lb');
  const block = [
    '[model_providers.codex-lb]',
    'name = "openai"',
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    'env_key = "CODEX_LB_API_KEY"',
    'supports_websockets = true',
    'requires_openai_auth = true'
  ].join('\n');
  next = upsertTomlTable(next, 'model_providers.codex-lb', block);
  return `${next.trim()}\n`;
}

export function upsertCodexAppGlmConfig(text: any = '') {
  let next = String(text || '');
  const providerBlock = [
    `[model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}]`,
    'name = "OpenRouter"',
    'base_url = "https://openrouter.ai/api/v1"',
    'wire_api = "responses"',
    'env_key = "OPENROUTER_API_KEY"',
    'requires_openai_auth = false'
  ].join('\n');
  next = upsertTomlTable(next, `model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}`, providerBlock);
  for (const profile of GLM_CODEX_CONFIG_REASONING_PROFILES) {
    const profileBlock = [
      `[profiles.${profile.id}]`,
      `model_provider = "${GLM_CODEX_CONFIG_PROVIDER_ID}"`,
      `model = "${GLM_52_OPENROUTER_MODEL}"`,
      `model_reasoning_effort = "${profile.reasoning_effort}"`,
      'service_tier = "default"',
      'approval_policy = "on-request"'
    ].join('\n');
    next = upsertTomlTable(next, `profiles.${profile.id}`, profileBlock);
  }
  return `${next.trim()}\n`;
}

export async function ensureGlobalCodexAppGlmProfile(opts: any = {}) {
  if (process.env.SKS_SKIP_CODEX_GLM_PROFILE_REPAIR === '1' && opts.force !== true) {
    return { ok: true, status: 'skipped', reason: 'SKS_SKIP_CODEX_GLM_PROFILE_REPAIR=1' };
  }
  const home = opts.home || process.env.HOME || os.homedir();
  const configPath = opts.configPath || codexLbConfigPath(home);
  try {
    await ensureDir(path.dirname(configPath));
    const current = await readText(configPath, '');
    const next = upsertCodexAppGlmConfig(current);
    const safeWrite = await safeWriteCodexConfigToml(configPath, current, next, 'glm-profile');
    return {
      ...safeWrite,
      status: safeWrite.status === 'written' ? 'updated' : safeWrite.status,
      provider: GLM_CODEX_CONFIG_PROVIDER_ID,
      model: GLM_52_OPENROUTER_MODEL,
      codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
      reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((profile) => profile.id)
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'failed',
      config_path: configPath,
      error: err.message,
      provider: GLM_CODEX_CONFIG_PROVIDER_ID,
      model: GLM_52_OPENROUTER_MODEL,
      codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
      reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((profile) => profile.id)
    };
  }
}

export function detectCodexLbSetupDrift(state: any = {}): string[] {
  const drift: string[] = [];
  if (state.useDefaultProvider && state.selected !== true) drift.push('default_provider_not_selected');
  if (!state.useDefaultProvider && state.selected === true) drift.push('default_provider_selected_despite_no_default_provider');
  if (state.writeEnvFile && state.envFile !== true) drift.push('env_file_not_written');
  if (!state.writeEnvFile && state.beforeState && state.afterState && state.beforeState.envHash !== state.afterState.envHash) drift.push('env_file_changed_despite_no_env_file');
  if (!state.writeEnvFile && !state.beforeState && state.envFile === true) drift.push('env_file_written_despite_no_env_file');
  if (!state.storeKeychain && state.keychain?.status && state.keychain.status !== 'skipped') drift.push('keychain_touched_despite_no_keychain');
  if (!state.syncLaunchctl && state.codexEnvironment?.launch_environment?.status === 'synced') drift.push('launchctl_base_url_synced_despite_no_launchctl');
  if (state.codexEnvironment?.launch_environment?.secret_env_cleanup?.status === 'partial') drift.push('launchctl_secret_env_cleanup_incomplete');
  if (state.shellProfile === 'skip' && state.shellProfileResult?.status === 'installed') drift.push('shell_profile_written_despite_skip');
  if (state.shellProfile === 'skip' && state.beforeState && state.afterState && state.beforeState.profileHash !== state.afterState.profileHash) drift.push('shell_profile_changed_despite_skip');
  return drift;
}

export async function captureCodexLbSetupWriteState({ home, configPath, envPath, shellProfile }: any = {}) {
  const profileFiles = profileFilesForDrift(home, shellProfile);
  return {
    configHash: await fileHashOrMissing(configPath),
    envHash: await fileHashOrMissing(envPath),
    profileHash: (await Promise.all(profileFiles.map((file: string) => fileHashOrMissing(file)))).join('|')
  };
}

async function fileHashOrMissing(file: string) {
  const text = await readText(file, null).catch(() => null);
  return text === null ? 'missing' : await sha256Text(String(text));
}

function profileFilesForDrift(home: string, shellProfile: string) {
  const targets = {
    zsh: path.join(home, '.zshrc'),
    bash: path.join(home, '.bashrc'),
    fish: path.join(home, '.config', 'fish', 'config.fish')
  };
  if (shellProfile === 'zsh') return [targets.zsh];
  if (shellProfile === 'bash') return [targets.bash];
  if (shellProfile === 'fish') return [targets.fish];
  if (shellProfile === 'all') return [targets.zsh, targets.bash, targets.fish];
  return [targets.zsh, targets.bash, targets.fish];
}

export function appliedCodexLbPersistenceModes(state: any = {}): CodexLbPersistenceMode[] {
  const modes: CodexLbPersistenceMode[] = [];
  if (state.writeEnvFile && state.envFile === true) modes.push('durable_env_file');
  if (state.storeKeychain && state.keychain?.ok === true) modes.push('durable_keychain');
  if (state.syncLaunchctl && state.codexEnvironment?.launch_environment?.status === 'synced') modes.push('process_only_ephemeral');
  if (state.shellProfile !== 'skip' && state.shellProfileResult?.status === 'installed') modes.push('shell_profile');
  if (!modes.length && state.apiKeySource === 'process.env') modes.push('process_only_ephemeral');
  if (!modes.length) modes.push('none');
  return modes;
}

export function shellSingleQuote(value: any) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}


export function parseCodexLbEnvBaseUrl(text: any = '') {
  const value = parseShellEnvValue(text, 'CODEX_LB_BASE_URL');
  return value ? normalizeCodexLbBaseUrl(value) : '';
}

export function parseCodexSharedLoginApiKey(text: any = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    const authMode = String(parsed?.auth_mode || parsed?.authMode || parsed?.mode || '').toLowerCase();
    const key = parsed?.key || parsed?.api_key || parsed?.apiKey || parsed?.openai_api_key || parsed?.OPENAI_API_KEY;
    if (!key || typeof key !== 'string') return '';
    if (authMode && !/api[-_]?key|apikey/.test(authMode)) return '';
    return key.trim();
  } catch {
    return '';
  }
}

function parseShellEnvValue(text: any = '', key: any = '') {
  const re = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm');
  const envMatch = String(text || '').match(re);
  const raw = envMatch?.[1]?.trim() || '';
  if (!raw) return '';
  if (raw.startsWith("'")) return raw.endsWith("'") && raw.length > 1 ? raw.slice(1, -1).replace(/'\\''/g, "'") : '';
  if (raw.startsWith('"')) return raw.endsWith('"') && raw.length > 1 ? raw.slice(1, -1).replace(/\\"/g, '"') : '';
  if (raw.includes("'") || raw.includes('"') || /\s/.test(raw)) return '';
  return raw;
}


export async function sha256Text(value: any = '') {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
