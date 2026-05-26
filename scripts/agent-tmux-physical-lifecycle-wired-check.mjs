#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.mjs';

const orchestrator = fs.readFileSync(path.join(root, 'src/core/agents/agent-orchestrator.ts'), 'utf8');
const proof = fs.readFileSync(path.join(root, 'src/core/agents/tmux-physical-proof.ts'), 'utf8');

assertGate(orchestrator.includes("import { writeTmuxPhysicalProof }"), 'agent-orchestrator.ts must import writeTmuxPhysicalProof');
for (const phase of ["phase: 'initial'", "phase: 'before_drain'", "phase: 'after_drain'", "phase: 'final'"]) {
  assertGate(orchestrator.includes(phase), `agent-orchestrator.ts missing tmux physical proof lifecycle write ${phase}`);
}
assertGate(orchestrator.includes('SKS_REQUIRE_REAL_TMUX'), 'orchestrator must propagate required real tmux mode');
for (const artifact of [
  'agent-tmux-physical-proof-before-drain.json',
  'agent-tmux-physical-proof-after-drain.json',
  'agent-tmux-physical-proof-final.json',
  'agent-tmux-physical-proof-summary.json'
]) {
  assertGate(proof.includes(artifact), `tmux proof module missing phase artifact ${artifact}`);
}

emitGate('agent:tmux-physical-lifecycle-wired', { phases: ['initial', 'before_drain', 'after_drain', 'final'] });
