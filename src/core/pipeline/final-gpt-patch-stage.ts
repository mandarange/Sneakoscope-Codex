export function selectFinalGptPatchSource(gptFinal: any, localPatchEnvelopes: any[] = []) {
  const status = String(gptFinal?.result?.status || gptFinal?.status || '')
  if (status === 'modified') {
    return {
      schema: 'sks.final-gpt-patch-stage.v1',
      ok: true,
      final_patch_source: 'gpt_final_arbiter',
      patch_envelopes: decodePatchDecisionItems(gptFinal?.result?.modified_patch_envelopes),
      blockers: []
    }
  }
  if (status === 'approved') {
    const accepted = decodePatchDecisionItems(gptFinal?.result?.accepted_patch_envelopes)
    return {
      schema: 'sks.final-gpt-patch-stage.v1',
      ok: true,
      final_patch_source: 'gpt_final_arbiter',
      patch_envelopes: accepted.length
        ? accepted
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

function decodePatchDecisionItems(value: unknown): any[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (entry && typeof entry === 'object' && typeof (entry as any).patch_envelope_json === 'string') {
      try {
        const parsed = JSON.parse((entry as any).patch_envelope_json)
        return parsed && typeof parsed === 'object' && Object.keys(parsed).length ? [parsed] : []
      } catch {
        return []
      }
    }
    return entry && typeof entry === 'object' ? [entry] : []
  })
}
