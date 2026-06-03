#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/codex-control/codex-sdk-sandbox-policy.js');
const base = {
  route: '$Agent',
  missionId: 'M-sandbox',
  cwd: process.cwd(),
  prompt: 'sandbox fixture',
  outputSchemaId: 'sks.agent-worker-result.v1',
  outputSchema: {},
  mutationLedgerRoot: process.cwd()
};
const readOnly = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'read-only', requestedScopeContract: { read_only: true } });
const workspace = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'workspace-write', requestedScopeContract: { read_only: false, allowed_paths: ['tmp'], write_paths: ['tmp'] } });
const fullBlocked = mod.mapCodexSdkSandboxPolicy({ ...base, sandboxPolicy: 'full-access', requestedScopeContract: { read_only: false } });
assertGate(readOnly.ok && readOnly.sandboxMode === 'read-only', 'read-only sandbox mapping failed', readOnly);
assertGate(workspace.ok && workspace.sandboxMode === 'workspace-write', 'workspace-write sandbox mapping failed', workspace);
assertGate(!fullBlocked.ok && fullBlocked.blockers.includes('codex_sdk_full_access_requires_explicit_mad_scope'), 'full-access must require explicit authorization', fullBlocked);
emitGate('codex-sdk:sandbox-policy', { read_only: readOnly.sandboxMode, workspace: workspace.sandboxMode, full_blockers: fullBlocked.blockers });
