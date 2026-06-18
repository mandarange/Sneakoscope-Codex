import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatchEnvelope, parsePatchCandidateOutput, digestPatch } from '../glm-naruto-patch-envelope.js';

test('createPatchEnvelope creates valid envelope with unified diff', () => {
  const patch = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
-old line
+new line`;
  const envelope = createPatchEnvelope({
    missionId: 'test',
    workerId: 'worker-0',
    shardId: 'shard-0',
    baseDigest: 'abc123',
    patch,
    strategy: 'minimal_patch',
    reasoningEffort: 'none'
  });
  assert.equal(envelope.schema, 'sks.glm-naruto-patch-envelope.v1');
  assert.equal(envelope.model, 'z-ai/glm-5.2');
  assert.equal(envelope.gpt_fallback_allowed, false);
  assert.ok(envelope.patch_sha256.length > 0);
  assert.ok(envelope.target_paths.includes('src/foo.ts'));
});

test('parsePatchCandidateOutput extracts patch from envelope', () => {
  const output = `<sks_patch_candidate>
summary: fix bug
target_paths:
- src/foo.ts
patch:
diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
</sks_patch_candidate>`;
  const parsed = parsePatchCandidateOutput(output);
  assert.equal(parsed.kind, 'patch');
  assert.ok(parsed.content.includes('diff --git'));
});

test('parsePatchCandidateOutput handles blocked', () => {
  const output = `<sks_blocked>
shard_id: shard-0
reason: cannot fix safely
</sks_blocked>`;
  const parsed = parsePatchCandidateOutput(output);
  assert.equal(parsed.kind, 'blocked');
  assert.equal(parsed.reason, 'cannot fix safely');
});

test('digestPatch normalizes whitespace', () => {
  const d1 = digestPatch('diff --git a/x b/x\n');
  const d2 = digestPatch('diff    --git    a/x    b/x');
  assert.equal(d1, d2);
});
