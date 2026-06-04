#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, readText } from './lib/codex-sdk-gate-lib.js';

const policyMod = await importDist('core/local-llm/local-collaboration-policy.js');
const schemaText = readText('schemas/local-llm/local-collaboration-policy.schema.json');

const policy = policyMod.resolveLocalCollaborationPolicy({ env: {} });
assertGate(policy.mode === 'local-parallel-gpt-final', 'default local collaboration mode must be local-parallel-gpt-final');
assertGate(policy.gpt_final_required === true, 'default local collaboration mode must require GPT final');
assertGate(policy.final_patch_source_when_enabled === 'gpt_final_arbiter', 'final patch source must be GPT final arbiter');
assertGate(schemaText.includes('local-only-draft'), 'policy schema must include local-only-draft mode');

const draft = policyMod.resolveLocalCollaborationPolicy({ mode: 'local-only-draft' });
const draftGate = policyMod.evaluateLocalCollaborationFinalGate({ policy: draft, localParticipated: true, applyPatches: true });
assertGate(draftGate.ok === false, 'local-only-draft must not pass final gate');
assertGate(draftGate.blockers.includes('needs_gpt_final_review'), 'local-only-draft must carry needs_gpt_final_review');
assertGate(draftGate.blockers.includes('local_only_draft_apply_blocked'), 'local-only-draft must block apply');

emitGate('local-collab:policy', { default_mode: policy.mode, draft_blockers: draftGate.blockers.length });
