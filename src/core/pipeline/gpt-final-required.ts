import { localCollaborationParticipated } from '../local-llm/local-collaboration-policy.js'

export function gptFinalRequiredForPipeline(input: {
  localParticipated?: boolean
  candidateResults?: unknown[]
  candidatePatchEnvelopes?: unknown[]
}) {
  const localParticipated = input.localParticipated === true
    || localCollaborationParticipated(Array.isArray(input.candidateResults) ? input.candidateResults : [])
  const worktreeParticipated = worktreeCandidateParticipated(input.candidateResults)
    || worktreeCandidateParticipated(input.candidatePatchEnvelopes)
  return {
    schema: 'sks.gpt-final-required.v1',
    local_participated: localParticipated,
    worktree_participated: worktreeParticipated,
    gpt_final_required: localParticipated || worktreeParticipated,
    reason: localParticipated
      ? 'local_llm_outputs_are_drafts'
      : worktreeParticipated
        ? 'worktree_candidate_outputs_require_gpt_final'
        : 'no_local_or_worktree_candidate_participation'
  }
}

function worktreeCandidateParticipated(values: unknown[] | undefined): boolean {
  return (Array.isArray(values) ? values : []).some((value: any) => {
    if (!value || typeof value !== 'object') return false
    if (value.source === 'git-worktree-diff') return true
    if (value.git_worktree?.worktree_path || value.git_worktree?.checkpoint?.commit_hash) return true
    if (value.git_worktree_diff || value.git_worktree_checkpoint) return true
    return Array.isArray(value.patch_envelopes) && worktreeCandidateParticipated(value.patch_envelopes)
  })
}
