export const ROUTE_COMPLETION_STATES = Object.freeze([
  'route_command_executed',
  'mission_state_transitioned',
  'evidence_intake',
  'route_gate',
  'evidence_router',
  'completion_proof',
  'proof_validation',
  'trust_report'
]);

export function routeStateMachineSnapshot({ proof = {}, evidenceIndex = null, contract = null } = {}) {
  return ROUTE_COMPLETION_STATES.map((state) => ({
    state,
    ok: stateSatisfied(state, { proof, evidenceIndex, contract })
  }));
}

function stateSatisfied(state, { proof, evidenceIndex, contract }) {
  if (state === 'completion_proof') return proof?.schema === 'sks.completion-proof.v1';
  if (state === 'proof_validation') return ['verified', 'verified_partial', 'blocked'].includes(proof?.status);
  if (state === 'evidence_router') return evidenceIndex?.schema === 'sks.evidence-index.v1';
  if (state === 'trust_report') return Boolean(contract?.trust_report || contract?.status);
  if (state === 'route_gate') return Boolean(proof?.evidence?.route_gate);
  if (state === 'evidence_intake') return Boolean(proof?.evidence);
  if (state === 'mission_state_transitioned') return Boolean(proof?.mission_id);
  if (state === 'route_command_executed') return Boolean(proof?.route);
  return false;
}
