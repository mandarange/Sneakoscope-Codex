#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';
import { makeTempPatchProject, writeReport } from './agent-patch-swarm-gate-lib.js';

const strategy = await importDist('core/strategy/strategy-compiler.js');
const rosterMod = await importDist('core/agents/agent-roster.js');
const partitionMod = await importDist('core/agents/agent-work-partition.js');
const tmp = makeTempPatchProject('sks-strategy-lease-');
const files = Array.from({ length: 10 }, (_, index) => `file-${index + 1}.txt`);
const prompt = files.map((file) => `\`${file}\``).join(' ');
const compiled = strategy.compileStrategy({ prompt, route: '$Agent', agentCount: 5 });
const roster = rosterMod.buildAgentRoster({ agents: 5, concurrency: 5, prompt });
const partition = await partitionMod.buildAgentWorkPartition(tmp, roster, prompt, {
  route: '$Agent',
  targetActiveSlots: 5,
  desiredWorkItemCount: 10,
  minimumWorkItems: 10,
  strategyOwnershipPlan: compiled.file_ownership_plan,
  microWins: compiled.gate.micro_wins
});
const writeLeases = partition.leases.filter((lease) => lease.kind === 'write');
const report = { schema: 'sks.agent-strategy-to-lease-wiring-check.v1', ok: partition.ok, tmp, compiled, writeLeases };
writeReport('agent-strategy-to-lease-wiring', report);
assertGate(compiled.file_ownership_plan.no_overlap === true, 'strategy file ownership plan must have no overlaps', report);
assertGate(writeLeases.length >= 10, 'strategy write targets must become write leases', report);
assertGate(writeLeases.every((lease) => lease.strategy_task_id && lease.micro_win_id && lease.owner_persona), 'leases must carry strategy task, micro-win, and persona metadata', report);
assertGate(writeLeases.every((lease) => lease.verification_node_id && lease.rollback_node_id), 'leases must carry verification and rollback node ids', report);
assertGate(fs.existsSync(path.join(tmp, 'file-1.txt')), 'fixture sanity check failed', report);
emitGate('agent:strategy-to-lease-wiring', { write_lease_count: writeLeases.length });
