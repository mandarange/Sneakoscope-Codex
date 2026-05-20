import { type CodexHookEventName, codexHookEventName } from './codex-schema-snapshot.js';

export type CodexHookSemanticValidation = {
  schema: 'sks.codex-hook-semantic-validation.v1';
  ok: boolean;
  event: CodexHookEventName;
  warnings: string[];
  unsupported: string[];
  fatal: string[];
  reason: string | null;
};

const LEGACY_TOP_LEVEL_KEYS = new Set([
  'permissionDecision',
  'permissionDecisionReason',
  'updatedInput',
  'updatedMCPToolOutput',
  'updatedPermissions',
  'additionalContext',
  'hookEventName'
]);

export function validateCodexHookSemanticOutput(eventLike: unknown, output: any): CodexHookSemanticValidation {
  const event = codexHookEventName(eventLike) || 'UserPromptSubmit';
  const fatal: string[] = [];
  const unsupported: string[] = [];
  const warnings: string[] = [];

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    fatal.push('output_not_object');
    return result(event, warnings, unsupported, fatal);
  }

  fatal.push(...snakeCaseKeyIssues(output));
  for (const key of Object.keys(output)) {
    if (LEGACY_TOP_LEVEL_KEYS.has(key)) fatal.push(`legacy_top_level:${key}`);
  }

  const actualEvent = output.hookSpecificOutput?.hookEventName;
  if (actualEvent && actualEvent !== event) fatal.push(`hook_event_mismatch:${actualEvent}`);

  switch (event) {
    case 'PreToolUse':
      validatePreToolUse(output, fatal, unsupported);
      break;
    case 'PermissionRequest':
      validatePermissionRequest(output, fatal, unsupported);
      break;
    case 'PostToolUse':
      validatePostToolUse(output, fatal, unsupported);
      break;
    case 'UserPromptSubmit':
      validateUserPromptSubmit(output, fatal);
      break;
    case 'Stop':
      validateStop(output, fatal, unsupported);
      break;
    case 'PreCompact':
    case 'PostCompact':
      validateCompact(event, output, fatal, unsupported);
      break;
    case 'SessionStart':
      validateSessionStart(output, fatal);
      break;
  }

  return result(event, warnings, unsupported, fatal);
}

export function validatePreToolUseSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('PreToolUse', output);
}

export function validatePermissionRequestSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('PermissionRequest', output);
}

export function validatePostToolUseSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('PostToolUse', output);
}

export function validateUserPromptSubmitSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('UserPromptSubmit', output);
}

export function validateStopSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('Stop', output);
}

export function validateCompactSemanticOutput(event: Extract<CodexHookEventName, 'PreCompact' | 'PostCompact'>, output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput(event, output);
}

export function validateSessionStartSemanticOutput(output: any): CodexHookSemanticValidation {
  return validateCodexHookSemanticOutput('SessionStart', output);
}

function validatePreToolUse(output: any, fatal: string[], unsupported: string[]) {
  rejectUniversal(output, 'PreToolUse', fatal, unsupported, { continueFalse: true, stopReason: true, suppressOutput: true });
  if (output.decision !== undefined) {
    if (output.decision === 'approve') pushBoth(fatal, unsupported, 'PreToolUse hook returned unsupported decision:approve');
    else if (output.decision === 'block') fatal.push('pre_tool_use_legacy_decision_block');
    else fatal.push(`pre_tool_use_legacy_decision:${String(output.decision)}`);
  }
  if (output.reason !== undefined) fatal.push('pre_tool_use_legacy_reason');

  const specific = asRecord(output.hookSpecificOutput);
  if (!specific) return;
  if (specific.additionalContext !== undefined) fatal.push('pre_tool_use_additional_context_unsupported');
  const decision = specific.permissionDecision;
  const hasUpdatedInput = Object.prototype.hasOwnProperty.call(specific, 'updatedInput');
  const hasReason = Object.prototype.hasOwnProperty.call(specific, 'permissionDecisionReason');

  if (decision === 'ask') pushBoth(fatal, unsupported, 'PreToolUse hook returned unsupported permissionDecision:ask');
  if (decision === 'allow' && !hasUpdatedInput) pushBoth(fatal, unsupported, 'PreToolUse hook returned unsupported permissionDecision:allow');
  if (hasUpdatedInput && decision !== 'allow') fatal.push('PreToolUse hook returned updatedInput without permissionDecision:allow');
  if (decision === 'deny' && !nonEmpty(specific.permissionDecisionReason)) fatal.push('PreToolUse hook returned permissionDecision:deny without a non-empty permissionDecisionReason');
  if (!decision && hasReason) fatal.push('PreToolUse hook returned permissionDecisionReason without permissionDecision');
}

