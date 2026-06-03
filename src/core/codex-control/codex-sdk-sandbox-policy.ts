import type { CodexTaskInput } from './codex-control-plane.js'

export type CodexSdkSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export function mapCodexSdkSandboxPolicy(input: CodexTaskInput): { ok: boolean; sandboxMode: CodexSdkSandboxMode; blockers: string[] } {
  const contract = input.requestedScopeContract || {}
  if (input.sandboxPolicy === 'read-only') return { ok: true, sandboxMode: 'read-only', blockers: [] }
  if (input.sandboxPolicy === 'workspace-write') {
    const allowed = Array.isArray(contract.allowed_paths) ? contract.allowed_paths : []
    const writes = Array.isArray(contract.write_paths) ? contract.write_paths : []
    const scoped = allowed.length > 0 || writes.length > 0
    return {
      ok: scoped,
      sandboxMode: 'workspace-write',
      blockers: scoped ? [] : ['codex_sdk_workspace_write_scope_contract_missing']
    }
  }
  const confirmed = contract.user_confirmed_full_access === true && contract.mad_sks_authorized === true
  return {
    ok: confirmed,
    sandboxMode: 'danger-full-access',
    blockers: confirmed ? [] : ['codex_sdk_full_access_requires_explicit_mad_scope']
  }
}
