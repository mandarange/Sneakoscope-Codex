import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { runPatchWorker } from '../glm-naruto-worker-runtime.js';
import type { GlmNarutoShard } from '../glm-naruto-types.js';

function fetchCandidate(): typeof fetch {
  return (async () => {
    const content = `<sks_patch_candidate>
summary: update
target_paths:
- src/a.ts
patch:
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-a
+b
</sks_patch_candidate>`;
    const frame = `data: ${JSON.stringify({ model: 'z-ai/glm-5.2', choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      }
    }), { status: 200 });
  }) as typeof fetch;
}

test('successful worker writes local artifacts before aggregate writer', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-worker-artifacts-'));
  const shard: GlmNarutoShard = {
    id: 'shard-1',
    kind: 'file_patch',
    task: 'change src/a.ts',
    target_paths: ['src/a.ts'],
    forbidden_paths: [],
    base_digest: 'base',
    strategy: 'minimal_patch',
    patches_per_shard: 1,
    max_tokens: 1000,
    reasoning: 'low',
    mutable: true
  };
  const result = await runPatchWorker({ apiKey: 'sk-or-test', missionId: 'M-test', workerId: 'worker-1', root, shard, contextSummary: '{}', timeoutMs: 1000, fetchImpl: fetchCandidate() });
  assert.equal(result.ok, true);
  const workerDir = path.join(root, '.sneakoscope', 'glm-naruto', 'M-test', 'workers', 'worker-1');
  for (const file of ['request-summary.json', 'stream-trace.json', 'patch-envelope.json', 'gate-result.json', 'termination.json']) {
    await fsp.access(path.join(workerDir, file));
  }
  const requestSummary = await fsp.readFile(path.join(workerDir, 'request-summary.json'), 'utf8');
  assert.equal(requestSummary.includes('sk-or-test'), false);
});
