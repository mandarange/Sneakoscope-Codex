import path from 'node:path'
import { appendJsonl, ensureDir, nowIso } from '../fsx.js'
import { CORE_ROLLOUT_TRACE_SCHEMA, type CoreRolloutTrace, type SkillBackend } from './core-skill-types.js'

export function createRolloutTrace(input: Partial<CoreRolloutTrace> & { route: string; backend: SkillBackend }): CoreRolloutTrace {
  return {
    schema: CORE_ROLLOUT_TRACE_SCHEMA,
    route: input.route,
    prompt: String(input.prompt ?? ''),
    skill_id: input.skill_id ?? null,
    skill_version: input.skill_version ?? null,
    backend: input.backend,
    output: input.output,
    proof_artifacts: Array.isArray(input.proof_artifacts) ? input.proof_artifacts : [],
    gate_results: Array.isArray(input.gate_results) ? input.gate_results : [],
    side_effect_ledger: Array.isArray(input.side_effect_ledger) ? input.side_effect_ledger : [],
    latency_ms: Number(input.latency_ms ?? 0),
    cost: input.cost,
    failure_reason: input.failure_reason ?? null,
    rollback_ready: input.rollback_ready === true,
    requested_scope_compliant: input.requested_scope_compliant !== false,
    created_at: nowIso()
  }
}

export function rolloutTracePath(root: string): string {
  return path.join(path.resolve(root), '.sneakoscope', 'reports', 'core-skill-rollout-traces.jsonl')
}

export async function recordRolloutTrace(root: string, trace: CoreRolloutTrace): Promise<string> {
  const file = rolloutTracePath(root)
  await ensureDir(path.dirname(file))
  await appendJsonl(file, trace)
  return file
}
