import crypto from 'node:crypto';

const SAFE_SESSION_ID = /^[A-Za-z0-9._:-]+$/;

export function normalizeGlmNarutoSessionId(raw: string): string {
  const sanitized = raw.replace(/[^A-Za-z0-9._:-]/g, '-');
  if (sanitized.length <= 256 && SAFE_SESSION_ID.test(sanitized)) return sanitized;
  const digest = crypto.createHash('sha256').update(sanitized).digest('hex').slice(0, 24);
  return `${sanitized.slice(0, 231)}-${digest}`.slice(0, 256);
}
