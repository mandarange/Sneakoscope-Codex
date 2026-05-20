import { type CodexHookEventName } from './codex-schema-snapshot.js';

export type CodexHookOutput = Record<string, unknown>;

export function buildPreToolUseContinue(options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildPreToolUseDeny(reason: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  const trimmed = requiredReason(reason, 'PreToolUse deny requires a non-empty reason');
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: trimmed
    }
  }, options.systemMessage);
}

export function buildPreToolUseAllowRewrite(updatedInput: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  if (updatedInput === undefined || updatedInput === null) {
    throw new Error('PreToolUse allow rewrite requires updatedInput');
  }
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput
    }
  }, options.systemMessage);
}

export function buildPermissionRequestAllow(options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' }
    }
  }, options.systemMessage);
}

export function buildPermissionRequestDeny(message: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  const trimmed = requiredReason(message, 'PermissionRequest deny requires a non-empty message');
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: trimmed }
    }
  }, options.systemMessage);
}

export function buildPostToolUseContinue(options: { additionalContext?: string; systemMessage?: string } = {}): CodexHookOutput {
  const output: CodexHookOutput = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'PostToolUse',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

export function buildPostToolUseBlock(reason: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'PostToolUse block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildUserPromptSubmitContinue(options: { additionalContext?: string; systemMessage?: string } = {}): CodexHookOutput {
  const output: CodexHookOutput = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

export function buildUserPromptSubmitBlock(reason: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'UserPromptSubmit block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildStopContinue(options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildStopBlock(reason: unknown, options: { systemMessage?: string } = {}): CodexHookOutput {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'Stop block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildCompactContinue(event: Extract<CodexHookEventName, 'PreCompact' | 'PostCompact'> = 'PreCompact', options: { systemMessage?: string } = {}): CodexHookOutput {
  void event;
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildSessionStartContinue(options: { additionalContext?: string; systemMessage?: string } = {}): CodexHookOutput {
  const output: CodexHookOutput = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'SessionStart',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

function withOptionalSystemMessage(output: CodexHookOutput, systemMessage: unknown): CodexHookOutput {
  const message = optionalText(systemMessage);
  return message ? { ...output, systemMessage: message } : output;
}

function requiredReason(value: unknown, fallback: string): string {
  const trimmed = optionalText(value);
  if (!trimmed) throw new Error(fallback);
  return trimmed;
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
