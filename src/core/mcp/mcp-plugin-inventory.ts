import path from 'node:path'
import { buildCodexPluginInventory, type CodexPluginInventory } from '../codex-plugins/codex-plugin-json.js'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { policyForPluginMcpServer, type McpPluginServerCandidate } from './mcp-server-policy.js'

export interface McpPluginInventory {
  schema: 'sks.mcp-plugin-server-candidates.v1'
  generated_at: string
  candidates: McpPluginServerCandidate[]
  candidate_only: true
  blockers: string[]
}

export function buildMcpPluginServerCandidates(inventory: CodexPluginInventory): McpPluginInventory {
  const candidates = inventory.plugins.flatMap((plugin) => plugin.remote_mcp_servers.map((server) => policyForPluginMcpServer({
    pluginId: plugin.id,
    name: server.name,
    url: server.url,
    authType: server.auth_type
  })))
  return {
    schema: 'sks.mcp-plugin-server-candidates.v1',
    generated_at: nowIso(),
    candidates,
    candidate_only: true,
    blockers: []
  }
}

export async function writeMcpPluginInventoryArtifacts(root: string, input: { inventory?: CodexPluginInventory | null } = {}) {
  const inventory = input.inventory || await buildCodexPluginInventory()
  const candidates = buildMcpPluginServerCandidates(inventory)
  const pluginArtifact = path.join(root, '.sneakoscope', 'codex-plugin-inventory.json')
  const candidateArtifact = path.join(root, '.sneakoscope', 'mcp-plugin-server-candidates.json')
  await writeJsonAtomic(pluginArtifact, inventory)
  await writeJsonAtomic(candidateArtifact, candidates)
  return { inventory, candidates, plugin_artifact: pluginArtifact, candidate_artifact: candidateArtifact }
}
