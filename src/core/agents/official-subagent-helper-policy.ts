import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'

export const OFFICIAL_SUBAGENT_HELPER_POLICY_SCHEMA = 'sks.official-subagent-helper-policy.v1'

export async function writeOfficialSubagentHelperPolicy(root: string, input: { nativeProof?: any } = {}) {
  const nativeProof = input.nativeProof || await readJson<any>(path.join(root, 'native-cli-worker-runtime-proof.json'), null)
  const events = await readText(path.join(root, 'agent-events.jsonl'), '')
  const subagentEventCount = String(events).split(/\n/).filter((line) => /Subagent(Start|Stop)|subagent/i.test(line)).length
  const nativeProcessCount = Number(nativeProof?.spawned_worker_process_count || 0)
  const workerCapacityCredit = 0
  const subagentEventsCountedAsWorkerSessions = false
  const builtInAgentsAllowed = ['default', 'worker', 'explorer']
  const codexAppCapabilitiesAllowed = [
    'image_generation',
    'computer_use_for_native_app_targets',
    'in_app_browser_for_allowed_web_targets',
    'web_search',
    'mcp_tools',
    'product_design_plugin'
  ]
  const requiredOutputProofForGeneratedImages = ['path', 'sha256', 'bytes', 'dimensions', 'model_or_surface']
  const blockers = [
    ...(workerCapacityCredit === 0 ? [] : ['official_helper_worker_capacity_credit_not_zero']),
    ...(subagentEventsCountedAsWorkerSessions === false ? [] : ['official_helper_subagent_events_counted_as_worker_sessions']),
    ...(codexAppCapabilitiesAllowed.includes('image_generation') ? [] : ['official_helper_image_generation_capability_missing']),
    ...(requiredOutputProofForGeneratedImages.includes('sha256') && requiredOutputProofForGeneratedImages.includes('dimensions')
      ? []
      : ['official_helper_image_output_proof_incomplete'])
  ]
  const report = {
    schema: OFFICIAL_SUBAGENT_HELPER_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    official_codex_subagent_helper_lane_enabled: true,
    official_codex_subagents_allowed: true,
    helper_lane_role: 'capability_helper_only',
    helper_lane_may_run_in_parallel_with_native_workers: true,
    worker_capacity_source: 'native-cli-worker-runtime-proof.json',
    worker_capacity_credit: workerCapacityCredit,
    subagent_events_counted_as_worker_sessions: subagentEventsCountedAsWorkerSessions,
    native_worker_process_count: nativeProcessCount,
    observed_subagent_event_count: subagentEventCount,
    built_in_agents_allowed: builtInAgentsAllowed,
    codex_app_capabilities_allowed: codexAppCapabilitiesAllowed,
    codex_builtin_imagegen_helper_allowed: true,
    preferred_image_generation_surface: 'Codex App $imagegen/gpt-image-2',
    codex_app_builtin_evidence_class: 'codex_app_builtin',
    api_fallback_evidence_class: 'api_fallback',
    provider_surface_evidence_required: true,
    imagegen_api_fallback_counts_as_codex_app_evidence: false,
    required_output_proof_for_generated_images: requiredOutputProofForGeneratedImages,
    proof_rule: 'Official Codex subagents and app tools may assist native workers, but never increase requested_agents, target_active_slots, spawned_worker_process_count, or max_observed_worker_process_count.',
    limitations: [
      'helper_subagent_events_do_not_prove_worker_capacity',
      'codex_app_capability_detection_is_not_generated_output_proof',
      'image_generation_claims_require_real_raster_output_evidence'
    ],
    blockers
  }
  await writeJsonAtomic(path.join(root, 'official-subagent-helper-policy.json'), report)
  return report
}
