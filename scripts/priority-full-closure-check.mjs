#!/usr/bin/env node
import { assertGate, emitGate, exists, readText } from './sks-1-18-gate-lib.mjs';

assertGate(exists('docs/priority-closure-p0-p4.md'), 'priority closure doc missing');
assertGate(exists('docs/release-readiness.md'), 'release readiness doc missing');
const readiness = readText('docs/release-readiness.md');
for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
  assertGate(readiness.includes(priority), `release readiness missing ${priority}`);
}
assertGate(!/future work/i.test(readiness), 'release readiness must not defer P1-P4 as future work');
emitGate('priority:full-closure', { priorities: ['P0', 'P1', 'P2', 'P3', 'P4'] });
