import type { SksLoopNode, SksLoopProof } from './loop-schema.js';

export const LOOP_LEVEL_ORDER = ['L0-report', 'L1-assisted', 'L2-action', 'L3-unattended'] as const;

export function canEscalateLoopLevel(input: {
  node: SksLoopNode;
  previousProof: SksLoopProof | null;
  ownerLeaseAcquired: boolean;
}): { ok: boolean; blockers: string[] } {
  const blockers = [
    ...(!input.previousProof?.gate_result.ok ? ['previous_level_proof_not_passed'] : []),
    ...(input.previousProof && input.previousProof.budget.used.iterations >= input.node.budget.max_iterations ? ['loop_budget_exhausted'] : []),
    ...(['high', 'critical'].includes(input.node.risk.level) && input.node.level === 'L3-unattended' ? ['high_risk_l3_blocked'] : []),
    ...(!input.ownerLeaseAcquired ? ['owner_lease_missing'] : []),
    ...(input.node.level === 'L2-action' && !input.node.checker.required_before_next_iteration ? ['checker_required_for_l2'] : []),
    ...(input.node.level === 'L3-unattended' && input.node.dependencies.length === 0 ? ['new_domain_cannot_start_l3'] : [])
  ];
  return { ok: blockers.length === 0, blockers };
}

export function sourceMutationRequiresGptFinal(node: SksLoopNode): boolean {
  return node.level === 'L2-action' || node.risk.requires_gpt_final || node.gates.final.includes('gpt:final-arbiter');
}
