import path from 'node:path';
import { nowIso, packageRoot } from '../fsx.js';
import { evaluateProtectedCorePath } from './immutable-harness-guard.js';

export const MAD_SKS_WRITE_GUARD_SCHEMA = 'sks.mad-sks-write-guard.v1';

export type MadSksActionType =
  | 'file_write'
  | 'directory_delete'
  | 'chmod'
  | 'chown'
  | 'shell_command'
  | 'db_write'
  | 'package_install'
  | 'service_control'
  | 'computer_use'
  | 'browser_use'
  | 'generated_asset_edit'
  | 'system_config'
  | 'blocked_action';

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_OPENAI_KEY]'],
  [/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_PAT]'],
  [/CODEX_ACCESS_TOKEN=([^\s]+)/g, 'CODEX_ACCESS_TOKEN=[REDACTED]'],
  [/CODEX_LB_API_KEY=([^\s]+)/g, 'CODEX_LB_API_KEY=[REDACTED]'],
  [/OPENAI_API_KEY=([^\s]+)/g, 'OPENAI_API_KEY=[REDACTED]']
] as const;

export async function guardMadSksFileOperation({
  targetPath,
  operation = 'file_write',
  root = packageRoot()
}: {
  targetPath: string;
  operation?: MadSksActionType;
  root?: string;
}) {
  const protectedDecision = await evaluateProtectedCorePath(targetPath, { root, operation });
  return {
    schema: MAD_SKS_WRITE_GUARD_SCHEMA,
    ok: protectedDecision.ok,
    action: protectedDecision.ok ? 'allow' : 'block',
    action_type: operation,
    target_path: path.resolve(root, targetPath),
    risk_level: protectedDecision.ok ? 'low' : 'critical',
    reasons: protectedDecision.ok ? [] : ['protected_core_path'],
    protected_core: protectedDecision,
    secret_redaction_status: 'applied',
    generated_at: nowIso()
  };
}

export async function classifyMadSksShellCommand({
  command,
  cwd = process.cwd(),
  root = packageRoot()
}: {
  command: string;
  cwd?: string;
  root?: string;
}) {
  const reasons: string[] = [];
  const lowered = String(command || '').toLowerCase();
  if (/\brm\s+-[^\n;|&]*r[^\n;|&]*f\b|\brm\s+-[^\n;|&]*f[^\n;|&]*r\b/.test(lowered)) reasons.push('broad_delete');
  if (/\bsudo\b/.test(lowered)) reasons.push('admin_or_sudo');
  if (/\bchmod\s+-r\b|\bchmod\s+[^;&|]*-r\b/.test(lowered)) reasons.push('recursive_chmod');
  if (/\bchown\s+-r\b|\bchown\s+[^;&|]*-r\b/.test(lowered)) reasons.push('recursive_chown');
  if (/\bgit\s+reset\s+--hard\b/.test(lowered)) reasons.push('git_reset_hard');
  if (/\bgit\s+clean\b/.test(lowered)) reasons.push('git_clean');
  if (/\b(drop\s+database|drop\s+schema|drop\s+table|truncate\s+table)\b/.test(lowered)) reasons.push('catastrophic_db_operation');
  if (/\bdelete\s+from\s+\S+\s*(?:;|$)/.test(lowered) && !/\bwhere\b/.test(lowered)) reasons.push('delete_without_where');
  if (/\bupdate\s+\S+\s+set\b/.test(lowered) && !/\bwhere\b/.test(lowered)) reasons.push('update_without_where');

  const protectedMatches = [];
  for (const token of shellPathTokens(command)) {
    const decision = await evaluateProtectedCorePath(token, { root, operation: 'shell_command' });
    if (!decision.ok) protectedMatches.push(decision);
  }
  const cwdDecision = await evaluateProtectedCorePath(cwd, { root, operation: 'shell_cwd' });
  if (!cwdDecision.ok) reasons.push('cwd_is_protected_core');
  if (protectedMatches.length) reasons.push('command_mentions_protected_core_path');

  const catastrophic = reasons.some((reason) => /catastrophic|without_where/.test(reason));
  const highRisk = reasons.some((reason) => /broad_delete|sudo|recursive|git_reset|git_clean|protected_core|cwd_is_protected/.test(reason));
  return {
    schema: MAD_SKS_WRITE_GUARD_SCHEMA,
    ok: !catastrophic && protectedMatches.length === 0,
    action: catastrophic || protectedMatches.length ? 'block' : highRisk ? 'confirm' : 'allow',
    action_type: 'shell_command' as const,
    command: redactMadSksSecrets(command),
    cwd: path.resolve(cwd || process.cwd()),
    risk_level: catastrophic || protectedMatches.length ? 'critical' : highRisk ? 'high' : 'low',
    reasons,
    protected_core_matches: protectedMatches,
    secret_redaction_status: 'applied',
    generated_at: nowIso()
  };
}

export function redactMadSksSecrets(text: unknown): string {
  let out = String(text || '');
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function shellPathTokens(command: string): string[] {
  const tokens = String(command || '').match(/(?:\.{0,2}\/|~\/|[A-Za-z]:\\)?[A-Za-z0-9_./\\:-]+/g) || [];
  return tokens
    .filter((token) => /[./\\]/.test(token))
    .filter((token) => !/^https?:\/\//i.test(token))
    .slice(0, 50);
}
