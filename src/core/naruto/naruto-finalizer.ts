export interface NarutoFinalizerDecision {
  schema: 'sks.naruto-finalizer.v1'
  local_participated: boolean
  gpt_final_required: boolean
  final_status: 'draft' | 'accepted' | 'blocked'
  final_patch_source: 'gpt_final_arbiter' | 'deterministic_no_local'
  blockers: string[]
  run_ok: boolean
  release_proof_allowed: boolean
  apply_finalized: boolean
  ok: boolean
}

export function evaluateNarutoFinalizer(input: {
  localParticipated?: boolean
  gptFinalStatus?: string | null
  applyPatches?: boolean
} = {}): NarutoFinalizerDecision {
  const localParticipated = input.localParticipated === true
  const gptFinalRequired = localParticipated
  const gptFinalAccepted = input.gptFinalStatus === 'approved' || input.gptFinalStatus === 'modified'
  const blockers = [
    ...(gptFinalRequired && !gptFinalAccepted ? ['naruto_local_worker_output_needs_gpt_final_arbiter'] : [])
  ]
  const finalStatus = blockers.length ? 'blocked' : input.applyPatches === true ? 'accepted' : 'draft'
  const applyFinalized = finalStatus === 'accepted'
  return {
    schema: 'sks.naruto-finalizer.v1',
    local_participated: localParticipated,
    gpt_final_required: gptFinalRequired,
    final_status: finalStatus,
    final_patch_source: gptFinalRequired ? 'gpt_final_arbiter' : 'deterministic_no_local',
    blockers,
    run_ok: blockers.length === 0,
    release_proof_allowed: applyFinalized,
    apply_finalized: applyFinalized,
    ok: applyFinalized
  }
}
