import os from 'node:os';
import path from 'node:path';

const SECRET_ASSIGNMENT = /\b(token|access[_-]?token|api[_-]?key|secret|client[_-]?secret|password|authorization|bearer|credential|private[_-]?key)\b(\s*[:=]\s*)([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const PROVIDER_SECRET = /(?:\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{16,}\b|\bAIza[A-Za-z0-9_-]{30,}\b)/i;
const PROVIDER_SECRET_GLOBAL = /(?:\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{16,}\b|\bAIza[A-Za-z0-9_-]{30,}\b)/gi;
const JWT_SECRET = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/i;
const JWT_SECRET_GLOBAL = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gi;

export function isSensitiveMcpArgumentName(value: string): boolean {
  return /^--?(?:token|access[-_]?token|api[-_]?key|secret|client[-_]?secret|password|authorization|bearer|credential|private[-_]?key)(?:$|=)/i.test(String(value || ''));
}

export function looksLikeMcpSecretValue(value: string): boolean {
  const text = String(value || '').trim();
  return PROVIDER_SECRET.test(text) || JWT_SECRET.test(text);
}

export function redactMcpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') return '[configured URL]';
    return url.pathname && url.pathname !== '/' ? `${url.origin}/…` : url.origin;
  } catch {
    return '[configured URL]';
  }
}

export function redactMcpArgument(value: string): string {
  const text = String(value || '');
  if (!text) return text;
  if (/^(?:https?):\/\//i.test(text)) return redactMcpUrl(text);
  if (/^(?:[A-Za-z_][A-Za-z0-9_]*=).+/.test(text)) return `${text.slice(0, text.indexOf('=') + 1)}<redacted>`;
  if (isSensitiveMcpArgumentName(text) || looksLikeMcpSecretValue(text)) return '<redacted>';
  if (/(?:token|access[_-]?token|api[_-]?key|secret|client[_-]?secret|password|authorization|bearer|credential|private[_-]?key)/i.test(text)) return '<redacted>';
  if (text.length > 512) return `${text.slice(0, 128)}…`;
  return text;
}

export function redactMcpError(value: unknown): string {
  const home = path.resolve(process.env.HOME || os.homedir());
  return String(value instanceof Error ? value.message : value || '')
    .replace(BEARER, 'Bearer <redacted>')
    .replace(SECRET_ASSIGNMENT, (_match, key: string, separator: string) => `${key}${separator}<redacted>`)
    .replace(PROVIDER_SECRET_GLOBAL, '<redacted>')
    .replace(JWT_SECRET_GLOBAL, '<redacted>')
    .replaceAll(home, '~')
    .replace(/[\r\n\0]+/g, ' ')
    .slice(0, 1024);
}

export function redactMcpErrorWithSecrets(value: unknown, sensitiveValues: readonly string[]): string {
  let text = String(value instanceof Error ? value.message : value || '');
  const secrets = [...new Set(sensitiveValues.filter((item) => typeof item === 'string' && item.length > 0))]
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) text = text.split(secret).join('<redacted>');
  return redactMcpError(text);
}

export function publicMcpCommand(value: string): string {
  const base = path.basename(String(value || '').trim());
  return base && base.length <= 128 && /^[A-Za-z0-9._+-]+$/.test(base) ? base : '[configured command]';
}

export function sanitizeMcpArgs(values: readonly string[]): string[] {
  const out: string[] = [];
  let redactNext = false;
  for (const raw of values.slice(0, 100)) {
    const value = String(raw);
    if (redactNext) {
      out.push('<redacted>');
      redactNext = false;
      continue;
    }
    if (isSensitiveMcpArgumentName(value)) {
      out.push(redactMcpArgument(value));
      redactNext = !value.includes('=');
      continue;
    }
    out.push(redactMcpArgument(value));
  }
  return out;
}
