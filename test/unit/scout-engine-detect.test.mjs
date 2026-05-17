import test from 'node:test';
import assert from 'node:assert/strict';
import { detectScoutEngines } from '../../src/core/scouts/engines/scout-engine-detect.mjs';

test('scout engine detection reports all supported engine names', async () => {
  const report = await detectScoutEngines(process.cwd());
  assert.equal(report.schema, 'sks.scout-engines.v1');
  const names = report.engines.map((engine) => engine.name).sort();
  assert.deepEqual(names, ['codex-app-subagents', 'codex-exec-parallel', 'local-static', 'sequential-fallback', 'tmux-lanes'].sort());
  assert.equal(report.engines.find((engine) => engine.name === 'local-static').available, true);
});
