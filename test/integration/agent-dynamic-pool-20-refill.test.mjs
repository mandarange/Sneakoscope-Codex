import test from 'node:test';
import assert from 'node:assert/strict';
import { runDynamicPoolFixture } from '../../dist/scripts/agent-dynamic-pool-fixture.js';

test('an oversized 20-slot request schedules through twenty Naruto-aligned active slots', async () => {
  const fixture = await runDynamicPoolFixture({ target: 20, total: 24 });
  assert.equal(fixture.result.state.target_active_slots, 20);
  assert.equal(fixture.result.state.max_observed_active_slots, 20);
  assert.equal(fixture.result.state.pending_queue_drained, true);
});
