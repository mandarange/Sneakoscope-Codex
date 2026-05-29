import path from 'node:path';
import { nowIso, packageRoot } from '../fsx.js';
import { evaluateProtectedCorePath } from './immutable-harness-guard.js';
import { classifyMadSksShellArgv } from './shell-argv-classifier.js';

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
  root = packageRoot(),
  targetRoot = root
}: {
  targetPath: string;
  operation?: MadSksActionType;
  root?: string;
  targetRoot?: string;
}) {
  const protectedDecision = await evaluateProtectedCorePath(targetPath, { root, targetRoot, operation });
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
  root = packageRoot(),
  targetRoot = cwd
}: {
  command: string;
  cwd?: string;
  root?: string;
  targetRoot?: string;
}) {
  const classified = await classifyMadSksShellArgv({ command, cwd, root, targetRoot });
  const reasons = [...classified.reasons];
  const protectedMatches = classified.protected_core_matches;
  const catastrophic = classified.action === 'block';
  const highRisk = classified.action === 'confirm';
  return {
    schema: MAD_SKS_WRITE_GUARD_SCHEMA,
    ok: classified.ok,
    action: catastrophic ? 'block' : highRisk ? 'confirm' : 'allow',
    action_type: 'shell_command' as const,
    command: redactMadSksSecrets(command),
    cwd: path.resolve(cwd || process.cwd()),
    risk_level: classified.risk_level,
    reasons,
    protected_core_matches: protectedMatches,
    argv_classification: classified,
    secret_redaction_status: 'applied',
    generated_at: nowIso()
  };
}

export function redactMadSksSecrets(text: unknown): string {
  let out = String(text || '');
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