function validatePermissionRequest(output: any, fatal: string[], unsupported: string[]) {
  rejectUniversal(output, 'PermissionRequest', fatal, unsupported, { continueFalse: true, stopReason: true, suppressOutput: true });
  const decision = asRecord(output.hookSpecificOutput?.decision);
  if (!decision) return;
  if (decision.updatedInput !== undefined) pushBoth(fatal, unsupported, 'PermissionRequest hook returned unsupported updatedInput');
  if (decision.updatedPermissions !== undefined) pushBoth(fatal, unsupported, 'PermissionRequest hook returned unsupported updatedPermissions');
  if (decision.interrupt === true) pushBoth(fatal, unsupported, 'PermissionRequest hook returned unsupported interrupt:true');
  if (decision.behavior === 'deny' && !nonEmpty(decision.message)) fatal.push('PermissionRequest hook returned deny without a non-empty message');
  if (decision.behavior === 'allow' && decision.message !== undefined) fatal.push('PermissionRequest hook returned allow with message');
}

function validatePostToolUse(output: any, fatal: string[], unsupported: string[]) {
  rejectUniversal(output, 'PostToolUse', fatal, unsupported, { suppressOutput: true });
  const block = output.decision === 'block';
  if (block && !nonEmpty(output.reason)) fatal.push('PostToolUse hook returned decision:block without a non-empty reason');
  if (!block && output.reason !== undefined) fatal.push('PostToolUse hook returned reason without decision');
  if (output.hookSpecificOutput?.updatedMCPToolOutput !== undefined) {
    pushBoth(fatal, unsupported, 'PostToolUse hook returned unsupported updatedMCPToolOutput');
  }
}

function validateUserPromptSubmit(output: any, fatal: string[]) {
  const block = output.decision === 'block';
  if (block && !nonEmpty(output.reason)) fatal.push('UserPromptSubmit hook returned decision:block without a non-empty reason');
  if (!block && output.reason !== undefined) fatal.push('UserPromptSubmit hook returned reason without decision');
}

function validateStop(output: any, fatal: string[], unsupported: string[]) {
  rejectUniversal(output, 'Stop', fatal, unsupported, { continueFalse: true, stopReason: true, suppressOutput: true });
  const block = output.decision === 'block';
  if (block && !nonEmpty(output.reason)) fatal.push('Stop hook returned decision:block without a non-empty reason');
  if (!block && output.reason !== undefined) fatal.push('Stop hook returned reason without decision');
}

function validateCompact(event: CodexHookEventName, output: any, fatal: string[], unsupported: string[]) {
  rejectUniversal(output, event, fatal, unsupported, { continueFalse: true, stopReason: true, suppressOutput: true });
  for (const key of ['decision', 'reason', 'hookSpecificOutput']) {
    if (output[key] !== undefined) fatal.push(`${event} hook returned unsupported ${key}`);
  }
}

function validateSessionStart(output: any, fatal: string[]) {
  if (output.reason !== undefined) fatal.push('SessionStart hook returned reason');
  if (output.decision !== undefined) fatal.push('SessionStart hook returned decision');
}

function rejectUniversal(output: any, event: string, fatal: string[], unsupported: string[], rules: { continueFalse?: boolean; stopReason?: boolean; suppressOutput?: boolean }) {
  if (rules.continueFalse && output.continue === false) pushBoth(fatal, unsupported, `${event} hook returned unsupported continue:false`);
  if (rules.stopReason && output.stopReason !== undefined) pushBoth(fatal, unsupported, `${event} hook returned unsupported stopReason`);
  if (rules.suppressOutput && output.suppressOutput === true) pushBoth(fatal, unsupported, `${event} hook returned unsupported suppressOutput`);
}

function pushBoth(fatal: string[], unsupported: string[], issue: string) {
  fatal.push(issue);
  unsupported.push(issue);
}

function result(event: CodexHookEventName, warnings: string[], unsupported: string[], fatal: string[]): CodexHookSemanticValidation {
  const uniqueWarnings = [...new Set(warnings)];
  const uniqueUnsupported = [...new Set(unsupported)];
  const uniqueFatal = [...new Set(fatal)];
  return {
    schema: 'sks.codex-hook-semantic-validation.v1',
    ok: uniqueWarnings.length === 0 && uniqueUnsupported.length === 0 && uniqueFatal.length === 0,
    event,
    warnings: uniqueWarnings,
    unsupported: uniqueUnsupported,
    fatal: uniqueFatal,
    reason: uniqueFatal[0] || uniqueUnsupported[0] || uniqueWarnings[0] || null
  };
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function snakeCaseKeyIssues(value: unknown, pointer = '$'): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => snakeCaseKeyIssues(item, `${pointer}[${index}]`));
  const issues: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'updatedInput' || key === 'updatedMCPToolOutput') continue;
    if (/_/.test(key)) issues.push(`${pointer}.${key}:snake_case`);
    issues.push(...snakeCaseKeyIssues(child, `${pointer}.${key}`));
  }
  return issues;
}
