import { redactSecrets, redactString } from '../secret-redaction.js';

export function redactOpenRouterKey(value: string): string {
  if (!value) return '';
  if (value.length <= 10) return '<redacted>';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function redactOpenRouterSecrets<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return redactSecrets(value, env) as T;
}

export function redactOpenRouterString(value: unknown, env: NodeJS.ProcessEnv = process.env): string {
  return redactString(String(value ?? ''), env);
}
