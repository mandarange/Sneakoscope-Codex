import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('pipeline-runtime is a small compatibility facade', () => {
  const file = path.join(root, 'src/core/pipeline-runtime.mjs');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.split(/\r?\n/).length <= 300);
  assert.match(text, /pipeline-internals\/runtime-core\.mjs/);
  assert.doesNotMatch(text, /\bfrom ['"].*\b(team|qa|research|ppt|image-ux-review|db|gx)\b/i);
});

test('pipeline budget required split modules exist', () => {
  for (const file of [
    'plan-schema.mjs',
    'stage-policy.mjs',
    'scout-stage-policy.mjs',
    'route-prep.mjs',
    'route-prep-team.mjs',
    'route-prep-research.mjs',
    'route-prep-qa.mjs',
    'route-prep-ppt.mjs',
    'route-prep-image-ux.mjs',
    'route-prep-db.mjs',
    'route-prep-gx.mjs',
    'stop-gate.mjs',
    'stop-gate-context7.mjs',
    'stop-gate-subagents.mjs',
    'stop-gate-proof.mjs',
    'active-context.mjs',
    'prompt-context.mjs',
    'prompt-context-dfix.mjs',
    'prompt-context-answer.mjs',
    'prompt-context-computer-use.mjs',
    'pipeline-plan-writer.mjs',
    'validation.mjs'
  ]) {
    assert.equal(fs.existsSync(path.join(root, 'src/core/pipeline', file)), true, file);
  }
});
