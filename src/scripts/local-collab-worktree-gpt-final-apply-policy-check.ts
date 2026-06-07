#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { gptFinalRequiredForPipeline } from '../core/pipeline/gpt-final-required.js'
import { finalizePipelineResult } from '../core/pipeline/finalize-pipeline-result.js'
import { selectFinalGptPatchSource } from '../core/pipeline/final-gpt-patch-stage.js'

const worktreeEnvelope = {
  schema: 'sks.agent-patch-envelope.v1',
  source: 'git-worktree-diff',
  git_worktree: {
    worktree_path: '/tmp/sks-worker',
    changed_files: ['src/core/example.ts']
  },
  operations: [{ op: 'git_apply_patch', path: '.', diff: 'diff --git a/src/core/example.ts b/src/core/example.ts\n' }]
}
const requirement = gptFinalRequiredForPipeline({
  localParticipated: false,
  candidateResults: [{ backend: 'codex-sdk', patch_envelopes: [worktreeEnvelope] }],
  candidatePatchEnvelopes: [worktreeEnvelope]
})
const blocked = await finalizePipelineResult({
  route: '$Naruto',
  missionId: 'M-worktree-gpt-final-policy',
  localParticipated: false,
  candidateResults: [{ backend: 'codex-sdk', patch_envelopes: [worktreeEnvelope] }],
  candidatePatchEnvelopes: [worktreeEnvelope],
  verificationResults: [],
  sideEffectReport: {},
  mutationLedger: {},
  rollbackPlan: {},
  applyPatches: true,
  forceGptFinalUnavailable: true
})
const modified = selectFinalGptPatchSource({
  result: {
    status: 'modified',
    modified_patch_envelopes: [{ ...worktreeEnvelope, source: 'model_authored', operations: [{ op: 'replace', path: 'src/core/example.ts', search: 'old', replace: 'new' }] }]
  }
}, [worktreeEnvelope])
const rejected = selectFinalGptPatchSource({ result: { status: 'rejected' } }, [worktreeEnvelope])

const ok = requirement.gpt_final_required === true
  && requirement.worktree_participated === true
  && blocked.ok === false
  && blocked.apply_allowed === false
  && blocked.blockers.includes('gpt_final_arbiter_required_not_passed')
  && modified.ok === true
  && modified.final_patch_source === 'gpt_final_arbiter'
  && modified.patch_envelopes[0]?.source === 'model_authored'
  && rejected.ok === false
  && rejected.final_patch_source === 'blocked'

assertGate(ok, 'Worktree/local candidate output must require GPT Final before apply, and GPT modified/rejected decisions must control final patch source', {
  requirement,
  blocked,
  modified,
  rejected
})
emitGate('local-collab:worktree-gpt-final-apply-policy', {
  requirement,
  blocked_apply_allowed: blocked.apply_allowed,
  modified_source: modified.final_patch_source,
  rejected_source: rejected.final_patch_source
})
