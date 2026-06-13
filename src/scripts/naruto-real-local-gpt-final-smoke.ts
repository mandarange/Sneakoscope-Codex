#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const finalizer = await importDist('core/naruto/naruto-finalizer.js')

const draft = finalizer.evaluateNarutoFinalizer({ localParticipated: true, gptFinalStatus: null, applyPatches: true })
const approved = finalizer.evaluateNarutoFinalizer({ localParticipated: true, gptFinalStatus: 'approved', applyPatches: true })
const deterministic = finalizer.evaluateNarutoFinalizer({ localParticipated: false, applyPatches: true })
const deterministicDraft = finalizer.evaluateNarutoFinalizer({ localParticipated: false, applyPatches: false })
const narutoCommandSource = await fs.readFile(path.join(process.cwd(), 'src/core/commands/naruto-command.ts'), 'utf8')

assertGate(draft.ok === false && draft.blockers.includes('naruto_local_worker_output_needs_gpt_final_arbiter'), 'local worker patch must be blocked until GPT final arbiter', draft)
assertGate(approved.ok === true && approved.final_patch_source === 'gpt_final_arbiter', 'GPT-approved local output must become final patch source', approved)
assertGate(deterministic.ok === true && deterministic.gpt_final_required === false, 'no-local deterministic run must not require GPT final', deterministic)
assertGate(deterministicDraft.final_status === 'draft', 'no-apply Naruto run must remain draft even when writes were possible', deterministicDraft)
assertGate(deterministicDraft.ok === false && deterministicDraft.run_ok === true && deterministicDraft.release_proof_allowed === false, 'no-apply Naruto draft must not masquerade as an accepted finalizer', deterministicDraft)
assertGate(narutoCommandSource.includes('applyPatches: parsed.applyPatches') && !narutoCommandSource.includes('applyPatches: writeCapable'), 'Naruto command finalizer must use explicit apply-patches flag, not write capability')
assertGate(narutoCommandSource.includes('parsed.applyPatches === true ? finalizer.ok === true : finalizer.run_ok === true') && narutoCommandSource.includes('ok: summaryOk'), 'Naruto command top-level ok must separate patch finality from readonly/no-apply run success')

emitGate('naruto:real-local-gpt-final-smoke', {
  require_real_env: process.env.SKS_REQUIRE_LOCAL_LLM === '1' || process.env.SKS_REQUIRE_GPT_FINAL === '1',
  draft_status: draft.final_status,
  approved_status: approved.final_status,
  deterministic_no_apply_status: deterministicDraft.final_status
})
