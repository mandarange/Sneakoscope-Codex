import { TRUST_REPORT_SCHEMA, isTrustStatus } from '../trust-kernel/trust-kernel-schema.js';
import { type TrustReport } from '../trust-kernel/trust-report.js';
import { ValidationError } from './validation-error.js';

export function parseTrustReport(value: unknown): TrustReport {
  if (!value || typeof value !== 'object') throw new ValidationError(TRUST_REPORT_SCHEMA);
  const report = value as Partial<TrustReport>;
  if (report.schema !== TRUST_REPORT_SCHEMA || typeof report.ok !== 'boolean' || !Array.isArray(report.issues)) {
    throw new ValidationError(TRUST_REPORT_SCHEMA);
  }
  if (!isTrustStatus(report.status) || !isTrustStatus(report.proof_status) || !isTrustStatus(report.evidence_status)) {
    throw new ValidationError(TRUST_REPORT_SCHEMA);
  }
  return report as TrustReport;
}
