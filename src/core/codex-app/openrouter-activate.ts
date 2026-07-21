import path from 'node:path';
import os from 'node:os';
import { ensureDir, readText, nowIso } from '../fsx.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import {
  OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_PROVIDER_ID,
  normalizeOpenRouterModelId
} from './openrouter-provider.js';
import { installCodexAppGlmProfile } from './glm-profile-installer.js';
import { restartCodexApp } from './codex-app-restart.js';
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
  const key = await resolveOpenRouterApiKey({ env: input.env || process.env });
  const providerPresent = new RegExp(`\\[model_providers\\.${OPENROUTER_PROVIDER_ID}\\]`).test(config);
  const selected = topLevelTomlString(config, 'model_provider') === OPENROUTER_PROVIDER_ID;
  const model = topLevelTomlString(config, 'model');
  const blockers: string[] = [];
  if (!key.key) blockers.push('openrouter_key_missing');
  if (!providerPresent) blockers.push('openrouter_provider_missing');
  return {
    schema: 'sks.codex-app-openrouter-status.v1',
    ok: blockers.length === 0 && (selected ? Boolean(model) : true),
    key_present: Boolean(key.key),
    key_source: key.source || null,
    provider_present: providerPresent,
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
  const env = input.env || process.env;
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

  const restart = await restartCodexApp({ enabled: Boolean(input.restartApp) });
  const status = await openRouterStatus({ home, configPath, env });
  const ok = Boolean(status.selected && status.key_present && status.provider_present && status.model === model && restart.ok);
  return {
    schema: 'sks.codex-app-use-openrouter.v1',
    generated_at: nowIso(),
    ok,
    status: ok ? 'active' : 'activation_incomplete',
    mode: 'openrouter',
    model,
    profile,
    unselect,
    write,
    restart_app: restart,
    openrouter: status,
    readiness: {
      selected: status.selected,
      key_present: status.key_present,
      provider_present: status.provider_present,
      model: status.model,
      ok
    },
    blockers: [
      ...(status.selected ? [] : ['openrouter_not_selected']),
      ...(status.model === model ? [] : ['openrouter_model_not_applied']),
      ...(restart.ok ? [] : (restart.blockers || ['openrouter_restart_blocked']))
    ],
    warnings: [
      ...(unselect?.ok === false ? [`codex_lb_unselect:${unselect.provider_error || unselect.status}`] : []),
      ...(profile.warnings || [])
    ]
  };
}

export async function ensureOpenRouterProviderInstalled(opts: any = {}) {
  return ensureGlobalCodexAppGlmProfile(opts);
}
