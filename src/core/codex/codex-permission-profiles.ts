import path from 'node:path'
import { nowIso, readText, writeJsonAtomic } from '../fsx.js'

export const CODEX_PERMISSION_PROFILES_SCHEMA = 'sks.codex-permission-profiles.v1'

export type SksPermissionProfileName =
  | 'sks-safe'
  | 'sks-fast'
  | 'sks-mad'
  | 'sks-mad-target-write'
  | 'sks-mad-system'

export interface CodexPermissionProfile {
  name: SksPermissionProfileName
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approval_policy: 'on-request' | 'on-failure' | 'never'
  allowed_tool_scope: string[]
  file_write_scope: 'none' | 'workspace' | 'target-project' | 'system'
  high_risk: boolean
}

export const SKS_CODEX_PERMISSION_PROFILES: Record<SksPermissionProfileName, CodexPermissionProfile> = {
  'sks-safe': {
    name: 'sks-safe',
    sandbox: 'read-only',
    approval_policy: 'on-request',
    allowed_tool_scope: ['read', 'search', 'diagnostic'],
    file_write_scope: 'none',
    high_risk: false
  },
  'sks-fast': {
    name: 'sks-fast',
    sandbox: 'workspace-write',
    approval_policy: 'on-failure',
    allowed_tool_scope: ['read', 'search', 'diagnostic', 'workspace-write'],
    file_write_scope: 'workspace',
    high_risk: false
  },
  'sks-mad': {
    name: 'sks-mad',
    sandbox: 'workspace-write',
    approval_policy: 'on-request',
    allowed_tool_scope: ['read', 'search', 'diagnostic', 'workspace-write', 'shell'],
    file_write_scope: 'target-project',
    high_risk: true
  },
  'sks-mad-target-write': {
    name: 'sks-mad-target-write',
    sandbox: 'workspace-write',
    approval_policy: 'on-request',
    allowed_tool_scope: ['read', 'search', 'diagnostic', 'workspace-write', 'shell', 'browser', 'computer-use'],
    file_write_scope: 'target-project',
    high_risk: true
  },
  'sks-mad-system': {
    name: 'sks-mad-system',
    sandbox: 'danger-full-access',
    approval_policy: 'on-request',
    allowed_tool_scope: ['read', 'search', 'diagnostic', 'workspace-write', 'shell', 'network', 'browser', 'computer-use', 'system'],
    file_write_scope: 'system',
    high_risk: true
  }
}

export function selectSksCodexPermissionProfile(input: { mad?: boolean; system?: boolean; targetWrite?: boolean; fast?: boolean } = {}): CodexPermissionProfile {
  if (input.system) return SKS_CODEX_PERMISSION_PROFILES['sks-mad-system']
  if (input.targetWrite || input.mad) return SKS_CODEX_PERMISSION_PROFILES['sks-mad-target-write']
  if (input.fast) return SKS_CODEX_PERMISSION_PROFILES['sks-fast']
  return SKS_CODEX_PERMISSION_PROFILES['sks-safe']
}

export async function inventoryCodexPermissionProfiles(root: string, opts: { codexHome?: string; writeReport?: boolean } = {}) {
  const codexHome = opts.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex')
  const configPath = path.join(codexHome, 'config.toml')
  const text = await readText(configPath, '')
  const customProfiles = extractProfileNames(String(text))
  const sksProfiles = Object.values(SKS_CODEX_PERMISSION_PROFILES)
  const profileNames = new Set(customProfiles)
  const missing = sksProfiles.filter((profile) => !profileNames.has(profile.name)).map((profile) => profile.name)
  const report = {
    schema: CODEX_PERMISSION_PROFILES_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    root: path.resolve(root),
    codex_home: codexHome,
    config_path: configPath,
    codex_config_profile_field: 'codex_config_profile',
    codex_permission_profile_field: 'codex_permission_profile',
    sks_profiles: sksProfiles,
    custom_profiles: customProfiles,
    missing_sks_named_profiles: missing,
    blockers: [] as string[],
    warnings: missing.length ? ['sks_permission_profiles_not_all_declared_in_codex_config'] : []
  }
  if (opts.writeReport !== false) {
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-permission-profiles.json'), report)
  }
  return report
}

function extractProfileNames(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(/^\s*\[(?:permissions_profiles|permission_profiles|profiles)\.([A-Za-z0-9_.:-]+)\]\s*$/gm)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort()
}
