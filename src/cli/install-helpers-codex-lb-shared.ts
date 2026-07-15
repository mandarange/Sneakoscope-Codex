import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export const CODEX_LB_PROVIDER_NAME = 'openai';
export const CODEX_LB_PROVIDER_ENV_KEY = 'CODEX_LB_API_KEY';
export const CODEX_LB_CANONICAL_FAST_SERVICE_TIER = 'priority';

export function codexLbConfigPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'config.toml');
}

export function codexLbEnvPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'sks-codex-lb.env');
}

export function codexAuthPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.json');
}

export function codexAuthChatgptBackupPath(home: any = process.env.HOME || os.homedir()) {
  return path.join(home, '.codex', 'auth.chatgpt-backup.json');
}

export function normalizeCodexLbBaseUrl(input: any = '') {
  const raw = String(input || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return /\/backend-api\/codex$/i.test(url) ? url : `${url}/backend-api/codex`;
}

export function hasTopLevelCodexLbSelected(text: any = '') {
  const topLevel = String(text || '').split(/\n\s*\[/)[0] || '';
  return /(^|\n)\s*model_provider\s*=\s*"codex-lb"\s*(?:#.*)?(?=\n|$)/.test(topLevel);
}

export function parseCodexLbEnvKey(text: any = '') {
  return String(text || '').match(/^\s*(?:export\s+)?CODEX_LB_API_KEY\s*=\s*(['"])(.*?)\1\s*$/m)?.[2] || '';
}

export function redactSecretText(text: any = '', secrets: any = []) {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '');
    if (!value) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

export async function askPostinstallQuestion(question: any) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
