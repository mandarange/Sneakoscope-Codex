export const MCP_TOOL_NAME_NORMALIZER_SCHEMA = 'sks.mcp-tool-name-normalizer.v1'

export function normalizeMcpToolName(serverName: string, toolName: string): string {
  const left = normalizeSegment(serverName)
  const right = normalizeSegment(toolName)
  return `${left}__${right}`.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

export function normalizeMcpToolInventory(tools: Array<{ server: string; name: string }>) {
  const seen = new Map<string, number>()
  const normalized = tools.map((tool) => {
    const base = normalizeMcpToolName(tool.server, tool.name)
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    return {
      ...tool,
      normalized_name: count ? `${base}_${count + 1}` : base,
      collision_index: count
    }
  })
  return {
    schema: MCP_TOOL_NAME_NORMALIZER_SCHEMA,
    ok: normalized.every((tool) => /^[a-zA-Z0-9_:-]+$/.test(tool.normalized_name)),
    normalized,
    collision_count: normalized.filter((tool) => tool.collision_index > 0).length
  }
}

function normalizeSegment(value: string): string {
  return String(value || 'unknown').trim().replace(/[^A-Za-z0-9:-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}
