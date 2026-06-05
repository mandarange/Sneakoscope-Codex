#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const finalizer = await importDist('core/naruto/naruto-finalizer.js')

const draft = finalizer.evaluateNarutoFinalizer({ localParticipated: true, gptFinalStatus: null, applyPatches: true })
const approved = finalizer.evaluateNarutoFinalizer({ localParticipated: true, gptFinalStatus: 'approved', applyPatches: true })
const deterministic = finalizer.evaluateNarutoFinalizer({ localParticipated: false, applyPatches: true })

assertGate(draft.ok === false && draft.blockers.includes('naruto_local_worker_output_needs_gpt_final_arbiter'), 'local worker patch must be blocked until GPT final arbiter', draft)
assertGate(approved.ok === true && approved.final_patch_source === 'gpt_final_arbiter', 'GPT-approved local output must become final patch source', approved)
assertGate(deterministic.ok === true && deterministic.gpt_final_required === false, 'no-local deterministic run must not require GPT final', deterministic)

emitGate('naruto:real-local-gpt-final-smoke', {
  require_real_env: process.env.SKS_REQUIRE_LOCAL_LLM === '1' || process.env.SKS_REQUIRE_GPT_FINAL === '1',
  draft_status: draft.final_status,
  approved_status: approved.final_status
})

