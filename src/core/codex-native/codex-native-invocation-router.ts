import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexNativeFeatureMatrix } from './codex-native-feature-broker.js'
import type { CodexNativeFeatureMatrix } from './codex-native-feature-matrix.js'

export type CodexNativeRoute = '$Loop' | '$QA-LOOP' | '$Research' | '$Image' | '$MAD' | '$Doctor'

export type CodexNativeDesiredCapability =
  | 'agent-role'
  | 'visual-review'
  | 'plugin-source'
  | 'mcp-source'
  | 'image-followup'
  | 'web-search'
  | 'hook-evidence'
  | 'project-memory'

export interface CodexNativeInvocationPlan {
  schema: 'sks.codex-native-invocation-plan.v1'
  generated_at: string
  ok: boolean
  route: string
  desired_capability: string
  selected_strategy:
    | 'codex-app-native'
    | 'codex-cli-headless'
    | 'codex-sdk'
    | 'sks-managed-artifact'
    | 'message-role-fallback'
    | 'blocked'
  required_artifacts: string[]
  proof_policy: string[]
  env: Record<string, string>
  blockers: string[]
  warnings: string[]
  feature_matrix_artifact: string
}

export async function resolveCodexNativeInvocationPlan(input: {
  root: string
  missionId?: string | null
  route: CodexNativeRoute
  desiredCapability: CodexNativeDesiredCapability
  matrix?: CodexNativeFeatureMatrix | null
}): Promise<CodexNativeInvocationPlan> {
  const root = path.resolve(input.root || process.cwd())
  const matrix = input.matrix || await buildCodexNativeFeatureMatrix({
    root,
    missionDir: input.missionId ? path.join(root, '.sneakoscope', 'missions', input.missionId) : null
  })
  const plan = planFor(matrix, input.route, input.desiredCapability)
  if (input.missionId) {
    const filename = `codex-native-invocation-plan.${routeSlug(input.route)}.${capabilitySlug(input.desiredCapability)}.json`
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'missions', input.missionId, filename), plan).catch(() => undefined)
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-native-invocation-plan.json'), plan).catch(() => undefined)
  return plan
}

function planFor(matrix: CodexNativeFeatureMatrix, route: CodexNativeRoute, capability: CodexNativeDesiredCapability): CodexNativeInvocationPlan {
  const blockers: string[] = []
  const warnings: string[] = []
  let selected: CodexNativeInvocationPlan['selected_strategy'] = 'sks-managed-artifact'
  const artifacts = ['.sneakoscope/reports/codex-native-feature-matrix.json']
  const proofPolicy: string[] = ['record selected strategy and blockers before counting route evidence']

  if (capability === 'agent-role') {
    if (matrix.invocation_defaults.loop_worker_role_strategy === 'agent_type') {
      selected = 'codex-app-native'
      proofPolicy.push('include native agent_type payload in worker proof')
    } else {
      selected = 'message-role-fallback'
      warnings.push('agent_type unavailable; message-role fallback active')
      proofPolicy.push('include message-role fallback in worker proof')
    }
  } else if (capability === 'visual-review') {
    if (matrix.invocation_defaults.hook_evidence_policy === 'unknown-do-not-count') warnings.push('hook-derived evidence will not count')
    selected = matrix.invocation_defaults.qa_visual_review_strategy === 'app-handoff' ? 'codex-app-native' : 'sks-managed-artifact'
    if (matrix.invocation_defaults.qa_visual_review_strategy === 'blocked') {
      selected = 'blocked'
      blockers.push('qa_visual_review_unavailable')
    }
    proofPolicy.push('do not pass visual review without accepted artifact or app handoff confirmation')
  } else if (capability === 'plugin-source' || capability === 'mcp-source') {
    if (matrix.features.mcp_inventory.ok) {
      selected = 'codex-app-native'
      artifacts.push('.sneakoscope/mcp-plugin-server-candidates.json')
      proofPolicy.push('treat remote MCP servers as candidates only until explicitly enabled')
    } else if (matrix.features.code_mode_web_search.ok) {
      selected = 'codex-cli-headless'
      warnings.push('plugin inventory unavailable; code/web source fallback selected')
    } else {
      selected = 'sks-managed-artifact'
      warnings.push('plugin inventory unavailable; local/source-ledger fallback selected')
    }
  } else if (capability === 'web-search') {
    selected = matrix.features.code_mode_web_search.ok ? 'codex-cli-headless' : 'sks-managed-artifact'
    if (!matrix.features.code_mode_web_search.ok) warnings.push('code-mode web search not verified')
  } else if (capability === 'image-followup') {
    selected = matrix.features.image_path_exposure.ok ? 'codex-app-native' : 'sks-managed-artifact'
    proofPolicy.push(matrix.features.image_path_exposure.ok ? 'include model-visible image path' : 'use saved artifact path contract')
  } else if (capability === 'hook-evidence') {
    if (matrix.invocation_defaults.hook_evidence_policy !== 'approved-only') {
      selected = 'blocked'
      blockers.push('hook_approval_not_approved')
      warnings.push('hook-derived proof cannot count')
    } else {
      selected = 'codex-app-native'
    }
    proofPolicy.push('approved hooks only; unknown hook state does not count')
  } else if (capability === 'project-memory') {
    selected = matrix.features.project_memory.ok ? 'sks-managed-artifact' : 'blocked'
    if (!matrix.features.project_memory.ok) blockers.push('project_memory_unavailable')
    proofPolicy.push('project memory is guidance only and never expands write scope')
  }

  return {
    schema: 'sks.codex-native-invocation-plan.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route,
    desired_capability: capability,
    selected_strategy: selected,
    required_artifacts: artifacts,
    proof_policy: proofPolicy,
    env: {
      SKS_CODEX_NATIVE_STRATEGY: selected,
      SKS_CODEX_NATIVE_FEATURE_MATRIX: '.sneakoscope/reports/codex-native-feature-matrix.json',
      SKS_CODEX_NATIVE_AGENT_ROLE_STRATEGY: matrix.invocation_defaults.loop_worker_role_strategy,
      SKS_CODEX_NATIVE_HOOK_EVIDENCE_POLICY: matrix.invocation_defaults.hook_evidence_policy
    },
    blockers,
    warnings,
    feature_matrix_artifact: '.sneakoscope/reports/codex-native-feature-matrix.json'
  }
}

function routeSlug(route: string): string {
  return route.replace(/^\$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function capabilitySlug(capability: string): string {
  return capability.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
