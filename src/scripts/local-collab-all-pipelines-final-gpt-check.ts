#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './lib/codex-sdk-gate-lib.js';

const finalizer = await importDist('core/pipeline/finalize-pipeline-result.js');
const blocked = await finalizer.finalizePipelineResult({
  route: '$Team',
  missionId: 'M-local-final-gpt',
  localParticipated: true,
  candidateResults: [{ backend: 'local-llm', summary: 'draft' }],
  candidatePatchEnvelopes: [],
  verificationResults: [],
  sideEffectReport: {},
  mutationLedger: {},
  rollbackPlan: {},
  applyPatches: true,
  forceGptFinalUnavailable: true
});
assertGate(blocked.ok === false, 'local participation without GPT final must block finalization');
assertGate(blocked.blockers.includes('gpt_final_arbiter_required_not_passed'), 'missing GPT final blocker required');
emitGate('local-collab:all-pipelines-final-gpt', { final_status: blocked.final_status, blockers: blocked.blockers.length });
