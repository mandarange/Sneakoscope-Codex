import { type TrustStatus } from './trust-kernel-schema.js';

export type RouteState =
  | 'prepared'
  | 'executed'
  | 'proof_written'
  | 'evidence_indexed'
  | 'trust_reported'
  | 'blocked';

export interface RouteStateSnapshot {
  schema: 'sks.route-state-machine.v1';
  state: RouteState;
  status: TrustStatus;
  issues: string[];
}

export function routeStateMachineSnapshot(status: TrustStatus, issues: string[] = []): RouteStateSnapshot {
  return {
    schema: 'sks.route-state-machine.v1',
    state: issues.length || status === 'blocked' || status === 'failed' ? 'blocked' : 'trust_reported',
    status,
    issues
  };
}
