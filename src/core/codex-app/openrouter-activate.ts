import path from 'node:path';
import os from 'node:os';
import { ensureDir, readText, nowIso } from '../fsx.js';
import { openRouterSecretPaths, resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import {
  OPENROUTER_AUTH_COMMAND,
  OPENROUTER_AUTH_REFRESH_INTERVAL_MS,
  OPENROUTER_AUTH_TIMEOUT_MS,
  openRouterAuthCommandArgs,
  OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_PROVIDER_ID,
  normalizeOpenRouterModelId
} from './openrouter-provider.js';
import { installCodexAppGlmProfile } from './glm-profile-installer.js';
import { restartCodexApp } from './codex-app-restart.js';
import type { CodexAppRestartResult } from './codex-app-restart.js';
import {
  codexLbConfigPath,
  ensureGlobalCodexAppGlmProfile,
  unselectCodexLbProvider
} from '../../cli/install-helpers.js';
import {
  ensureTrailingNewline,
  safeWriteCodexConfigToml,
  upsertTopLevelTomlString
} from '../codex-runtime/codex-desktop-config-policy.js';

function topLevelTomlString(text: string, key: string): string | null {
  const match = String(text || '').match(new RegExp(`(?:^|\\n)${key}\\s*=\\s*\"([^\"]*)\"`));
  return match?.[1] ?? null;
}

export interface OpenRouterStatus {
  readonly schema: 'sks.codex-app-openrouter-status.v1';
  readonly ok: boolean;
  readonly key_present: boolean;
  readonly key_source: string | null;
  readonly provider_present: boolean;
  readonly provider_env_key_present: boolean;
  readonly provider_auth_present: boolean;
  readonly provider_auth_conflict: boolean;
  readonly provider_auth_valid: boolean;
  readonly selected: boolean;
  readonly model: string | null;
  readonly model_source: 'config' | 'default' | null;
  readonly config_path: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export async function openRouterStatus(input: {
  readonly root?: string;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly configPath?: string;
} = {}): Promise<OpenRouterStatus> {
  const home = input.home || process.env.HOME || os.homedir();
  const configPath = input.configPath || codexLbConfigPath(home);
  const config = await readText(configPath, '');
  const env = { ...(input.env || process.env), HOME: home };
  const key = await resolveOpenRouterApiKey({ env });
  const authArgs = openRouterAuthCommandArgs(openRouterSecretPaths(env).keyPath);
  const providerPresent = new RegExp(`\\[model_providers\\.${OPENROUTER_PROVIDER_ID}\\]`).test(config);
  const providerBody = tomlTableBody(config, `model_providers.${OPENROUTER_PROVIDER_ID}`);
  const providerEnvKeyPresent = hasTomlKey(providerBody, 'env_key');
  const authBody = tomlTableBody(config, `model_providers.${OPENROUTER_PROVIDER_ID}.auth`);
  const providerAuthPresent = Boolean(authBody);
  const providerAuthConflict = providerEnvKeyPresent && providerAuthPresent;
  const providerAuthValid = providerAuthPresent
    && !providerAuthConflict
    && hasTomlString(authBody, 'command', OPENROUTER_AUTH_COMMAND)
    && hasTomlStringArray(authBody, 'args', authArgs)
    && hasTomlInteger(authBody, 'timeout_ms', OPENROUTER_AUTH_TIMEOUT_MS)
    && hasTomlInteger(authBody, 'refresh_interval_ms', OPENROUTER_AUTH_REFRESH_INTERVAL_MS);
  const selected = topLevelTomlString(config, 'model_provider') === OPENROUTER_PROVIDER_ID;
  const model = topLevelTomlString(config, 'model');
  const blockers: string[] = [];
  if (!key.key) blockers.push('openrouter_key_missing');
  if (!providerPresent) blockers.push('openrouter_provider_missing');
  if (providerAuthConflict) blockers.push('openrouter_provider_auth_env_key_conflict');
  else if (!providerAuthPresent) blockers.push('openrouter_provider_auth_missing');
  else if (!providerAuthValid) blockers.push('openrouter_provider_auth_invalid');
  return {
    schema: 'sks.codex-app-openrouter-status.v1',
    ok: blockers.length === 0 && (selected ? Boolean(model) : true),
    key_present: Boolean(key.key),
    key_source: key.source || null,
    provider_present: providerPresent,
    provider_env_key_present: providerEnvKeyPresent,
    provider_auth_present: providerAuthPresent,
    provider_auth_conflict: providerAuthConflict,
    provider_auth_valid: providerAuthValid,
    selected,
    model: model || (selected ? OPENROUTER_DEFAULT_MODEL : null),
    model_source: model ? 'config' : selected ? 'default' : null,
    config_path: configPath,
    blockers,
    warnings: []
  };
}

export async function useOpenRouter(input: {
  readonly root: string;
  readonly model?: string | null;
  readonly restartApp?: boolean;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly configPath?: string;
  readonly restartImpl?: (input: { enabled: boolean }) => Promise<CodexAppRestartResult>;
}): Promise<Record<string, unknown>> {
  const model = normalizeOpenRouterModelId(input.model || OPENROUTER_DEFAULT_MODEL);
  if (!model) {
    return {
      schema: 'sks.codex-app-use-openrouter.v1',
      generated_at: nowIso(),
      ok: false,
      status: 'blocked',
      mode: 'openrouter',
      blockers: ['openrouter_model_invalid'],
      warnings: [],
      hint: 'Pass --model <openrouter-model-id>, for example z-ai/glm-5.2'
    };
  }

  const home = input.home || process.env.HOME || os.homedir();
  const configPath = input.configPath || codexLbConfigPath(home);
  const env = { ...(input.env || process.env), HOME: home };
  await ensureDir(path.dirname(configPath));

  const key = await resolveOpenRouterApiKey({ env });
  if (!key.key) {
    return {
      schema: 'sks.codex-app-use-openrouter.v1',
      generated_at: nowIso(),
      ok: false,
      status: 'blocked',
      mode: 'openrouter',
      model,
      blockers: ['openrouter_key_missing'],
      warnings: [],
      hint: 'Save a key first: sks codex-app set-openrouter-key --api-key-stdin'
    };
  }

  const profile = await installCodexAppGlmProfile({
    root: input.root,
    apply: true,
    home,
    env,
    configPath
  });
  if (!profile.ok) {
    return {
      schema: 'sks.codex-app-use-openrouter.v1',
      generated_at: nowIso(),
      ok: false,
      status: 'blocked',
      mode: 'openrouter',
      model,
      profile,
      blockers: profile.blockers,
      warnings: profile.warnings || []
    };
  }

  // Prefer OpenRouter as the default provider; drop a selected codex-lb pin when safe.
  const unselect = await unselectCodexLbProvider({
    home,
    configPath,
    allowActiveSharedAuthTransition: true
  }).catch((err: any) => ({ ok: false, status: 'failed', provider_error: err?.message || String(err) }));

  const current = await readText(configPath, '');
  let next = upsertTopLevelTomlString(current, 'model_provider', OPENROUTER_PROVIDER_ID);
  next = upsertTopLevelTomlString(next, 'model', model);
  next = ensureTrailingNewline(next);
  const write = await safeWriteCodexConfigToml(configPath, current, next, 'openrouter-use');
  if (!write.ok) {
    return {
      schema: 'sks.codex-app-use-openrouter.v1',
      generated_at: nowIso(),
      ok: false,
      status: 'blocked',
      mode: 'openrouter',
      model,
      write,
      unselect,
      blockers: [String(write.status || 'openrouter_config_write_blocked')],
      warnings: []
    };
  }

  const restart = await (input.restartImpl || restartCodexApp)({ enabled: Boolean(input.restartApp) });
  const status = await openRouterStatus({ home, configPath, env });
  const configApplied = Boolean(
    status.selected
    && status.key_present
    && status.provider_present
    && status.provider_auth_valid
    && status.model === model
  );
  return {
    schema: 'sks.codex-app-use-openrouter.v1',
    generated_at: nowIso(),
    ok: configApplied,
    status: configApplied ? (restart.ok ? 'active' : 'active_restart_blocked') : 'activation_incomplete',
    mode: 'openrouter',
    model,
    profile,
    unselect,
    write,
    restart_app: restart,
    config_applied: configApplied,
    restart_ok: restart.ok,
    openrouter: status,
    readiness: {
      selected: status.selected,
      key_present: status.key_present,
      provider_present: status.provider_present,
      provider_auth_present: status.provider_auth_present,
      provider_auth_valid: status.provider_auth_valid,
      model: status.model,
      config_applied: configApplied,
      restart_ok: restart.ok,
      ok: configApplied
    },
    blockers: [
      ...(status.selected ? [] : ['openrouter_not_selected']),
      ...(status.model === model ? [] : ['openrouter_model_not_applied']),
      ...(status.provider_auth_valid ? [] : ['openrouter_provider_auth_not_applied'])
    ],
    warnings: [
      ...(unselect?.ok === false ? [`codex_lb_unselect:${unselect.provider_error || unselect.status}`] : []),
      ...(restart.ok ? [] : (restart.blockers || ['openrouter_restart_blocked']).map((blocker) => `restart:${blocker}`)),
      ...(profile.warnings || [])
    ]
  };
}

export async function ensureOpenRouterProviderInstalled(opts: any = {}) {
  return ensureGlobalCodexAppGlmProfile(opts);
}

function tomlTableBody(text: string, table: string): string {
  const header = `[${table}]`;
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return '';
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[[^\]]+\]\s*$/.test(line || '')) break;
    body.push(line || '');
  }
  return body.join('\n');
}

function hasTomlString(text: string, key: string, value: string): boolean {
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"${escapeRegExp(value)}"\\s*(?:#.*)?$`, 'm').test(text);
}

function hasTomlKey(text: string, key: string): boolean {
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'm').test(text);
}

function hasTomlStringArray(text: string, key: string, values: readonly string[]): boolean {
  const expected = values.map((value) => JSON.stringify(value)).join(', ');
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[${escapeRegExp(expected)}\\]\\s*(?:#.*)?$`, 'm').test(text);
}

function hasTomlInteger(text: string, key: string, value: number): boolean {
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*${value}\\s*(?:#.*)?$`, 'm').test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
