import { type RouteCompletionContract } from '../trust-kernel/route-contract.js';
import { ROUTE_COMPLETION_CONTRACT_SCHEMA, isTrustStatus } from '../trust-kernel/trust-kernel-schema.js';
import { ValidationError } from './validation-error.js';

export function parseRouteCompletionContract(value: unknown): RouteCompletionContract {
  if (!value || typeof value !== 'object') throw new ValidationError(ROUTE_COMPLETION_CONTRACT_SCHEMA);
  const contract = value as Partial<RouteCompletionContract>;
  if (contract.schema !== ROUTE_COMPLETION_CONTRACT_SCHEMA || !contract.required || typeof contract.required !== 'object') {
    throw new ValidationError(ROUTE_COMPLETION_CONTRACT_SCHEMA);
  }
  if (!contract.evidence || typeof contract.evidence !== 'object' || !isTrustStatus(contract.status)) {
    throw new ValidationError(ROUTE_COMPLETION_CONTRACT_SCHEMA);
  }
  return contract as RouteCompletionContract;
}
