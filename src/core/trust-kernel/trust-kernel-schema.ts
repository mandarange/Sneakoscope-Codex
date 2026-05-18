import { PACKAGE_VERSION, nowIso } from '../fsx.js';

export const TRUST_KERNEL_SCHEMA = 'sks.trust-kernel.v1' as const;
export const ROUTE_COMPLETION_CONTRACT_SCHEMA = 'sks.route-completion-contract.v1' as const;
export const TRUST_REPORT_SCHEMA = 'sks.trust-report.v1' as const;

export type TrustStatus =
  | 'verified'
  | 'verified_partial'
  | 'blocked'
  | 'failed'
  | 'not_verified';

export const TRUST_STATUSES: readonly TrustStatus[] = [
  'verified',
  'verified_partial',
  'blocked',
  'failed',
  'not_verified'
] as const;
export const TRUST_STATUS = Object.freeze([...TRUST_STATUSES]);

export interface TrustKernelMetadata {
  trust_kernel_schema: typeof TRUST_KERNEL_SCHEMA;
  typed_contracts: true;
  runtime_validators: true;
  package_boundary_required: true;
  version: string;
  generated_at: string;
}

export function trustKernelMetadata(): TrustKernelMetadata {
  return {
    trust_kernel_schema: TRUST_KERNEL_SCHEMA,
    typed_contracts: true,
    runtime_validators: true,
    package_boundary_required: true,
    version: PACKAGE_VERSION,
    generated_at: nowIso()
  };
}

export function isTrustStatus(value: unknown): value is TrustStatus {
  return typeof value === 'string' && TRUST_STATUSES.includes(value as TrustStatus);
}

export function normalizeTrustStatus(status: unknown = 'not_verified'): TrustStatus {
  return isTrustStatus(status) ? status : 'not_verified';
}
