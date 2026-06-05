import { localCollaborationParticipated } from '../local-llm/local-collaboration-policy.js'

export function gptFinalRequiredForPipeline(input: {
  localParticipated?: boolean
  candidateResults?: unknown[]
}) {
  const localParticipated = input.localParticipated === true
    || localCollaborationParticipated(Array.isArray(input.candidateResults) ? input.candidateResults : [])
  return {
    schema: 'sks.gpt-final-required.v1',
    local_participated: localParticipated,
    gpt_final_required: localParticipated,
    reason: localParticipated ? 'local_llm_outputs_are_drafts' : 'no_local_participation'
  }
}
