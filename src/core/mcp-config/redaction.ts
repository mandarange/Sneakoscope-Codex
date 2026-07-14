import os from 'node:os';
import path from 'node:path';

const SECRET_ASSIGNMENT = /\b(token|api[_-]?key|secret|password|authorization|bearer)\b(\s*[:=]\s*)([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

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
  if (/(?:token|api[_-]?key|secret|password|authorization|bearer)/i.test(text)) return '<redacted>';
  if (text.length > 512) return `${text.slice(0, 128)}…`;
  return text;
}

export function redactMcpError(value: unknown): string {
  const home = path.resolve(process.env.HOME || os.homedir());
  return String(value instanceof Error ? value.message : value || '')
    .replace(BEARER, 'Bearer <redacted>')
    .replace(SECRET_ASSIGNMENT, (_match, key: string, separator: string) => `${key}${separator}<redacted>`)
    .replaceAll(home, '~')
    .replace(/[\r\n\0]+/g, ' ')
    .slice(0, 1024);
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
    if (/^--?(?:token|api[-_]?key|secret|password|authorization|bearer)(?:$|=)/i.test(value)) {
      out.push(redactMcpArgument(value));
      redactNext = !value.includes('=');
      continue;
    }
    out.push(redactMcpArgument(value));
  }
  return out;
}
