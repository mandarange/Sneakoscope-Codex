import path from 'node:path';
import { readJson } from '../fsx.js';
import { missionDir, validateExternallyReservedMissionId } from '../mission.js';
import { routePrompt } from '../pipeline.js';
import {
  allowlistedManagedRouteSkillNames,
  dollarCommand,
  INVALID_EXPLICIT_MANAGED_SKILL_NAME,
  managedSkillNamesForPrompt,
  routeRequiresSubagents,
  stripVisibleDecisionAnswerBlocks
} from '../routes.js';
import { inspectConfinedPath } from '../managed-path-safety.js';
import {
  renderAuthoritativeSksSkillContext,
  resolveAuthoritativeSksSkillSources
} from '../codex-native/sks-skill-paths.js';
import { looksLikeActiveContinuationPrompt } from './naruto-decision-gate.js';
import {
  extractUserPrompt,
  looksLikeCodexGitAction,
  looksLikeCodexUiSettingsEvent
} from './payload-signals.js';

const STANDALONE_PARENT_BASE_SKILLS = [
  'sks-naruto',
  'sks-pipeline-runner',
  'sks-prompt-pipeline',
  'sks-honest-mode'
];

export async function attachAuthoritativeSksSkillContext(
  root: string,
  state: any,
  payload: any,
  result: any
) {
  if (result?.decision === 'block' || result?.sksTaskProfile === 'passthrough') return result;
  if (looksLikeCodexGitAction(payload) || looksLikeCodexUiSettingsEvent(payload)) return result;
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  if (!dollarCommand(prompt) && routeIsGitOnly(routePrompt(prompt))) return result;
  const skillNames = result?.attached_parent_mission_id
    ? await standaloneParentManagedSkillNames(root, result.attached_parent_mission_id, state)
    : selectedSksSkillNamesForTurn(state, prompt, result);
  if (!skillNames.length) return result;
  const admission = await authoritativeSksSkillAdmission(root, skillNames);
  if (admission.blocked) return { ...result, ...admission.blocked };
  const resolution = admission.resolution;
  if (!resolution) return result;
  const skillContext = renderAuthoritativeSksSkillContext(resolution);
  if (!skillContext) return result;
  return {
    ...result,
    additionalContext: [result?.additionalContext, skillContext].filter(Boolean).join('\n\n')
  };
}

export async function standaloneParentManagedSkillNames(
  root: string,
  missionId: any,
  state: any = {}
): Promise<string[]> {
  const boundedMissionId = String(missionId || '').trim();
  if (!boundedMissionId) return [...STANDALONE_PARENT_BASE_SKILLS];
  const validatedMissionId = validateExternallyReservedMissionId(boundedMissionId);
  if (!validatedMissionId.ok) {
    return [...STANDALONE_PARENT_BASE_SKILLS, INVALID_EXPLICIT_MANAGED_SKILL_NAME];
  }
  const canonicalMissionId = validatedMissionId.id;
  const stateSkills = String(state?.mission_id || '') === canonicalMissionId
    ? allowlistedManagedRouteSkillNames(state?.required_skills)
    : [];
  const routeContext = await readStandaloneParentRouteContext(root, canonicalMissionId);
  const contextSkills = allowlistedManagedRouteSkillNames(routeContext?.required_skills);
  return Array.from(new Set([
    ...stateSkills,
    ...contextSkills,
    ...STANDALONE_PARENT_BASE_SKILLS
  ]));
}

async function readStandaloneParentRouteContext(root: string, missionId: string): Promise<any | null> {
  const file = path.join(missionDir(root, missionId), 'route-context.json');
  try {
    const inspection = await inspectConfinedPath(path.resolve(root), path.resolve(file));
    if (!inspection.exists || inspection.leafSymlink || !inspection.stat?.isFile()) return null;
    return await readJson(file, null).catch(() => null);
  } catch {
    return null;
  }
}

export async function authoritativeSksSkillAdmission(root: string, skillNames: readonly unknown[]) {
  const resolution = await resolveAuthoritativeSksSkillSources({ root, skillNames }).catch(() => null);
  if (!resolution) {
    return {
      resolution: null,
      blocked: {
        decision: 'block',
        reason: 'SKS managed skill resolution failed. Repair the global SKS installation, then retry.',
        systemMessage: 'SKS: managed skill availability check blocked this turn.'
      }
    };
  }
  if (resolution.unresolved.length || resolution.blockers.length) {
    const details = [
      resolution.unresolved.length ? `unavailable=${resolution.unresolved.join(',')}` : '',
      resolution.blockers.length ? `rejected=${resolution.blockers.join(',')}` : ''
    ].filter(Boolean).join('; ');
    return {
      resolution,
      blocked: {
        decision: 'block',
        reason: `SKS managed skill availability check failed (${details}). Repair the global SKS installation, then retry.`,
        systemMessage: 'SKS: managed skill availability check blocked this turn.'
      }
    };
  }
  return { resolution, blocked: null };
}

