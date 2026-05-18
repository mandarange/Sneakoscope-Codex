import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { scoutEngineResult } from '../../src/core/scouts/engines/scout-engine-base.mjs';

test('scoutEngineResult records output file jobs for real engines', () => {
  const outputFile = path.join('.sneakoscope', 'missions', 'M-test', 'scout-1.codex.md');
  const result = scoutEngineResult({
    engine: 'codex-exec-parallel',
    jobs: [{ scout_id: 'scout-1-code-surface', status: 'fulfilled', code: 0, output_file: outputFile }],
    sourcePolicy: { primary_source: 'parsed_real_scout_outputs' }
  });
  assert.equal(result.real_parallel, true);
  assert.equal(result.jobs[0].output_file, outputFile);
  assert.equal(result.source_policy.primary_source, 'parsed_real_scout_outputs');
});
