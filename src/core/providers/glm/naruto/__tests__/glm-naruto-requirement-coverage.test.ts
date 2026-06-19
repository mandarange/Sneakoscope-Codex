import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmNarutoRequirementLedger } from '../glm-naruto-requirement-ledger.js';
import {
  buildGlmNarutoRequirementCoverageSummary,
  enrichGlmNarutoCandidateRequirementCoverage
} from '../glm-naruto-requirement-coverage.js';
import type { GlmNarutoPatchEnvelope } from '../glm-naruto-types.js';

function envelope(targetPaths: readonly string[]): GlmNarutoPatchEnvelope {
  return {
    schema: 'sks.glm-naruto-patch-envelope.v1',
    mission_id: 'M-test',
    worker_id: 'w1',
    shard_id: 's1',
    base_digest: 'base',
    target_paths: targetPaths,
    patch: 'diff --git a/src/a.ts b/src/a.ts\n',
    patch_sha256: 'sha',
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
    reasoning_effort: 'low',
    gpt_fallback_allowed: false,
    generated_at: new Date(0).toISOString(),
    status: 'gate_passed',
    blockers: [],
    warnings: [],
    strategy: 'minimal_patch'
  };
}

test('coverage blocks missing required preservation requirement', () => {
  const ledger = buildGlmNarutoRequirementLedger({
    missionId: 'M-test',
    task: 'Only change src/a.ts. Preserve src/b.ts behavior.',
    mentionedPaths: ['src/a.ts', 'src/b.ts']
  });
  const enriched = enrichGlmNarutoCandidateRequirementCoverage({ envelope: envelope(['src/a.ts']), ledger });
  const summary = buildGlmNarutoRequirementCoverageSummary({
    missionId: 'M-test',
    ledger,
    envelopes: [enriched],
    selectedPatchIds: ['w1']
  });
  assert.equal(summary.passed, false);
  assert.ok(summary.uncovered_required_requirements.length > 0);
});