function selectedSksSkillNamesForTurn(state: any, prompt: string, result: any): string[] {
  if (result?.attached_parent_mission_id) return [...STANDALONE_PARENT_BASE_SKILLS];
  const active = state?.mission_id && state?.route_closed !== true
    && (looksLikeActiveContinuationPrompt(prompt) || isBlockingClarificationAwaiting(state));
  if (active) {
    const activeSkills = selectedSksSkillNamesForActiveState(state);
    if (activeSkills.length) return activeSkills;
  }
  const selectedRoute = routePrompt(prompt);
  const selectedSkills = managedSkillNamesForPrompt(selectedRoute, prompt);
  if (selectedSkills.length) return selectedSkills;
  return result?.sksTaskProfile === 'answer' ? ['answer', 'honest-mode'] : [];
}

export function selectedSksSkillNamesForActiveState(state: any): string[] {
  const persisted = Array.isArray(state?.required_skills) ? state.required_skills : [];
  if (persisted.length) return persisted.map(String);
  const activeRoute = routePrompt(String(state?.route_command || state?.route || state?.mode || ''));
  return activeRoute?.requiredSkills?.length ? activeRoute.requiredSkills.map(String) : [];
}

function activeSksSkillNames(state: any): string[] {
  if (!state?.mission_id || state?.route_closed === true) return [];
  return selectedSksSkillNamesForActiveState(state);
}

export async function activeAuthoritativeSksSkillRefresh(root: string, state: any) {
  const skillNames = activeSksSkillNames(state);
  if (!skillNames.length) return { context: '', blocked: null };
  const admission = await authoritativeSksSkillAdmission(root, skillNames);
  if (admission.blocked) return { context: '', blocked: admission.blocked };
  return {
    context: admission.resolution ? renderAuthoritativeSksSkillContext(admission.resolution) : '',
    blocked: null
  };
}

export async function hookActiveSkillContextRefresh(
  root: string,
  state: any,
  name: 'session-start' | 'pre-compact' | 'post-compact'
) {
  if (name !== 'session-start') {
    if (!activeSksSkillNames(state).length) return { continue: true };
    return {
      continue: true,
      systemMessage: 'SKS will refresh active managed-skill paths from the current installation on compact resume and reverify them before the next tool call.'
    };
  }
  const refresh = await activeAuthoritativeSksSkillRefresh(root, state);
  if (refresh.blocked) {
    return {
      continue: true,
      systemMessage: 'SKS managed skill refresh could not verify the current installation. Do not use a stale skill location; the next active tool call will be denied until the installation is repaired.'
    };
  }
  if (!refresh.context) return { continue: true };
  return { continue: true, additionalContext: refresh.context, silent: true };
}

export function routeBypassesActiveContext(route: any = null) {
  return ['DFix', 'Answer', 'Commit', 'CommitAndPush', 'Wiki', 'ComputerUse'].includes(String(route?.id || ''));
}

export function routeIsGitOnly(route: any = null) {
  return ['Commit', 'CommitAndPush'].includes(String(route?.id || ''));
}

export function shouldPrepareFreshRouteOnActivePrompt(prompt: any, route: any = null, opts: any = {}) {
  if (!route || opts.command || opts.bypassActiveRoute || opts.goalOverlay) return false;
  if (looksLikeActiveContinuationPrompt(prompt)) return false;
  return routeRequiresSubagents(route, prompt);
}

function isClarificationAwaiting(state: any = {}) {
  const phase = String(state.phase || '');
  const stopGate = String(state.stop_gate || '');
  const gateAwaiting = phase.includes('CLARIFICATION_AWAITING_ANSWERS') || stopGate === 'clarification-gate';
  if (!gateAwaiting || !state?.mission_id) return false;
  if (state.ambiguity_gate_required !== true || state.ambiguity_gate_passed === true) return false;
  return Boolean(state.clarification_required || state.implementation_allowed === false);
}

export function isBlockingClarificationAwaiting(state: any = {}) {
  return isClarificationAwaiting(state);
}

export function looksLikeClarificationCancel(prompt: any = '') {
  return /^(cancel|reset|restart|new mission|새로|취소|중단|리셋|다시 시작)\b/i.test(String(prompt || '').trim());
}

export function activeGoalOverlayContext(state: any = {}, route: any = null) {
  if (state.mode !== 'GOAL' || !state.mission_id) return '';
  if (!route || route.id === 'Goal' || route.id === 'DFix' || route.id === 'Answer') return '';
  return [
    `Legacy SKS Goal state ${state.mission_id} is non-authoritative and must not be updated.`,
    `Do not let it hijack this new ${route.command || '$SKS'} prompt. The newly prepared route mission and gate are authoritative for this turn.`,
    'Codex native Goal is the only persisted Goal owner; use native controls only when the user explicitly returns to Goal.'
  ].join('\n');
}
