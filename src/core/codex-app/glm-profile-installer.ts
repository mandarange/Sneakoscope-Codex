import path from 'node:path';
import { codexLbConfigPath, ensureGlobalCodexAppGlmProfile } from '../../cli/install-helpers.js';
import { readJson, readText, writeJsonAtomic, nowIso } from '../fsx.js';
import {
  GLM_CODEX_CONFIG_PROFILE_ID,
  GLM_CODEX_CONFIG_PROVIDER_ID,
  GLM_CODEX_CONFIG_REASONING_PROFILES,
  buildGlmCodexAppModelProfile,
  type SksCodexAppModelProfile
} from './glm-model-profile.js';
import { validateGlmCodexAppModelProfile } from './glm-profile-schema.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';
import { GLM_52_OPENROUTER_MODEL } from './openrouter-provider.js';

type CodexAppGlmConfigWrite = Awaited<ReturnType<typeof ensureGlobalCodexAppGlmProfile>>;

interface CodexAppGlmConfigStatus {
  readonly schema: 'sks.codex-app-glm-config-status.v1';
  readonly ok: boolean;
  readonly config_path: string;
  readonly provider_present: boolean;
  readonly profiles_present: readonly string[];
  readonly profiles_missing: readonly string[];
  readonly blockers: readonly string[];
}

export interface GlmProfileInstallResult {
  readonly schema: 'sks.codex-app-glm-profile-result.v1';
  readonly generated_at: string;
  readonly ok: boolean;
  readonly status: 'installed' | 'valid' | 'blocked';
  readonly profile: SksCodexAppModelProfile;
  readonly profile_path: string;
  readonly report_path: string;
  readonly config_path: string;
  readonly codex_config_profile: string;
  readonly codex_reasoning_profiles: readonly string[];
  readonly config_write: CodexAppGlmConfigWrite | null;
  readonly config_status: CodexAppGlmConfigStatus;
  readonly openrouter_key_source: string | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export async function installCodexAppGlmProfile(input: {
  readonly root: string;
  readonly apply?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly configPath?: string;
}): Promise<GlmProfileInstallResult> {
  const root = path.resolve(input.root);
  const profile = buildGlmCodexAppModelProfile();
  const profilePath = path.join(root, '.sneakoscope', 'codex-app', 'glm-model-profile.json');
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'codex-app-glm-profile.json');
  const key = await resolveOpenRouterApiKey({ env: input.env || process.env });
  const home = input.home || input.env?.HOME;
  const configWrite = input.apply === false
    ? null
    : await ensureGlobalCodexAppGlmProfile({ home, configPath: input.configPath });
  const configStatus = input.apply === false
    ? await previewCodexAppGlmConfigStatus({ home, configPath: input.configPath })
    : await inspectCodexAppGlmConfig({ home, configPath: input.configPath });
  const configWriteBlockers = configWrite?.ok === false
    ? [`glm_codex_app_config_${configWrite.status || 'failed'}`]
    : [];
  const blockers = input.apply === false ? [] : [...configWriteBlockers, ...configStatus.blockers];
  const warnings = [
    ...key.warnings,
    ...(key.key ? [] : ['openrouter_key_missing_until_sks_--mad_--glm_--repair']),
    ...(input.apply === false ? ['codex_desktop_glm_config_not_written_apply_false'] : [])
  ];
  if (input.apply !== false) await writeJsonAtomic(profilePath, profile);
  const result: GlmProfileInstallResult = {
    schema: 'sks.codex-app-glm-profile-result.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? input.apply === false ? 'valid' : 'installed' : 'blocked',
    profile,
    profile_path: '.sneakoscope/codex-app/glm-model-profile.json',
    report_path: '.sneakoscope/reports/codex-app-glm-profile.json',
    config_path: configStatus.config_path,
    codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
    codex_reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((item) => item.id),
    config_write: configWrite,
    config_status: configStatus,
    openrouter_key_source: key.source,
    blockers,
    warnings
  };
  await writeJsonAtomic(reportPath, result).catch(() => undefined);
  return result;
}

