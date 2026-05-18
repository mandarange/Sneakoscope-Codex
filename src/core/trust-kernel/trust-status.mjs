import { normalizeTrustStatus } from './trust-kernel-schema.mjs';

export function combineTrustStatus(statuses = []) {
  const values = statuses.map(normalizeTrustStatus);
  if (values.includes('failed')) return 'failed';
  if (values.includes('blocked')) return 'blocked';
  if (values.includes('not_verified')) return 'not_verified';
  if (values.includes('verified_partial')) return 'verified_partial';
  return values.length ? 'verified' : 'not_verified';
}

export function statusFromIssues(issues = [], fallback = 'verified') {
  if (issues.some((issue) => /failed|schema|plaintext_secret/i.test(String(issue)))) return 'failed';
  if (issues.length) return 'blocked';
  return fallback;
}
