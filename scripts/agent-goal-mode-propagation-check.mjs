#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.mjs';
import { runDynamicPoolFixture } from './agent-dynamic-pool-fixture.mjs';

const fixture = await runDynamicPoolFixture({ target: 5, total: 8 });
const allResultsHaveRefs = fixture.result.results.every((result) => result.goal_mode_ref?.artifact === 'goal-mode-applied.json');
assertGate(allResultsHaveRefs, 'all dynamic generations must propagate Goal mode refs', fixture.result.results);
emitGate('agent:goal-mode-propagation', { result_count: fixture.result.results.length });
