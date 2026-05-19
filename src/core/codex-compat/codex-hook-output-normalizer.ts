import { codexHookEventName } from './codex-schema-snapshot.js';

export function normalizeCodexHookOutput(name: unknown, result: any = {}) {
  const eventName = codexHookEventName(name) || 'UserPromptSubmit';
  const out = { ...result };
  const normalized: any = { continue: out.continue !== false };
  if (out.stopReason) normalized.stopReason = out.stopReason;
  if (out.suppressOutput === true) normalized.suppressOutput = true;
  if (out.systemMessage) normalized.systemMessage = out.systemMessage;
  const reason = out.reason || out.permissionDecisionReason || 'SKS guard denied this action.';

  if (eventName === 'UserPromptSubmit' || eventName === 'PostToolUse' || eventName === 'SessionStart') {
    if (out.decision === 'block') {
      normalized.decision = 'block';
      normalized.reason = reason;
    }
    if (out.additionalContext) {
      normalized.hookSpecificOutput = { hookEventName: eventName, additionalContext: out.additionalContext };
    }
    return normalized;
  }

  if (eventName === 'PreToolUse') {
    const decision = out.permissionDecision || (out.decision === 'allow' ? 'allow' : null);
    if (out.decision === 'block' || out.decision === 'deny' || decision === 'deny') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      };
    } else if (decision === 'allow' || decision === 'ask') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PreToolUse',
        permissionDecision: decision
      };
      if (decision === 'ask' || out.permissionDecisionReason) normalized.hookSpecificOutput.permissionDecisionReason = reason;
    }
    return normalized;
  }

  if (eventName === 'PermissionRequest') {
    if (out.decision === 'deny' || out.permissionDecision === 'deny') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: reason }
      };
    } else if (out.decision === 'allow' || out.permissionDecision === 'allow') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow', ...(out.message ? { message: out.message } : {}) }
      };
    }
    return normalized;
  }

  if (eventName === 'Stop') {
    if (out.decision === 'block') {
      normalized.continue = out.continue === false ? false : normalized.continue;
      normalized.decision = 'block';
      normalized.reason = reason;
      if (!normalized.stopReason && out.continue === false) normalized.stopReason = reason;
    }
    return normalized;
  }

  return normalized;
}
