import { PACKAGE_VERSION, nowIso } from '../fsx.mjs';

export const TRUST_STATUS = Object.freeze([
  'verified',
  'verified_partial',
  'blocked',
  'failed',
  'not_verified'
]);

export const ROUTE_COMPLETION_CONTRACT_SCHEMA = 'sks.route-completion-contract.v1';
export const TRUST_REPORT_SCHEMA = 'sks.trust-report.v1';

export function normalizeTrustStatus(status = 'not_verified') {
  return TRUST_STATUS.includes(status) ? status : 'not_verified';
}

export function trustKernelMetadata() {
  return {
    version: PACKAGE_VERSION,
    generated_at: nowIso()
  };
}