export async function doctorCodexAppGlmProfile(input: {
  readonly root: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly configPath?: string;
}): Promise<GlmProfileInstallResult> {
  const root = path.resolve(input.root);
  const profilePath = path.join(root, '.sneakoscope', 'codex-app', 'glm-model-profile.json');
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'codex-app-glm-profile.json');
  const existing = await readJson(profilePath, null);
  const validation = validateGlmCodexAppModelProfile(existing);
  const key = await resolveOpenRouterApiKey({ env: input.env || process.env });
  const profile = validation.profile || buildGlmCodexAppModelProfile();
  const home = input.home || input.env?.HOME;
  const configStatus = await inspectCodexAppGlmConfig({ home, configPath: input.configPath });
  const blockers = [...validation.blockers, ...configStatus.blockers];
  const warnings = [
    ...key.warnings,
    ...(key.key ? [] : ['openrouter_key_missing_until_sks_--mad_--glm_--repair'])
  ];
  const result: GlmProfileInstallResult = {
    schema: 'sks.codex-app-glm-profile-result.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'valid' : 'blocked',
    profile,
    profile_path: '.sneakoscope/codex-app/glm-model-profile.json',
    report_path: '.sneakoscope/reports/codex-app-glm-profile.json',
    config_path: configStatus.config_path,
    codex_config_profile: GLM_CODEX_CONFIG_PROFILE_ID,
    codex_reasoning_profiles: GLM_CODEX_CONFIG_REASONING_PROFILES.map((item) => item.id),
    config_write: null,
    config_status: configStatus,
    openrouter_key_source: key.source,
    blockers,
    warnings
  };
  await writeJsonAtomic(reportPath, result).catch(() => undefined);
  return result;
}

async function previewCodexAppGlmConfigStatus(input: { readonly home?: string | undefined; readonly configPath?: string | undefined }): Promise<CodexAppGlmConfigStatus> {
  const configPath = input.configPath || codexLbConfigPath(input.home);
  return {
    schema: 'sks.codex-app-glm-config-status.v1',
    ok: true,
    config_path: configPath,
    provider_present: false,
    profiles_present: [],
    profiles_missing: [],
    blockers: []
  };
}

async function inspectCodexAppGlmConfig(input: { readonly home?: string | undefined; readonly configPath?: string | undefined }): Promise<CodexAppGlmConfigStatus> {
  const configPath = input.configPath || codexLbConfigPath(input.home);
  const text = await readText(configPath, '').catch(() => '');
  const providerBody = tomlTableBody(text, `model_providers.${GLM_CODEX_CONFIG_PROVIDER_ID}`);
  const providerPresent = Boolean(providerBody);
  const blockers: string[] = [];
  if (!providerPresent) {
    blockers.push('glm_codex_app_config_missing_openrouter_provider');
  } else {
    if (!hasTomlString(providerBody, 'base_url', 'https://openrouter.ai/api/v1')) blockers.push('glm_codex_app_config_invalid_openrouter_base_url');
    if (!hasTomlString(providerBody, 'wire_api', 'responses')) blockers.push('glm_codex_app_config_invalid_openrouter_wire_api');
    if (!hasTomlString(providerBody, 'env_key', 'OPENROUTER_API_KEY')) blockers.push('glm_codex_app_config_invalid_openrouter_env_key');
  }
  const profilesPresent: string[] = [];
  const profilesMissing: string[] = [];
  for (const profile of GLM_CODEX_CONFIG_REASONING_PROFILES) {
    const body = tomlTableBody(text, `profiles.${profile.id}`);
    if (!body) {
      profilesMissing.push(profile.id);
      blockers.push(`glm_codex_app_config_missing_profile:${profile.id}`);
      continue;
    }
    profilesPresent.push(profile.id);
    if (!hasTomlString(body, 'model_provider', GLM_CODEX_CONFIG_PROVIDER_ID)) blockers.push(`glm_codex_app_config_invalid_profile_provider:${profile.id}`);
    if (!hasTomlString(body, 'model', GLM_52_OPENROUTER_MODEL)) blockers.push(`glm_codex_app_config_invalid_profile_model:${profile.id}`);
    if (!hasTomlString(body, 'model_reasoning_effort', profile.reasoning_effort)) blockers.push(`glm_codex_app_config_invalid_profile_reasoning:${profile.id}`);
  }
  return {
    schema: 'sks.codex-app-glm-config-status.v1',
    ok: blockers.length === 0,
    config_path: configPath,
    provider_present: providerPresent,
    profiles_present: profilesPresent,
    profiles_missing: profilesMissing,
    blockers
  };
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
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"${escapeRegExp(value)}"\\s*(?:#.*)?$`, 'm');
  return pattern.test(text);
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
