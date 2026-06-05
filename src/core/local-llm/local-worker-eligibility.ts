import type { CodexTaskInput } from '../codex-control/codex-control-plane.js'
import type { LocalModelConfig } from '../agents/ollama-worker-config.js'

export function evaluateLocalWorkerEligibility(input: CodexTaskInput, config: LocalModelConfig) {
  const prompt = String(input.prompt || '')
  const writePaths = Array.isArray(input.requestedScopeContract?.write_paths) ? input.requestedScopeContract.write_paths.map(String) : []
  const forbidden = /\b(strategy|planning|architecture|design|final review|verification authority|safety authority|integration|database|migration|permission approval)\b/i.test(prompt)
  const allowed = /\b(worker|patch|read-only|grep|qa|test|docstring|summary|refactor)\b/i.test(`${input.route} ${prompt}`)
  const blockers = [
    ...(config.enabled ? [] : ['local_llm_disabled']),
    ...(config.status === 'verified' ? [] : [`local_llm_${config.status}`]),
    ...(input.tier === 'worker' ? [] : ['local_llm_worker_tier_only']),
    ...(input.sandboxPolicy === 'full-access' ? ['local_llm_full_access_blocked'] : []),
    ...(input.localLlmPolicy?.requiresGptFinal === false ? ['local_llm_requires_gpt_final_policy_missing'] : []),
    ...(forbidden ? ['local_llm_forbidden_task_class'] : []),
    ...(!allowed && !writePaths.length ? ['local_llm_task_not_eligible'] : [])
  ]
  return {
    schema: 'sks.local-worker-eligibility.v1',
    ok: blockers.length === 0,
    task_classes: {
      allowed_detected: allowed,
      forbidden_detected: forbidden,
      write_path_count: writePaths.length
    },
    requires_gpt_final: true,
    blockers
  }
}
