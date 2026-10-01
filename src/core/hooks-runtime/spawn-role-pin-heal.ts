import { effectiveChildModelAllowlist } from '../subagents/child-model-allowlist.js';
import { refreshStaleManagedRolePins, stalePinForAgentType } from '../subagents/role-model-pins.js';
import { isSpawnAgentToolName, spawnPayloadToolName } from './spawn-tool-name.js';

/**
 * Codex reads a role file when the spawn executes, which is after PreToolUse
 * returns (a hook that rewrote the file ahead of the spawn changed the model the
 * child ran). A spawn that names a managed role whose SKS-owned file still pins
 * an older model is therefore healed here, through the ownership-checked
 * installers, and allowed: the very spawn it precedes runs the current model, so
 * nothing is denied and nobody has to run a repair first. When the file cannot
 * be healed the spawn gate still refuses it.
 */
export async function healStaleRolePinForSpawn(payload: any, root: string): Promise<boolean> {
  if (!isSpawnAgentToolName(spawnPayloadToolName(payload))) return false;
  const input = payload?.tool_input || payload?.toolInput || payload?.tool?.input || {};
  const agent = String(input.agent_type || input.agentType || '').trim();
  if (!agent || !stalePinForAgentType(agent, { root })) return false;
  if (effectiveChildModelAllowlist().mode === 'openrouter_only') return false;
  await refreshStaleManagedRolePins({ root });
  return true;
}
