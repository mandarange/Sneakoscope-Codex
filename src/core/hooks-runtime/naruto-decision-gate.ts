import path from 'node:path';
import { appendJsonlBounded, nowIso, sha256 } from '../fsx.js';
import { ensureConfinedDirectory } from '../managed-path-safety.js';
import { codexHookEventName, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';
import {
  narutoDecisionForRoute,
  routeByDollarCommand,
  routeById,
  routePrompt,
  stripVisibleDecisionAnswerBlocks
} from '../routes.js';
import { classifyTaskProfile, isTaskProfile, type TaskProfile } from '../runtime/task-profile.js';

export const HOOK_NARUTO_DECISION_LOG = 'hook-naruto-decision-gate.jsonl';
const HOOK_NARUTO_DECISION_LOG_MAX_BYTES = 256 * 1024;

export interface HookNarutoDecision {
  schema: 'sks.hook-naruto-decision.v1';
  event: CodexHookEventName | string;
  mode: 'none' | 'generic_naruto' | 'route_owned';
  required: boolean;
  action: 'prepare_naruto' | 'route_owned' | 'bypass' | 'observe_required' | 'observe_bypass';
  route_id: string | null;
  task_profile: TaskProfile;
  reason: string;
  source: 'user_prompt' | 'active_route' | 'no_task_context' | 'parent_launch';
  trivial: boolean;
  default_parallel: boolean;
  recorded: boolean;
}

interface HookNarutoDecisionInput {
  root: string;
  name: unknown;
  payload?: any;
  state?: any;
  sessionKey?: unknown;
  noQuestion?: boolean;
  parentLaunchMissionId?: string;
}

export function hookNarutoDecisionLogPath(root: string): string {
  return path.join(root, '.sneakoscope', 'state', HOOK_NARUTO_DECISION_LOG);
}

export async function evaluateHookNarutoDecisionGate(input: HookNarutoDecisionInput): Promise<HookNarutoDecision> {
  const decision = decideHookNaruto(input);
  const prompt = decision.event === 'UserPromptSubmit'
    ? stripVisibleDecisionAnswerBlocks(extractPrompt(input.payload))
    : '';
  const row = {
    ts: nowIso(),
    schema: decision.schema,
    event: decision.event,
    mode: decision.mode,
    required: decision.required,
    action: decision.action,
    route_id: decision.route_id,
    task_profile: decision.task_profile,
    reason: decision.reason,
    source: decision.source,
    trivial: decision.trivial,
    default_parallel: decision.default_parallel,
    session_hash: shortHash(input.sessionKey),
    turn_hash: shortHash(input.payload?.turn_id || input.payload?.turnId || ''),
    prompt_hash: prompt ? shortHash(prompt) : null
  };
  let recorded = true;
  try {
    const logPath = hookNarutoDecisionLogPath(input.root);
    await ensureConfinedDirectory(path.resolve(input.root), path.dirname(logPath));
    await appendJsonlBounded(
      logPath,
      row,
      HOOK_NARUTO_DECISION_LOG_MAX_BYTES
    );
  } catch {
    recorded = false;
  }
  return { ...decision, recorded };
}

export function decideHookNaruto(input: Omit<HookNarutoDecisionInput, 'root'>): HookNarutoDecision {
  const event = codexHookEventName(input.name) || String(input.name || 'unknown');
  const state = input.state || {};
  if (event !== 'UserPromptSubmit') {
    return decisionFromState(event, state);
  }

  const prompt = stripVisibleDecisionAnswerBlocks(extractPrompt(input.payload));
  const profile = classifyTaskProfile(prompt);
  if (input.parentLaunchMissionId) {
    return decision({
      event,
      mode: 'generic_naruto',
      required: true,
      action: 'prepare_naruto',
      routeId: 'Naruto',
      profile,
      reason: 'attached_parent_naruto_launch',
      source: 'parent_launch',
      trivial: false
    });
  }
  if (input.noQuestion || shouldInheritActiveRoute(prompt, state)) {
    return decisionFromState(event, state);
  }

  const route = routePrompt(prompt);
  const routeDecision = narutoDecisionForRoute(route, prompt, profile);
  return decision({
    event,
    mode: routeDecision.mode,
    required: routeDecision.required,
    action: routeDecision.mode === 'generic_naruto'
      ? 'prepare_naruto'
      : routeDecision.mode === 'route_owned'
        ? 'route_owned'
        : 'bypass',
    routeId: routeDecision.route_id,
    profile: routeDecision.task_profile,
    reason: routeDecision.reason,
    source: 'user_prompt',
    trivial: routeDecision.trivial
  });
}

export function looksLikeActiveContinuationPrompt(prompt: unknown = ''): boolean {
  const text = stripVisibleDecisionAnswerBlocks(String(prompt || ''))
    .trim()
    .replace(/[.!?。！？…,:;]+$/u, '')
    .trim();
  if (!text) return false;
  return /^(?:(?:please\s+)?(?:keep\s+going|continue|resume|go\s+on|proceed|carry\s+on)(?:\s+please)?|계속(?:\s*진행)?(?:\s*해\s*줘|\s*해주세요|\s*해)?|이어\s*서(?:\s*해\s*줘|\s*해주세요|\s*진행해)?|이어서(?:\s*해\s*줘|\s*해주세요|\s*진행해)?|진행(?:\s*해\s*줘|\s*해주세요|\s*해)?|마저\s*해(?:\s*줘|\s*주세요)?|다음|next)$/i.test(text);
}

function decisionFromState(event: CodexHookEventName | string, state: any): HookNarutoDecision {
  const route = routeFromState(state);
  const routePolicy = narutoDecisionForRoute(route, '', 'passthrough');
  if (state?.route_closed !== true && routePolicy.mode === 'route_owned') {
    return decision({
      event,
      mode: 'route_owned',
      required: false,
      action: 'route_owned',
      routeId: state?.route_command || state?.route || state?.mode || routePolicy.route_id,
      profile: isTaskProfile(state?.task_profile) ? state.task_profile : routePolicy.task_profile,
      reason: routePolicy.reason,
      source: state?.mission_id ? 'active_route' : 'no_task_context',
      trivial: false
    });
  }
  const required = state?.route_closed === true
    ? false
    : state?.subagents_required === true
      || (/^NARUTO$/i.test(String(state?.mode || state?.route || '')) && state?.subagents_required !== false);
  const profile = isTaskProfile(state?.task_profile)
    ? state.task_profile
    : required
      ? 'bounded-work'
      : 'passthrough';
  const activeRouteId = route?.id || (required ? 'Naruto' : null);
  return decision({
    event,
    mode: required ? 'generic_naruto' : 'none',
    required,
    action: required ? 'observe_required' : 'observe_bypass',
    routeId: activeRouteId,
    profile,
    reason: state?.route_closed === true
      ? 'active_route_closed'
      : required
        ? 'active_route_requires_official_subagents'
        : 'no_active_naruto_requirement',
    source: state?.mission_id ? 'active_route' : 'no_task_context',
    trivial: !required
  });
}

function routeFromState(state: any): any {
  for (const candidate of [state?.route, state?.mode, state?.route_command]) {
    const route = routeById(candidate) || routeByDollarCommand(candidate);
    if (route) return route;
  }
  return null;
}

function shouldInheritActiveRoute(prompt: string, state: any): boolean {
  if (!state?.mission_id || state?.route_closed === true) return false;
  if (looksLikeActiveContinuationPrompt(prompt)) return true;
  const phase = String(state?.phase || '');
  const clarificationAwaiting = phase.includes('CLARIFICATION_AWAITING_ANSWERS')
    || String(state?.stop_gate || '') === 'clarification-gate';
  return clarificationAwaiting
    && state?.ambiguity_gate_required === true
    && state?.ambiguity_gate_passed !== true;
}

function decision(input: {
  event: CodexHookEventName | string;
  mode: HookNarutoDecision['mode'];
  required: boolean;
  action: HookNarutoDecision['action'];
  routeId: string | null;
  profile: TaskProfile;
  reason: string;
  source: HookNarutoDecision['source'];
  trivial: boolean;
}): HookNarutoDecision {
  return {
    schema: 'sks.hook-naruto-decision.v1',
    event: input.event,
    mode: input.mode,
    required: input.required,
    action: input.action,
    route_id: input.routeId,
    task_profile: input.profile,
    reason: input.reason,
    source: input.source,
    trivial: input.trivial,
    default_parallel: input.required,
    recorded: false
  };
}

function extractPrompt(payload: any = {}): string {
  return String(
    payload.prompt
    || payload.user_prompt
    || payload.userPrompt
    || payload.message
    || payload.input?.prompt
    || payload.input?.message
    || payload.raw
    || ''
  );
}

function shortHash(value: unknown): string | null {
  const text = String(value || '').trim();
  return text ? sha256(text).slice(0, 16) : null;
}
