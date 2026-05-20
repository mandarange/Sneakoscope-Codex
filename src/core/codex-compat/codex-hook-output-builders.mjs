export function buildPreToolUseContinue(options = {}) {
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildPreToolUseDeny(reason, options = {}) {
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

export function buildPreToolUseAllowRewrite(updatedInput, options = {}) {
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

export function buildPermissionRequestAllow(options = {}) {
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' }
    }
  }, options.systemMessage);
}

export function buildPermissionRequestDeny(message, options = {}) {
  const trimmed = requiredReason(message, 'PermissionRequest deny requires a non-empty message');
  return withOptionalSystemMessage({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: trimmed }
    }
  }, options.systemMessage);
}

export function buildPostToolUseContinue(options = {}) {
  const output = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'PostToolUse',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

export function buildPostToolUseBlock(reason, options = {}) {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'PostToolUse block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildUserPromptSubmitContinue(options = {}) {
  const output = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

export function buildUserPromptSubmitBlock(reason, options = {}) {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'UserPromptSubmit block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildStopContinue(options = {}) {
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildStopBlock(reason, options = {}) {
  return withOptionalSystemMessage({
    continue: true,
    decision: 'block',
    reason: requiredReason(reason, 'Stop block requires a non-empty reason')
  }, options.systemMessage);
}

export function buildCompactContinue(_event = 'PreCompact', options = {}) {
  return withOptionalSystemMessage({ continue: true }, options.systemMessage);
}

export function buildSessionStartContinue(options = {}) {
  const output = { continue: true };
  const additionalContext = optionalText(options.additionalContext);
  if (additionalContext) {
    output.hookSpecificOutput = {
      hookEventName: 'SessionStart',
      additionalContext
    };
  }
  return withOptionalSystemMessage(output, options.systemMessage);
}

function withOptionalSystemMessage(output, systemMessage) {
  const message = optionalText(systemMessage);
  return message ? { ...output, systemMessage: message } : output;
}

function requiredReason(value, fallback) {
  const trimmed = optionalText(value);
  if (!trimmed) throw new Error(fallback);
  return trimmed;
}

function optionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
