#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.mjs';
import { runDynamicPoolFixture } from './agent-dynamic-pool-fixture.mjs';

const fixture = await runDynamicPoolFixture({ target: 5, total: 8 });
const allResultsHaveRefs = fixture.result.results.every((result) => result.source_intelligence_refs?.artifact === 'source-intelligence-evidence.json');
assertGate(allResultsHaveRefs, 'all dynamic generations must propagate source intelligence refs', fixture.result.results);
emitGate('agent:source-intelligence-propagation', { result_count: fixture.result.results.length });
