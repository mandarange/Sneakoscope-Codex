import test from 'node:test';
import assert from 'node:assert/strict';
import { detectScoutEngines } from '../../src/core/scouts/engines/scout-engine-detect.mjs';

test('codex-exec-parallel real scout engine is opt-in', { skip: process.env.SKS_TEST_REAL_SCOUTS !== '1' }, async () => {
  const report = await detectScoutEngines(process.cwd());
  const engine = report.engines.find((row) => row.name === 'codex-exec-parallel');
  assert.ok(engine);
  if (!engine.available) assert.ok(engine.reason);
});
