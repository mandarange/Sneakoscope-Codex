import test from 'node:test';
import assert from 'node:assert/strict';
import { selectScoutEngine } from '../../src/core/scouts/engines/scout-engine-policy.mjs';

test('scout engine policy blocks fallback when real parallel is required', async () => {
  const selection = await selectScoutEngine(process.cwd(), {
    requested: 'local-static',
    requireRealParallel: true,
    mock: true
  });
  assert.equal(selection.selected, 'local-static');
  assert.equal(selection.available, false);
  assert.ok(selection.blockers.includes('real_parallel_engine_required_but_unavailable'));
});
