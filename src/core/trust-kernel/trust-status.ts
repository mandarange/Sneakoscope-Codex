import { normalizeTrustStatus } from './trust-kernel-schema.js';

export function combineTrustStatus(statuses: any = []) {
  const values = statuses.map(normalizeTrustStatus);
  if (values.includes('failed')) return 'failed';
  if (values.includes('blocked')) return 'blocked';
  if (values.includes('not_verified')) return 'not_verified';
  if (values.includes('mock_only')) return 'mock_only';
  if (values.includes('verified_partial')) return 'verified_partial';
  return values.length ? 'verified' : 'not_verified';
}

export function statusFromIssues(issues: any = [], fallback: any = 'verified') {
  if (issues.some((issue: any) => /failed|schema|plaintext_secret/i.test(String(issue)))) return 'failed';
  if (issues.length) return 'blocked';
  return fallback;
}
