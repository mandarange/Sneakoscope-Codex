import { codexHookEventName } from './codex-schema-snapshot.js';
import {
  buildPermissionRequestAllow,
  buildPermissionRequestDeny,
  buildPostToolUseBlock,
  buildPostToolUseContinue,
  buildPreToolUseAllowRewrite,
  buildPreToolUseContinue,
  buildPreToolUseDeny,
  buildSessionStartContinue,
  buildStopBlock,
  buildStopContinue,
  buildUserPromptSubmitBlock,
  buildUserPromptSubmitContinue
} from './codex-hook-output-builders.js';

export function normalizeCodexHookOutput(name: unknown, result: any = {}) {
  const eventName = codexHookEventName(name) || 'UserPromptSubmit';
  const out = { ...result };
  const reason = out.reason || out.permissionDecisionReason || 'SKS guard denied this action.';
  const systemMessage = typeof out.systemMessage === 'string' ? out.systemMessage : undefined;

  if (eventName === 'UserPromptSubmit') {
    if (out.decision === 'block') return buildUserPromptSubmitBlock(reason, { systemMessage });
    return buildUserPromptSubmitContinue({ additionalContext: out.additionalContext, systemMessage });
  }

  if (eventName === 'PostToolUse') {
    if (out.decision === 'block') return buildPostToolUseBlock(reason, { systemMessage });
    return buildPostToolUseContinue({ additionalContext: out.additionalContext, systemMessage });
  }

  if (eventName === 'SessionStart') {
    return buildSessionStartContinue({ additionalContext: out.additionalContext, systemMessage });
  }

  if (eventName === 'PreToolUse') {
    const decision = out.permissionDecision || (out.decision === 'allow' ? 'allow' : null);
    if (out.decision === 'block' || out.decision === 'deny' || decision === 'deny') {
      return buildPreToolUseDeny(reason, { systemMessage });
    }
    if (decision === 'allow' && out.updatedInput !== undefined) return buildPreToolUseAllowRewrite(out.updatedInput, { systemMessage });
    return buildPreToolUseContinue({ systemMessage });
  }

  if (eventName === 'PermissionRequest') {
    if (out.decision === 'deny' || out.permissionDecision === 'deny') {
      return buildPermissionRequestDeny(reason, { systemMessage });
    } else if (out.decision === 'allow' || out.permissionDecision === 'allow') {
      return buildPermissionRequestAllow({ systemMessage });
    }
    return buildPermissionRequestAllow({ systemMessage });
  }

  if (eventName === 'Stop') {
    if (out.decision === 'block') return buildStopBlock(reason, { systemMessage });
    return buildStopContinue({ systemMessage });
  }

  return { continue: true };
}
