import type { SksLoopGraphProof } from './loop-schema.js';

export function renderLoopProofSummary(proof: SksLoopGraphProof): string {
  return [
    `Loop graph: ${proof.ok ? 'passed' : 'blocked'}`,
    `Loops: ${proof.total_loops} total / ${proof.completed_loops} done / ${proof.handoff_loops} handoff`,
    `Parallelism: ${proof.parallelism.max_active_loops} active loops / ${proof.parallelism.max_active_workers} max workers / ${proof.parallelism.speedup_ratio}x speedup`,
    `Gates: ${proof.gates.selected.length} selected / ${proof.gates.passed.length} passed`,
    `Blocked: ${proof.blockers.length ? proof.blockers.join(', ') : 'none'}`
  ].join('\n');
}
