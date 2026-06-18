import path from 'node:path';
import { readJson, writeJsonAtomic, nowIso } from '../fsx.js';
import {
  buildGlmCodexAppModelProfile,
  type SksCodexAppModelProfile
} from './glm-model-profile.js';
import { validateGlmCodexAppModelProfile } from './glm-profile-schema.js';
import { resolveOpenRouterApiKey } from '../providers/openrouter/openrouter-secret-store.js';

export interface GlmProfileInstallResult {
  readonly schema: 'sks.codex-app-glm-profile-result.v1';
  readonly generated_at: string;
  readonly ok: boolean;
  readonly status: 'installed' | 'valid' | 'blocked';
  readonly profile: SksCodexAppModelProfile;
  readonly profile_path: string;
  readonly report_path: string;
  readonly openrouter_key_source: string | null;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export async function installCodexAppGlmProfile(input: {
  readonly root: string;
  readonly apply?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<GlmProfileInstallResult> {
  const root = path.resolve(input.root);
  const profile = buildGlmCodexAppModelProfile();
  const profilePath = path.join(root, '.sneakoscope', 'codex-app', 'glm-model-profile.json');
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'codex-app-glm-profile.json');
  const key = await resolveOpenRouterApiKey({ env: input.env || process.env });
  const warnings = [
    ...key.warnings,
    ...(key.key ? [] : ['openrouter_key_missing_until_sks_--mad_--glm_--repair'])
  ];
  if (input.apply !== false) await writeJsonAtomic(profilePath, profile);
  const result: GlmProfileInstallResult = {
    schema: 'sks.codex-app-glm-profile-result.v1',
    generated_at: nowIso(),
    ok: true,
    status: input.apply === false ? 'valid' : 'installed',
    profile,
    profile_path: '.sneakoscope/codex-app/glm-model-profile.json',
    report_path: '.sneakoscope/reports/codex-app-glm-profile.json',
    openrouter_key_source: key.source,
    blockers: [],
    warnings
  };
  await writeJsonAtomic(reportPath, result).catch(() => undefined);
  return result;
}

export async function doctorCodexAppGlmProfile(input: {
  readonly root: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<GlmProfileInstallResult> {
  const root = path.resolve(input.root);
  const profilePath = path.join(root, '.sneakoscope', 'codex-app', 'glm-model-profile.json');
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'codex-app-glm-profile.json');
  const existing = await readJson(profilePath, null);
  const validation = validateGlmCodexAppModelProfile(existing);
  const key = await resolveOpenRouterApiKey({ env: input.env || process.env });
  const profile = validation.profile || buildGlmCodexAppModelProfile();
  const blockers = [...validation.blockers];
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
    openrouter_key_source: key.source,
    blockers,
    warnings
  };
  await writeJsonAtomic(reportPath, result).catch(() => undefined);
  return result;
}
