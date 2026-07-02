import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('pipeline-runtime compatibility facade is removed', () => {
  const file = path.join(root, 'src/core/pipeline-runtime.ts');
  assert.equal(fs.existsSync(file), false);
});

test('pipeline budget required split modules exist', () => {
  for (const file of [
    'plan-schema.ts',
    'stage-policy.ts',
    'agent-stage-policy.ts',
    'route-prep.ts',
    'route-prep-team.ts',
    'route-prep-research.ts',
    'route-prep-qa.ts',
    'route-prep-ppt.ts',
    'route-prep-image-ux.ts',
    'route-prep-db.ts',
    'route-prep-gx.ts',
    'stop-gate.ts',
    'stop-gate-context7.ts',
    'stop-gate-subagents.ts',
    'stop-gate-proof.ts',
    'active-context.ts',
    'prompt-context.ts',
    'prompt-context-dfix.ts',
    'prompt-context-answer.ts',
    'prompt-context-computer-use.ts',
    'pipeline-plan-writer.ts',
    'validation.ts'
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'src/core/pipeline', file)), true, file);
  }
});
