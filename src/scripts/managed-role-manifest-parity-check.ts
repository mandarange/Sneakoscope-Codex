#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const manifest = await importDist('core/managed-assets/managed-assets-manifest.js')
const agentConfig = await importDist('core/agents/agent-role-config.js')

const roles = manifest.MANAGED_AGENT_ROLES.map((role) => role.id)
const files = manifest.MANAGED_AGENT_ROLES.map((role) => role.filename)
const generated = manifest.MANAGED_AGENT_ROLES.every((role) => agentConfig.managedAgentRoleConfigForRole(role.id)?.file === role.filename)
const uniqueIds = new Set(roles).size === roles.length
const uniqueFiles = new Set(files).size === files.length
manifest.assertUniqueManagedAgentRoleFilenames()

const report = {
  schema: 'sks.managed-role-manifest-parity-check.v1',
  role_count: roles.length,
  roles,
  files,
  unique_ids: uniqueIds,
  unique_files: uniqueFiles,
  generated
}

assertGate(uniqueIds && uniqueFiles && generated && roles.includes('sks-checker') && roles.includes('sks-codex-probe-verifier'), 'managed agent role manifest must be the shared generation/inventory source with unique physical files', report)
emitGate('managed-assets:role-manifest-parity', report)
