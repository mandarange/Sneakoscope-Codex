import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { evaluateGlmNarutoPatchCandidateGate } from '../glm-naruto-patch-candidate-gate.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-candidate-'));
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function candidate(patch: string) {
  return `<sks_patch_candidate>
summary: update a
target_paths:
- src/a.ts
patch:
${patch}</sks_patch_candidate>`;
}

function validPatch() {
  return `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
`;
}

function envelope(body: string) {
  return createPatchEnvelope({
    missionId: 'M-test',
    workerId: 'worker-1',
    shardId: 'shard-1',
    baseDigest: 'base',
    patch: body,
    strategy: 'minimal_patch',
    reasoningEffort: 'low'
  });
}

test('candidate envelope with valid diff passes', async () => {
  const cwd = await tempRepo();
  const gate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope(candidate(validPatch())) });
  assert.equal(gate.ok, true);
  assert.equal(gate.extracted_patch.startsWith('diff --git'), true);
  assert.deepEqual(gate.touched_paths, ['src/a.ts']);
});

test('legacy sks_patch envelope is rejected in Naruto candidate gate', async () => {
  const cwd = await tempRepo();
  const gate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope(`<sks_patch>\n${validPatch()}</sks_patch>`) });
  assert.equal(gate.ok, false);
  assert.ok(gate.blockers.includes('legacy_sks_patch_envelope_rejected'));
});

test('candidate without patch section fails', async () => {
  const cwd = await tempRepo();
  const gate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope('<sks_patch_candidate>\nsummary: nope\n</sks_patch_candidate>') });
  assert.equal(gate.ok, false);
  assert.ok(gate.blockers.includes('missing_patch_section'));
});

test('protected paths and secret-like content fail', async () => {
  const cwd = await tempRepo();
  const protectedPatch = validPatch().replaceAll('src/a.ts', '.github/workflows/ci.yml');
  const protectedGate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope(candidate(protectedPatch)) });
  assert.equal(protectedGate.ok, false);
  assert.ok(protectedGate.blockers.some((blocker) => blocker.includes('.github')));

  const secretGate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope(candidate(validPatch() + '+const key = "sk-or-12345678901234567890";\n')) });
  assert.equal(secretGate.ok, false);
  assert.ok(secretGate.blockers.includes('secret_like_content'));
});

test('git apply check failure fails gate', async () => {
  const cwd = await tempRepo();
  const bad = validPatch().replace('export const a = 1;', 'export const a = 100;');
  const gate = await evaluateGlmNarutoPatchCandidateGate({ cwd, envelope: envelope(candidate(bad)) });
  assert.equal(gate.ok, false);
  assert.ok(gate.blockers.includes('glm_patch_gate_failed'));
});
