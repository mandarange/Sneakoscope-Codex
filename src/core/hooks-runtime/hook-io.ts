// Deliberately minimal dependency surface (just fsx.js + the lightweight
// codex-compat output builders) — hooks-runtime.ts re-exports these, but
// the daemon-accelerated hook dispatch (sksd-hook-dispatch.ts) imports
// straight from here so a daemon-warm hook call never pays the cost of
// loading hooks-runtime.ts's full ~20-module dependency graph (pipeline,
// mission, db-safety, harness-guard, ...) just to read stdin and shape the
// response (20차 P2-1).
import { readStdin } from '../fsx.js';
import {
  buildCompactContinue,
  buildPermissionRequestAllow,
  buildPermissionRequestDeny,
  buildPostToolUseBlock,
  buildPostToolUseContinue,
  buildPreToolUseContinue,
  buildPreToolUseDeny,
  buildSessionStartContinue,
  buildStopBlock,
  buildStopContinue,
  buildSubagentStartContinue,
  buildSubagentStopBlock,
  buildSubagentStopContinue,
  buildUserPromptSubmitBlock,
  buildUserPromptSubmitContinue
} from '../codex-compat/codex-hook-output-builders.js';

export async function loadHookPayload() {
  const raw = await readStdin();
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { raw }; }
}

export function normalizeHookResult(name: any, result: any = {}) {
  const eventName = codexHookEventName(name);
  const out = { ...result };
  // Project and legacy user-level SKS hooks can briefly coexist during an
  // upgrade. The runtime owner performs the work once; duplicate invocations
  // must be silent so Codex does not inject the same route or Stop feedback
  // twice into one turn.
  if (out.suppressedDuplicate === true) return { continue: true };
  const systemMessage = out.silent === true
    ? undefined
    : out.systemMessage || visibleHookMessage(name, out.reason || out.additionalContext || '');
  const reason = out.reason || 'SKS guard denied this action.';

  if (eventName === 'UserPromptSubmit' || eventName === 'PostToolUse') {
    if (eventName === 'UserPromptSubmit') {
      if (out.decision === 'block') return buildUserPromptSubmitBlock(reason, { systemMessage });
      return buildUserPromptSubmitContinue({ additionalContext: out.additionalContext, systemMessage });
    }
    if (out.decision === 'block') return buildPostToolUseBlock(reason, { systemMessage });
    return buildPostToolUseContinue({ additionalContext: out.additionalContext, systemMessage });
  }

  if (eventName === 'PreToolUse') {
    if (out.decision === 'block' || out.permissionDecision === 'deny' || out.decision === 'deny') {
      return buildPreToolUseDeny(reason, { systemMessage });
    }
    return buildPreToolUseContinue({ additionalContext: out.additionalContext, systemMessage });
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
  if (eventName === 'SessionStart') {
    return buildSessionStartContinue({ additionalContext: out.additionalContext, systemMessage });
  }
  if (eventName === 'PreCompact' || eventName === 'PostCompact') {
    return buildCompactContinue(eventName, { systemMessage });
  }
  if (eventName === 'SubagentStart') {
    return buildSubagentStartContinue({ additionalContext: out.additionalContext, systemMessage });
  }
  if (eventName === 'SubagentStop') {
    if (out.decision === 'block') return buildSubagentStopBlock(reason, { systemMessage });
    return buildSubagentStopContinue({ systemMessage });
  }

  return { continue: true, systemMessage };
}

export function codexHookEventName(name: any) {
  return ({
    'user-prompt-submit': 'UserPromptSubmit',
    'pre-tool': 'PreToolUse',
    'post-tool': 'PostToolUse',
    'pre-compact': 'PreCompact',
    'post-compact': 'PostCompact',
    'session-start': 'SessionStart',
    'subagent-start': 'SubagentStart',
    'subagent-stop': 'SubagentStop',
    'permission-request': 'PermissionRequest',
    'stop': 'Stop'
  } as Record<string, string>)[name] || name;
}

export function visibleHookMessage(name: any, text: any = '') {
  const body = String(text || '');
  if (name === 'user-prompt-submit') {
    if (body.includes('DFix ultralight pipeline active')) return 'SKS: DFix ultralight task list injected.';
    if (body.includes('SKS answer-only pipeline active')) return 'SKS: answer-only research context injected.';
    if (body.includes('SKS wiki pipeline active')) return 'SKS: wiki refresh context injected.';
    if (body.includes('Codex native Goal control requested')) return 'SKS: native Codex Goal control selected; no SKS Goal state was created.';
    if (body.includes('Computer Use fast lane active')) return 'SKS: native Computer Use lane injected; defer TriWiki/Honest Mode to final closeout.';
    if (body.includes('MANDATORY ambiguity-removal gate') || body.includes('VISIBLE RESPONSE CONTRACT') || body.includes('Required questions still pending')) return 'SKS: stale clarification gate detected; continue from inferred route contract.';
    if (body.includes('$Naruto route prepared') || body.includes('Codex subagent workflow')) return 'SKS: Naruto Codex subagent delegation context injected.';
    if (body.includes('$Research route prepared')) return 'SKS: Research route, xhigh Eureka agent council, source/debate ledgers, paper output, and falsification gate injected.';
    if (body.includes('$AutoResearch route prepared')) return 'SKS: AutoResearch experiment loop and evidence gate injected.';
    if (body.includes('$PPT route prepared')) return 'SKS: PPT route and delivery-context gate injected.';
    if (body.includes('$Image-UX-Review route prepared') || body.includes('$UX-Review route prepared')) return 'SKS: Image UX Review route and gpt-image-2 evidence gate injected.';
    if (body.includes('$DB route prepared')) return 'SKS: DB safety review route injected.';
    if (body.includes('$GX route prepared')) return 'SKS: GX visual context route injected.';
    if (body.includes('$QA-LOOP route prepared')) return 'SKS: QA-LOOP route and safety checklist injected.';
    if (body.includes('Codex subagent workflow: required')) return 'SKS: route context injected; official subagent evidence gate is active.';
    return 'SKS: skill-first route context injected.';
  }
  if (name === 'post-tool') return 'SKS: tool result inspected; Context7/native-session/DB evidence updated when relevant.';
  if (name === 'stop') {
    if (body.includes('Required questions')) return 'SKS: stale clarification wording detected; route should auto-seal from inferred defaults.';
    return body ? 'SKS: stop gate checked; continuing until route evidence passes.' : 'SKS: stop gate checked.';
  }
  if (name === 'permission-request') return body ? 'SKS: permission request evaluated by harness guards.' : 'SKS: permission request inspected.';
  if (name === 'pre-tool') return body ? 'SKS: tool call inspected by harness guards.' : 'SKS: tool call inspected.';
  return 'SKS: hook evaluated.';
}
