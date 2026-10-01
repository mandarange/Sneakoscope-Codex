/**
 * The names Codex gives the multi-agent spawn tool in a hook payload:
 * `spawn_agent`, `functions.spawn_agent`, `collaboration.spawn_agent`, and, for
 * the namespaced multi-agent tool, the namespace and name joined with no
 * separator: `collaborationspawn_agent` as Codex 0.159 sends it, and
 * `multi_agent_v1spawn_agent` as the 0.142 builds recorded it. Every spawn guard
 * must match all of them: a form one guard misses is a spawn that no model seal,
 * model check, or role check ever sees.
 */
const SPAWN_AGENT_TOOL_RE = /^(?:functions\.)?(?:(?:collaboration|multi_agent_v\d+)[._]?)?spawn_agent$/;

export function isSpawnAgentToolName(name: unknown): boolean {
  return SPAWN_AGENT_TOOL_RE.test(String(name ?? '').trim());
}

/** The tool name a hook payload carries, in any of the shapes Codex has used. */
export function spawnPayloadToolName(payload: any = {}): string {
  return String(payload?.tool_name || payload?.toolName || payload?.tool?.name || '');
}
