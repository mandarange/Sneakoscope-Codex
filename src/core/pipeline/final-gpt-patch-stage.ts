export function selectFinalGptPatchSource(gptFinal: any, localPatchEnvelopes: any[] = []) {
  const status = String(gptFinal?.result?.status || gptFinal?.status || '')
  if (status === 'modified') {
    return {
      schema: 'sks.final-gpt-patch-stage.v1',
      ok: true,
      final_patch_source: 'gpt_final_arbiter',
      patch_envelopes: Array.isArray(gptFinal?.result?.modified_patch_envelopes) ? gptFinal.result.modified_patch_envelopes : [],
      blockers: []
    }
  }
  if (status === 'approved') {
    return {
      schema: 'sks.final-gpt-patch-stage.v1',
      ok: true,
      final_patch_source: 'gpt_final_arbiter',
      patch_envelopes: Array.isArray(gptFinal?.result?.accepted_patch_envelopes) && gptFinal.result.accepted_patch_envelopes.length
        ? gptFinal.result.accepted_patch_envelopes
        : localPatchEnvelopes,
      blockers: []
    }
  }
  return {
    schema: 'sks.final-gpt-patch-stage.v1',
    ok: false,
    final_patch_source: 'blocked',
    patch_envelopes: [],
    blockers: ['gpt_final_not_approved']
  }
}
