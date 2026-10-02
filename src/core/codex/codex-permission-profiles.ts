export type SksPermissionProfileName =
  | 'sks-safe'
  | 'sks-fast'
  | 'sks-mad'
  | 'sks-mad-target-write'
  | 'sks-mad-system'

export interface CodexPermissionProfile {
  name: SksPermissionProfileName
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approval_policy: 'on-request' | 'never'
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
    approval_policy: 'on-request',
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
