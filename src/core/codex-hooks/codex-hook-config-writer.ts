import { CODEX_HOOK_EVENTS, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';

export type CodexCommandHookConfig = {
  event: CodexHookEventName;
  matcher?: string | null;
  command: string;
  timeout?: number;
  statusMessage?: string | null;
  commandWindows?: string | null;
};

export function validateCodexCommandHookConfig(config: CodexCommandHookConfig): string[] {
  const issues: string[] = [];
  if (!CODEX_HOOK_EVENTS.includes(config.event)) issues.push(`unsupported_event:${String(config.event)}`);
  if (!config.command || !config.command.trim()) issues.push('empty_command');
  if (Number(config.timeout ?? 30) < 1) issues.push('timeout_less_than_1');
  if (config.statusMessage != null && !String(config.statusMessage).trim()) issues.push('empty_statusMessage');
  if (!matcherApplies(config.event) && config.matcher && config.matcher.trim()) issues.push(`matcher_not_applicable:${config.event}`);
  if (matcherApplies(config.event) && config.matcher && !validMatcher(config.matcher)) issues.push('invalid_matcher');
  return issues;
}

export function matcherApplies(event: CodexHookEventName): boolean {
  return event === 'PreToolUse' || event === 'PostToolUse' || event === 'PermissionRequest';
}

function validMatcher(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;
  try {
    new RegExp(trimmed);
    return true;
  } catch {
    return false;
  }
}

