import test from 'node:test';
import assert from 'node:assert/strict';

test('local collaboration policy defaults to local-parallel-gpt-final with GPT final required', async () => {
  const mod = await import('../../dist/core/local-llm/local-collaboration-policy.js');
  const policy = mod.resolveLocalCollaborationPolicy({ env: {} });
  assert.equal(policy.mode, 'local-parallel-gpt-final');
  assert.equal(policy.gpt_final_required, true);
  assert.equal(policy.final_patch_source_when_enabled, 'gpt_final_arbiter');
});

test('local-only-draft cannot pass final or apply gates', async () => {
  const mod = await import('../../dist/core/local-llm/local-collaboration-policy.js');
  const gate = mod.evaluateLocalCollaborationFinalGate({
    mode: 'local-only-draft',
    localParticipated: true,
    applyPatches: true
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.final_status, 'draft_only');
  assert.equal(gate.apply_allowed, false);
  assert.ok(gate.blockers.includes('needs_gpt_final_review'));
  assert.ok(gate.blockers.includes('local_only_draft_apply_blocked'));
});

test('local backend cannot serve as GPT final arbiter backend', async () => {
  const mod = await import('../../dist/core/local-llm/local-collaboration-policy.js');
  const gate = mod.evaluateLocalCollaborationFinalGate({
    mode: 'local-parallel-gpt-final',
    localParticipated: true,
    gptFinalStatus: 'approved',
    gptFinalBackend: 'ollama'
  });
  assert.equal(gate.ok, false);
  assert.ok(gate.blockers.includes('gpt_final_backend_must_not_be_local_llm'));
});
