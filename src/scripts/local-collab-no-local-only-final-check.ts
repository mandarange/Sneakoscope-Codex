#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const policyMod = await importDist('core/local-llm/local-collaboration-policy.js');
const arbiterMod = await importDist('core/codex-control/gpt-final-arbiter.js');

const gate = policyMod.evaluateLocalCollaborationFinalGate({
  mode: 'local-only-draft',
  localParticipated: true,
  gptFinalStatus: null,
  gptFinalAvailable: false,
  applyPatches: true
});
assertGate(gate.ok === false, 'local-only-draft must not be final accepted');
assertGate(gate.final_status === 'draft_only', 'local-only-draft must end as draft_only');
assertGate(gate.apply_allowed === false, 'local-only-draft must block apply');

const result = await arbiterMod.runGptFinalArbiter({
  schema: 'sks.gpt-final-arbiter-input.v1',
  route: '$DFix',
  mission_id: 'M-local-only-draft',
  local_mode: 'local-only-draft',
  local_outputs: [{ worker_id: 'local', backend: 'local-llm', summary: 'draft only' }],
  candidate_patch_envelopes: []
}, { writeArtifact: false });
assertGate(result.ok === false, 'local-only-draft arbiter result must not pass');
assertGate(result.blockers.includes('needs_gpt_final_review'), 'local-only-draft arbiter must include needs_gpt_final_review');

emitGate('local-collab:no-local-only-final', { final_status: gate.final_status, blockers: result.blockers.length });
