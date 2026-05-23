import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScoutPrompt } from '../../src/core/scouts/engines/scout-engine-base.mjs';

test('scout prompt treats CLI output capture and read-only mode as normal', () => {
  const prompt = buildScoutPrompt({
    missionId: 'M-test',
    route: '$Team',
    task: 'inspect gaps',
    role: { id: 'scout-1-code-surface', role: 'Repo / Code Surface Scout', json: 'scout-1.json' },
    outputPath: '/tmp/scout-1.json'
  });

  assert.match(prompt, /Codex CLI captures your final response there/);
  assert.match(prompt, /Read-only mode is expected and is not a blocker by itself/);
  assert.match(prompt, /Use unverified for normal evidence gaps/);
  assert.match(prompt, /Tool calls for read-only inspection are allowed/);
  assert.doesNotMatch(prompt, /Write only the requested scout output path/);
  assert.doesNotMatch(prompt, /blockers and unverified arrays when evidence is incomplete/);
});
