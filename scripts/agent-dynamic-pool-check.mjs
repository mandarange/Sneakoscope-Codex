#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.mjs';
import { runDynamicPoolFixture } from './agent-dynamic-pool-fixture.mjs';

const fixture = await runDynamicPoolFixture({ target: 5, total: 8 });
const state = fixture.result.state;
assertGate(fixture.result.ok === true, 'dynamic pool fixture must drain cleanly', state);
assertGate(state.target_active_slots === 5, 'target active slots must be 5', state);
assertGate(state.max_observed_active_slots === 5, 'scheduler must observe 5 active slots', state);
assertGate(state.pending_queue_drained === true, 'pending queue must drain', state);
assertGate(state.all_slots_closed_after_drain === true, 'all slots must close after drain', state);
emitGate('agent:dynamic-pool', { target_active_slots: state.target_active_slots, max_observed_active_slots: state.max_observed_active_slots, total_work_items: state.total_work_items });
