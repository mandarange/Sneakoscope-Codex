export const NARUTO_REAL_WRITE_PROOF_SCHEMA = 'sks.naruto-real-write-proof.v1'

// Exact blocker values that legitimately record "work could not be safely
// split across ≥2 workers" — matched by strict equality only. A substring
// match here would let any unrelated blocker text mentioning this word
// silently waive the worker-diversity requirement.
const UNSPLITTABLE_BLOCKER_VALUES = new Set([
  'native_session_unsplittable_evidence_recorded',
  'unsplittable_write_scope_explicit'
])

export interface NarutoRealWriteProof {
  schema: typeof NARUTO_REAL_WRITE_PROOF_SCHEMA
  ok: boolean
  mission_id: string
  backend: 'codex-sdk'
  readonly: false
  write_mode: 'parallel'
  changed_files: string[]
  worker_ids: string[]
  patch_envelopes: Array<{
    envelope_id: string
    agent_id: string
    changed_files: string[]
    applied: boolean
  }>
  parent_merge_artifact: string
  typecheck: {
    ok: boolean
    command: string
  }
  cleanup: {
    ok: boolean
  }
  blockers: string[]
}

export interface NarutoRealWriteProofValidation {
  ok: boolean
  blockers: string[]
}

export function validateNarutoRealWriteProof(input: unknown): NarutoRealWriteProofValidation {
  const proof = input as Partial<NarutoRealWriteProof> | null
  const blockers: string[] = []
  if (!proof || typeof proof !== 'object') {
    return { ok: false, blockers: ['naruto_real_write_proof_invalid_json'] }
  }
  if (proof.schema !== NARUTO_REAL_WRITE_PROOF_SCHEMA) blockers.push('naruto_real_write_proof_schema_invalid')
  if (proof.backend !== 'codex-sdk') blockers.push('backend_codex_sdk_required')
  if (proof.readonly !== false) blockers.push('readonly_false_required')
  if (proof.write_mode !== 'parallel') blockers.push('write_mode_parallel_required')
  if (!String(proof.mission_id || '').trim()) blockers.push('mission_id_missing')
  const changedFiles = uniqueStrings(proof.changed_files)
  const workerIds = uniqueStrings(proof.worker_ids)
  const patchEnvelopes = Array.isArray(proof.patch_envelopes) ? proof.patch_envelopes : []
  const explicitUnsplittableBlock = Array.isArray(proof.blockers)
    && proof.blockers.some((blocker) => UNSPLITTABLE_BLOCKER_VALUES.has(String(blocker)))
  if (changedFiles.length < 1) blockers.push('real_write_changed_files_missing')
  if (workerIds.length < 2 && !explicitUnsplittableBlock) blockers.push('worker_id_diversity_below_2')
  if (patchEnvelopes.length < 1) blockers.push('patch_envelope_count_below_1')
  for (const [index, envelope] of patchEnvelopes.entries()) {
    if (!String(envelope?.envelope_id || '').trim()) blockers.push(`patch_envelope_${index}_id_missing`)
    if (!String(envelope?.agent_id || '').trim()) blockers.push(`patch_envelope_${index}_agent_id_missing`)
    if (!Array.isArray(envelope?.changed_files)) blockers.push(`patch_envelope_${index}_changed_files_missing`)
    if (envelope?.applied !== true) blockers.push(`patch_envelope_${index}_not_applied`)
  }
  if (!String(proof.parent_merge_artifact || '').trim()) blockers.push('parent_merge_artifact_missing')
  if (proof.typecheck?.ok !== true) blockers.push('typecheck_failed')
  if (!String(proof.typecheck?.command || '').trim()) blockers.push('typecheck_command_missing')
  if (proof.cleanup?.ok !== true) blockers.push('cleanup_failed')
  if (proof.ok !== true) blockers.push('proof_not_ok')
  if (Array.isArray(proof.blockers) && proof.ok === true && proof.blockers.length > 0) blockers.push('proof_ok_has_blockers')
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] }
}

export function realisticNarutoRealWriteProofFixture(overrides: Partial<NarutoRealWriteProof> = {}): NarutoRealWriteProof {
  return {
    schema: NARUTO_REAL_WRITE_PROOF_SCHEMA,
    ok: true,
    mission_id: 'M-naruto-real-write-fixture',
    backend: 'codex-sdk',
    readonly: false,
    write_mode: 'parallel',
    changed_files: ['src/a.ts', 'src/b.ts'],
    worker_ids: ['naruto-write-worker-a', 'naruto-write-worker-b'],
    patch_envelopes: [
      { envelope_id: 'naruto-write-worker-a:naruto-write-worker-a-session:naruto-write-a', agent_id: 'naruto-write-worker-a', changed_files: ['src/a.ts'], applied: true },
      { envelope_id: 'naruto-write-worker-b:naruto-write-worker-b-session:naruto-write-b', agent_id: 'naruto-write-worker-b', changed_files: ['src/b.ts'], applied: true }
    ],
    parent_merge_artifact: 'agents/agent-patch-swarm-runtime.json',
    typecheck: { ok: true, command: 'node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit' },
    cleanup: { ok: true },
    blockers: [],
    ...overrides
  }
}

export function buildNarutoRealWriteProof(input: {
  missionId: string
  changedFiles: string[]
  workerIds: string[]
  patchEnvelopes: NarutoRealWriteProof['patch_envelopes']
  parentMergeArtifact: string
  typecheck: NarutoRealWriteProof['typecheck']
  cleanup: NarutoRealWriteProof['cleanup']
  blockers?: string[]
}): NarutoRealWriteProof {
  const draft: NarutoRealWriteProof = {
    schema: NARUTO_REAL_WRITE_PROOF_SCHEMA,
    ok: false,
    mission_id: input.missionId,
    backend: 'codex-sdk',
    readonly: false,
    write_mode: 'parallel',
    changed_files: uniqueStrings(input.changedFiles).map(normalizeRelPath).sort(),
    worker_ids: uniqueStrings(input.workerIds).sort(),
    patch_envelopes: input.patchEnvelopes.map((envelope) => ({
      envelope_id: String(envelope.envelope_id || ''),
      agent_id: String(envelope.agent_id || ''),
      changed_files: uniqueStrings(envelope.changed_files).map(normalizeRelPath).sort(),
      applied: envelope.applied === true
    })),
    parent_merge_artifact: input.parentMergeArtifact,
    typecheck: input.typecheck,
    cleanup: input.cleanup,
    blockers: uniqueStrings(input.blockers || [])
  }
  const structural = validateNarutoRealWriteProof({ ...draft, ok: true, blockers: [] })
  draft.blockers = uniqueStrings([...(input.blockers || []), ...structural.blockers])
  draft.ok = draft.blockers.length === 0
  return draft
}

function uniqueStrings(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function normalizeRelPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
}
