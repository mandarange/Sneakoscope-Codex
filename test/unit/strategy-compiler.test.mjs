import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStrategy } from '../../dist/core/strategy/strategy-compiler.js';

test('strategy compiler emits ownership, parallel plan, and rollback DAG', () => {
  const compiled = compileStrategy({
    prompt: 'Patch independent files.',
    writeTargets: ['src/core/version.ts', 'README.md']
  });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.file_ownership_plan.no_overlap, true);
  assert.ok(compiled.parallel_modification_plan.batches.length >= 1);
  assert.equal(compiled.verification_rollback_dag.rollback_ready, true);
});
