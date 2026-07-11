#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-sdk-sandbox-policy.js');
const base = {
  route: '$Agent',
  tier: 'worker',
  missionId: 'M-control-side-effect',
  cwd: process.cwd(),
  prompt: 'side-effect scope fixture',
  outputSchemaId: 'sks.agent-worker-result.v1',
  outputSchema: {},
  mutationLedgerRoot: process.cwd()
};
const readOnly = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'read-only', requestedScopeContract: { read_only: true } });
const emptyWriteScope = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'workspace-write', requestedScopeContract: { read_only: false, allowed_paths: [], write_paths: [] } });
const workspaceScoped = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'workspace-write', requestedScopeContract: { read_only: false, allowed_paths: ['src/core'], write_paths: ['src/core'] } });
const fullBlocked = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'full-access', requestedScopeContract: { read_only: false, user_confirmed_full_access: true, mad_sks_authorized: false } });
const fullMad = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'full-access', requestedScopeContract: { read_only: false, user_confirmed_full_access: true, mad_sks_authorized: true } });
assertGate(readOnly.ok && readOnly.sandboxMode === 'read-only', 'read-only sandbox mapping failed', readOnly);
assertGate(emptyWriteScope.ok && emptyWriteScope.sandboxMode === 'read-only', 'workspace-write without scoped paths must downgrade to read-only', emptyWriteScope);
assertGate(workspaceScoped.ok && workspaceScoped.sandboxMode === 'workspace-write', 'workspace-write scoped mapping failed', workspaceScoped);
assertGate(!fullBlocked.ok && fullBlocked.blockers.includes('codex_sdk_full_access_requires_explicit_mad_scope'), 'full-access must require explicit MAD scope', fullBlocked);
assertGate(fullMad.ok && fullMad.sandboxMode === 'danger-full-access', 'MAD-scoped full access must map to danger-full-access', fullMad);
emitGate('codex-control:side-effect-scope', { read_only: true, workspace_scope_required: true, mad_full_access_required: true });
