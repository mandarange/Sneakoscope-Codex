import { cardHash, loadDeployedSnapshot } from './core-skill-card.js'
import { isDeploymentContext } from './core-skill-deployment.js'
import type { CoreSkillCard } from './core-skill-types.js'

export interface RouteSkillSelection {
  skill_id: string | null
  version: number | null
  hash: string | null
  source: 'deployed' | 'fallback'
  warning: string | null
  // Skill body is injected as a system/developer instruction fragment only; it
  // never confers mutation rights.
  instruction: string | null
}

/**
 * Inference-path skill selection. Reads ONLY the deployed snapshot for a route/skill
 * and returns it as an instruction fragment. Never invokes the optimizer. Missing
 * snapshot is a graceful fallback with a warning (route still runs).
 */
export async function selectRouteSkill(root: string, route: string, skillId: string): Promise<RouteSkillSelection> {
  let card: CoreSkillCard | null = null
  try {
    card = await loadDeployedSnapshot(root, route, skillId)
  } catch {
    card = null
  }
  if (!card) {
    return { skill_id: skillId, version: null, hash: null, source: 'fallback', warning: `no_deployed_skill_snapshot:${route}/${skillId}`, instruction: null }
  }
  return {
    skill_id: card.skill_id,
    version: card.version,
    hash: cardHash(card),
    source: 'deployed',
    warning: null,
    instruction: card.body
  }
}

/** Compact record for route proof evidence. */
export function skillProofRecord(selection: RouteSkillSelection) {
  return {
    skill_id: selection.skill_id,
    version: selection.version,
    hash: selection.hash,
    source: selection.source,
    optimizer_invoked: false,
    deployment_context: isDeploymentContext()
  }
}
