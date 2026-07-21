import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic, appendJsonl, nowIso, runProcess, sha256, packageRoot, tmpdir, type JsonData } from './fsx.js';
import { looksInteractiveCommand, interactiveCommandReason } from './no-question-guard.js';
import {
  loadStateForSession,
  missionDir,
  sessionStateKey,
  setCurrent,
  stateFileForSession
} from './mission.js';
import { checkDbOperation, dbBlockReason, handleMadSksUserConfirmation } from './db-safety.js';
import { maybeRecordMadSksSqlPlaneToolResultFromToolUse } from './mad-sks/sql-plane/result-lifecycle.js';
import { checkHarnessModification, harnessGuardBlockReason, isHarnessSourceProject } from './harness-guard.js';
import { isMadSksRouteState } from './permission-gates.js';
import { classifyMadSksShellCommand } from './mad-sks/write-guard.js';
import { activeRouteContext, evaluateStop, prepareRoute, promptPipelineContext as routePipelineContext, recordContext7Evidence, recordSubagentEvidence, routePrompt } from './pipeline.js';
import { localizedFinalizationReason } from './language-preference.js';
import { classifyToolError } from './evaluation.js';
import { dollarCommand, routeRequiresSubagents, stripVisibleDecisionAnswerBlocks } from './routes.js';
import { coreEngineeringDirectiveReferenceText } from './lean-engineering-policy.js';
import { scanAgentTextForRecursion } from './agents/agent-recursion-guard.js';
import { evaluateLoopContinuation } from './loops/loop-continuation-enforcer.js';
import { diagnosticPromptAllowedDuringNoQuestions } from './routes/diagnostic-allowlist.js';
import { maybeReconcileProjectSkillsPreflight } from './hooks-runtime/skill-reconcile-preflight.js';
import { codePackFreshnessNote } from './hooks-runtime/code-pack-freshness-preflight.js';
import { claimHookInvocation } from './hooks-runtime/hook-invocation-dedupe.js';
import { armLightTurnStopBypass, clearLightTurnStopBypass, consumeLightTurnStopBypass, hasMatchingLightTurnStopBypass } from './hooks-runtime/light-turn.js';
import { evaluateHookNarutoDecisionGate, looksLikeActiveContinuationPrompt } from './hooks-runtime/naruto-decision-gate.js';
import {
  ensureOfficialSubagentArtifactDirConfined,
  officialSubagentArtifactDir,
  recordAndRefreshSubagentEvidence,
  refreshOfficialSubagentCompletionArtifacts
} from './hooks-runtime/official-subagent-lifecycle.js';
import { finalizationRepeatDecision } from './hooks-runtime/stop-repeat-guard.js';
import {
  activeNarutoParentLaunchMissionId,
  claimStandaloneParentHostCapabilityRuntime
} from './hooks-runtime/standalone-parent-host-capability.js';
import { classifyTaskProfile } from './runtime/task-profile.js';
import { resolveSubagentThreadBudget } from './subagents/thread-budget.js';
import { readOfficialSubagentConfig } from './subagents/official-subagent-config.js';
import { withFileLock } from './locks/file-lock.js';
import { buildWaveParentGuidance, renderWaveParentGuidance } from './subagents/wave-parent-guidance.js';
import { managedOfficialSubagentRoleByName } from './managed-assets/managed-assets-manifest.js';
import {
  renderAuthoritativeSksSkillContext,
  resolveAuthoritativeSksSkillSources
} from './codex-native/sks-skill-paths.js';
import {
  authoritativeSksSkillResolutionBlockers,
  clearSubagentSkillAvailabilityGuards,
  persistSubagentSkillAvailabilityBlocker,
  renderSubagentSkillAvailabilityHandoff,
  subagentSkillAvailabilityPreToolBlockReason
} from './hooks-runtime/subagent-skill-availability.js';
import {
  HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME,
  HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME,
  HOST_CAPABILITY_HOOK_RUNTIME_FILENAME,
  acasHostToolName,
  authorizeAndMergeHostCapabilityPreToolObservation,
  buildHostCapabilityEvidenceFromHookObservations,
  explicitlyDeniedHostCapabilityTool,
  mergeHostCapabilityPostToolObservation,
  requestHostCapabilities,
  resolveHostCapabilityHookRuntimeBinding,
  sanitizeHostCapabilityPostToolUse,
  sanitizeHostCapabilityPreToolUse,
  type HostCapabilityHookRuntimeBinding
} from './agent-bridge/host-capability-runtime.js';
const LIGHT_ROUTE_STOP_ARTIFACT = 'light-route-stop.json';
const CODEX_GIT_ACTION_STOP_ARTIFACT = 'codex-git-action-stop-bypass.json';
const CODEX_GIT_ACTION_STOP_TTL_MS = 15 * 60 * 1000;
const UPDATE_CHECK_HOOK_INVOCATION_POLICY = 'function-only:no-runSksUpdateCheck-call-in-hooks';
// Update checks stay function-only in hooks: the policy marker above is checked
// by release readiness so ordinary Codex hook flow cannot grow a hidden update
// prompt path.
import { loadHookPayload, normalizeHookResult, visibleHookMessage } from './hooks-runtime/hook-io.js';
import {
  codexGitActionMetadataSignal,
  codexGitActionMetadataText,
  compactAnswerContext,
  conversationId,
  explicitConversationId,
  extractCommand,
  extractLastMessage,
  extractUserPrompt,
  hookTurnId,
  looksLikeCodexGitAction,
  looksLikeCodexGitActionStopCompletion,
  looksLikeCodexUiSettingsEvent,
  looksLikeMadSksConfirmationPrompt,
  observedParentModel,
  toolFailed
} from './hooks-runtime/payload-signals.js';
import {
  interruptedToolOutputRecoveryBlockReason,
  missingToolOutputCallId,
  missingToolOutputCallIdFromPayload,
  quarantineMissingToolOutput,
  readToolOutputQuarantine
} from './hooks-runtime/tool-output-quarantine.js';
export { loadHookPayload, normalizeHookResult };
export { refreshOfficialSubagentCompletionArtifacts };

async function loadState(root: any, payload: any = {}) {
  const sessionKey = conversationId(payload);
  if (!explicitConversationId(payload)) return loadStateForSession(root, sessionKey);
  const hashed = sessionStateKey(sessionKey);
  const sessionState = await readJson(stateFileForSession(root, sessionKey), null).catch(() => null);
  return sessionState ? { ...sessionState, _session_key: sessionState._session_key || hashed } : {};
}

function isNoQuestionRunning(state: any) {
  return (state.mode === 'RESEARCH' && state.phase === 'RESEARCH_RUNNING_NO_QUESTIONS')
    || (state.mode === 'QALOOP' && state.phase === 'QALOOP_RUNNING_NO_QUESTIONS');
}

export async function hookMain(name: any): Promise<JsonData> {
  const payload = await loadHookPayload();
  const root = await projectRoot(payload.cwd || process.cwd());
  return evaluateHookPayloadOnce(name, payload, { root });
}

export async function evaluateHookPayloadOnce(name: any, payload: any = {}, opts: any = {}): Promise<JsonData> {
  const root = opts.root || await projectRoot(payload.cwd || process.cwd());
  if (name === 'user-prompt-submit' && hookPayloadIsLightTurnCandidate(payload)) {
    return evaluateHookPayload(name, payload, { root });
  }
  const claim = await claimHookInvocation(root, name, payload).catch(() => ({ duplicate: false }));
  if (claim.duplicate) return { continue: true, suppressedDuplicate: true };
  return evaluateHookPayload(name, payload, { root });
}

function hookPayloadIsLightTurnCandidate(payload: any = {}) {
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  if (dollarCommand(prompt)) return false;
  const profile = classifyTaskProfile(prompt);
  if (profile === 'passthrough') return true;
  return routePrompt(prompt)?.id === 'Answer';
}

export async function evaluateHookPayload(name: any, payload: any = {}, opts: any = {}): Promise<JsonData> {
  const root = opts.root || await projectRoot(payload.cwd || process.cwd());
  const sessionKey = conversationId(payload);
  const greetingFastPath = name === 'user-prompt-submit'
    && !dollarCommand(stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload)))
    && classifyTaskProfile(stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload))) === 'passthrough';
  const matchingLightStop = name === 'stop'
    && await hasMatchingLightTurnStopBypass(root, { sessionKey, turnId: hookTurnId(payload) }).catch(() => false);
  if (!explicitConversationId(payload) && !greetingFastPath && !matchingLightStop) {
    await appendJsonl(path.join(root, '.sneakoscope', 'state', 'session-id-fallback-warning.jsonl'), {
      ts: nowIso(),
      warning: 'hook_payload_missing_explicit_session_id',
      conversation_id: sessionKey,
      cwd_hash: sha256(String(payload.cwd || root)).slice(0, 12),
      hook: name
    }).catch(() => null);
  }
  // Hook decisions use persisted session state. Codex hook payloads do not
  // define a trusted `state` field; accepting a partial/spoofed value can hide
  // an active mission or bypass route gates. Explicit opts.state remains for
  // internal replay and focused tests.
  const loadedState = opts.state || await loadState(root, payload);
  const state = { ...loadedState, _session_key: loadedState?._session_key || sessionKey };
  const noQuestion = isNoQuestionRunning(state);
  const sksNarutoDecision = await evaluateHookNarutoDecisionGate({
    root,
    name,
    payload,
    state,
    sessionKey,
    noQuestion,
    parentLaunchMissionId: activeNarutoParentLaunchMissionId()
  });
  const withNarutoDecision = (result: any) => ({ ...result, sksNarutoDecision });
  if (name === 'user-prompt-submit') {
    const result = await hookUserPrompt(root, state, payload, noQuestion, sessionKey);
    return withNarutoDecision(await attachAuthoritativeSksSkillContext(root, state, payload, result));
  }
  if (name === 'pre-tool') return withNarutoDecision(await hookPreTool(root, state, payload, noQuestion, sessionKey));
  if (name === 'post-tool') return withNarutoDecision(await hookPostTool(root, state, payload, noQuestion, sessionKey));
  if (name === 'permission-request') return withNarutoDecision(await hookPermission(root, state, payload, noQuestion, sessionKey));
  if (name === 'stop') return withNarutoDecision(await hookStop(root, state, payload, noQuestion, sessionKey));
  if (name === 'subagent-start') return withNarutoDecision(await hookSubagentStart(root, state, payload, sessionKey));
  if (name === 'subagent-stop') return withNarutoDecision(await hookSubagentStop(root, state, payload, sessionKey));
  return withNarutoDecision({ continue: true });
}

async function attachAuthoritativeSksSkillContext(root: string, state: any, payload: any, result: any) {
  if (result?.decision === 'block' || result?.sksTaskProfile === 'passthrough') return result;
  if (looksLikeCodexGitAction(payload) || looksLikeCodexUiSettingsEvent(payload)) return result;
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  if (routeIsGitOnly(routePrompt(prompt))) return result;
  const skillNames = selectedSksSkillNamesForTurn(state, prompt, result);
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

async function authoritativeSksSkillAdmission(root: string, skillNames: readonly unknown[]) {
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
  if (result?.attached_parent_mission_id) {
    return ['naruto', 'pipeline-runner', 'prompt-pipeline', 'honest-mode'];
  }
  const active = state?.mission_id && state?.route_closed !== true
    && (looksLikeActiveContinuationPrompt(prompt) || isBlockingClarificationAwaiting(state));
  if (active) {
    const activeSkills = selectedSksSkillNamesForActiveState(state);
    if (activeSkills.length) return activeSkills;
  }
  const selectedRoute = routePrompt(prompt);
  if (selectedRoute?.requiredSkills?.length) return selectedRoute.requiredSkills.map(String);
  return result?.sksTaskProfile === 'answer' ? ['answer', 'honest-mode'] : [];
}

function selectedSksSkillNamesForActiveState(state: any): string[] {
  const persisted = Array.isArray(state?.required_skills) ? state.required_skills : [];
  if (persisted.length) return persisted.map(String);
  const activeRoute = routePrompt(String(state?.route_command || state?.route || state?.mode || ''));
  return activeRoute?.requiredSkills?.length ? activeRoute.requiredSkills.map(String) : [];
}

async function hookSubagentStart(root: any, state: any, payload: any = {}, sessionKey: any = null) {
  const artifactDir = officialSubagentArtifactDir(root, state, sessionKey);
  const artifactDirBlockers: string[] = [];
  const artifactDirSafe = await ensureOfficialSubagentArtifactDirConfined(root, artifactDir)
    .then(() => true)
    .catch(() => false);
  if (!artifactDirSafe) artifactDirBlockers.push('subagent_skill_availability_artifact_dir_unsafe');
  // Codex can reuse an official child thread id for a later generation even
  // when the prior child never emitted SubagentStop. Clear any prior
  // generation's guard before evaluating and persisting this start's result.
  await clearSubagentSkillAvailabilityGuards(root, payload, artifactDir).catch(() => null);
  const config = await readOfficialSubagentConfig(root);
  const budget = resolveSubagentThreadBudget({ configuredMaxThreads: config.maxThreads });
  const active = subagentRouteContext(state);
  const routingContext = artifactDirSafe ? await sealedSubagentRoutingContext(artifactDir, payload) : '';
  const resourceGuard = [
    `SKS subagent policy: Codex [agents].max_threads is ${budget.maxThreads}.`,
    'Use max_depth=1. Subagents must not spawn subagents.',
    'Do not duplicate an already assigned slice.',
    'Parallel writes require disjoint paths; serialize overlapping paths.',
    'Finish only your assigned slice, return a concise result, then stop so the root parent can close this thread.'
  ].join(' ');
  const skillNames = selectedSksSkillNamesForActiveState(state);
  const resolution = skillNames.length
    ? await resolveAuthoritativeSksSkillSources({ root, skillNames }).catch(() => null)
    : null;
  const skillBlockers = [
    ...artifactDirBlockers,
    ...(skillNames.length ? authoritativeSksSkillResolutionBlockers(resolution) : [])
  ];
  try {
    await persistSubagentSkillAvailabilityBlocker({
      root,
      artifactDir,
      state,
      payload,
      blockers: skillBlockers
    });
  } catch (error: unknown) {
    const blocker = error instanceof Error
      && error.message === 'subagent_skill_availability_blocker_artifact_write_failed'
      ? 'subagent_skill_availability_blocker_artifact_write_failed'
      : 'subagent_skill_availability_guard_persistence_failed';
    skillBlockers.push(blocker);
  }
  if (artifactDirSafe) {
    await recordAndRefreshSubagentEvidence(root, state, payload, 'SubagentStart', sessionKey).catch(() => null);
  }
  const skillContext = skillBlockers.length
    ? renderSubagentSkillAvailabilityHandoff(skillBlockers)
    : resolution
      ? renderAuthoritativeSksSkillContext(resolution)
      : '';
  const additionalContext = [coreEngineeringDirectiveReferenceText(), resourceGuard, routingContext, active, skillContext].filter(Boolean).join('\n\n');
  return { continue: true, additionalContext, ...(skillBlockers.length ? { silent: true } : {}) };
}

async function sealedSubagentRoutingContext(artifactDir: string, payload: any = {}) {
  const plan: any = await readJson(path.join(artifactDir, 'subagent-plan.json'), null).catch(() => null);
  if (!plan || plan.workflow !== 'official_codex_subagent') return '';
  const agentName = extractSubagentAgentName(payload);
  const agents = plan.agents && typeof plan.agents === 'object' ? plan.agents : {};
  const planned = agentName && agents[agentName] ? agents[agentName] : null;
  const role = agentName ? managedOfficialSubagentRoleByName(agentName) : null;
  const model = String(planned?.routed_model || planned?.model || role?.model || '').trim();
  const effort = String(planned?.routed_model_reasoning_effort || planned?.model_reasoning_effort || role?.model_reasoning_effort || '').trim();
  if (!agentName && !model) return '';
  return [
    'SKS sealed child routing:',
    agentName ? `- custom agent: ${agentName}` : null,
    model ? `- model: ${model}` : null,
    effort ? `- model_reasoning_effort: ${effort}` : null,
    '- keep this sealed profile; do not retarget model/effort or spawn nested agents'
  ].filter(Boolean).join('\n');
}

function extractSubagentAgentName(payload: any = {}) {
  const candidates = [
    payload.agent_type,
    payload.agentType,
    payload.subagent_type,
    payload.subagentType,
    payload.agent_name,
    payload.agentName,
    payload.agent,
    payload.role,
    payload.payload?.agent_type,
    payload.payload?.agentType,
    payload.payload?.subagent_type,
    payload.data?.agent_type,
    payload.input?.agent_type
  ];
  for (const value of candidates) {
    const name = String(value || '').trim();
    if (name) return name;
  }
  return '';
}

function subagentRouteContext(state: any = {}) {
  if (!state?.route && !state?.mode) return '';
  const route = state.route_command || state.route || state.mode;
  const mission = state.mission_id ? ` for mission ${state.mission_id}` : '';
  const artifacts = state.mission_id
    ? ` Read only the route artifacts relevant to your assigned slice under .sneakoscope/missions/${state.mission_id}/.`
    : '';
  const databaseBoundary = String(state.mode || state.route || '').toUpperCase() === 'DB'
    ? ' Keep database inspection read-only unless the parent supplied a separately sealed mutation contract.'
    : '';
  return `You are a child thread on ${route}${mission}. Execute only the slice assigned by the parent.${artifacts} Do not spawn or delegate other agents, wait for sibling threads, integrate sibling results, close the parent route, or author the sks.subagent-parent-summary.v1 parent result. Return a concise slice result to the parent.${databaseBoundary}`;
}

async function hookSubagentStop(root: any, state: any, payload: any = {}, sessionKey: any = null) {
  await recordAndRefreshSubagentEvidence(root, state, payload, 'SubagentStop', sessionKey).catch(() => null);
  await clearSubagentSkillAvailabilityGuards(
    root,
    payload,
    officialSubagentArtifactDir(root, state, sessionKey)
  ).catch(() => null);
  // SubagentStop is evidence collection only. It must never reuse the parent
  // Stop hook's route gate or block a child thread from returning its result.
  return { continue: true, silent: true };
}

async function hookUserPrompt(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  // A receipt is scoped to exactly one submitted turn. Every later prompt,
  // including Codex App git/settings events, invalidates it before returning.
  await clearLightTurnStopBypass(root, { sessionKey }).catch(() => undefined);
  const submittedPrompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  const explicitSession = explicitConversationId(payload);
  const detectedMissingCallId = missingToolOutputCallId(submittedPrompt)
    || missingToolOutputCallIdFromPayload(payload);
  let toolOutputQuarantine = explicitSession
    ? await readToolOutputQuarantine(root, sessionKey).catch(() => null)
    : null;
  if (detectedMissingCallId && explicitSession) {
    toolOutputQuarantine = await quarantineMissingToolOutput({
      root,
      sessionKey,
      callId: detectedMissingCallId,
      missionId: state?.mission_id,
      turnId: hookTurnId(payload)
    }).catch(() => toolOutputQuarantine);
  }
  if (submittedPrompt && (detectedMissingCallId || toolOutputQuarantine)) {
    return {
      decision: 'block',
      reason: interruptedToolOutputRecoveryBlockReason({
        callId: detectedMissingCallId || toolOutputQuarantine?.call_id,
        missionId: state?.mission_id || toolOutputQuarantine?.mission_id
      })
    };
  }
  const parentLaunchMissionId = activeNarutoParentLaunchMissionId();
  if (parentLaunchMissionId) {
    const skillAdmission = await authoritativeSksSkillAdmission(root, [
      'naruto',
      'pipeline-runner',
      'prompt-pipeline',
      'honest-mode'
    ]);
    if (skillAdmission.blocked) return skillAdmission.blocked;
    const parentHostCapability = await claimStandaloneParentHostCapabilityRuntime({
      root,
      missionId: parentLaunchMissionId,
      sessionScope: sessionKey,
      explicitSession
    });
    if (parentHostCapability.blocker) {
      return {
        decision: 'block',
        permissionDecision: 'deny',
        reason: `SKS blocked the standalone Naruto parent before host tool execution: ${parentHostCapability.blocker}`
      };
    }
    const attachedState = {
      ...state,
      mission_id: parentLaunchMissionId,
      mode: 'NARUTO',
      route: 'Naruto',
      route_command: '$Naruto',
      route_closed: false,
      subagents_required: true,
      native_sessions_required: false,
      official_subagent_run_id: parentHostCapability.workflowRunId || state?.official_subagent_run_id || null,
      session_scope: sessionKey
    };
    await setCurrent(root, attachedState, { sessionKey, replace: true });
    const activeContext = await activeRouteContext(root, attachedState);
    return {
      continue: true,
      additionalContext: activeContext,
      systemMessage: visibleHookMessage('user-prompt-submit', activeContext),
      attached_parent_mission_id: parentLaunchMissionId
    };
  }
  if (looksLikeCodexGitAction(payload)) {
    await armCodexGitActionStopBypass(root, payload).catch(() => null);
    return {
      continue: true,
      systemMessage: 'SKS: Codex App git action bypassed route gates.'
    };
  }
  if (looksLikeCodexUiSettingsEvent(payload)) {
    return {
      continue: true,
      systemMessage: 'SKS: Codex App settings/profile event ignored; route gates unchanged.'
    };
  }
  if (!noQuestion) {
    const prompt = submittedPrompt;
    const taskProfile = classifyTaskProfile(prompt);
    const explicitCommand = Boolean(dollarCommand(prompt));
    const lightRoute = explicitCommand ? null : routePrompt(prompt);
    const clarificationPending = isBlockingClarificationAwaiting(state);
    const madConfirmationPrompt = looksLikeMadSksConfirmationPrompt(prompt);
    const activeContinuation = Boolean(state?.mission_id && state?.route_closed !== true && looksLikeActiveContinuationPrompt(prompt));
    if (!explicitCommand && !clarificationPending && !madConfirmationPrompt && !activeContinuation && taskProfile === 'passthrough') {
      const turnId = hookTurnId(payload);
      if (turnId) {
        await armLightTurnStopBypass(root, {
          sessionKey,
          turnId,
          prompt,
          profile: 'passthrough',
          ttlMs: 60_000
        });
      }
      return { continue: true, silent: true, sksTaskProfile: taskProfile };
    }
    if (!explicitCommand && !clarificationPending && !madConfirmationPrompt && !activeContinuation && lightRoute?.id === 'Answer') {
      const skillAdmission = await authoritativeSksSkillAdmission(root, lightRoute.requiredSkills || ['answer', 'honest-mode']);
      if (skillAdmission.blocked) return skillAdmission.blocked;
      const turnId = hookTurnId(payload);
      if (turnId) {
        await armLightTurnStopBypass(root, {
          sessionKey,
          turnId,
          prompt,
          profile: 'answer',
          ttlMs: 5 * 60_000
        });
      }
      const additionalContext = compactAnswerContext(prompt);
      return { continue: true, additionalContext, sksTaskProfile: 'answer' };
    }
    const madSksConfirmation = madConfirmationPrompt
      ? await handleMadSksUserConfirmation(root, state, prompt)
      : null;
    if (madSksConfirmation?.handled) {
      const additionalContext = madSksConfirmation.additionalContext;
      return { continue: true, additionalContext, systemMessage: visibleHookMessage('user-prompt-submit', additionalContext) };
    }
    if (activeContinuation) {
      const activeContext = await activeRouteContext(root, state);
      return {
        continue: true,
        additionalContext: activeContext,
        systemMessage: visibleHookMessage('user-prompt-submit', activeContext)
      };
    }

    const updateContext = '';
    const command = dollarCommand(prompt);
    const route = routePrompt(prompt);
    if (routeIsGitOnly(route)) {
      await armCodexGitActionStopBypass(root, payload).catch(() => null);
      return {
        continue: true,
        systemMessage: `SKS: ${route.command} git action bypassed pipeline route gates.`
      };
    }
    const skillAdmission = await authoritativeSksSkillAdmission(root, route?.requiredSkills || []);
    if (skillAdmission.blocked) return skillAdmission.blocked;
    await maybeReconcileProjectSkillsPreflight(root).catch(() => null);
    const bypassActiveRoute = routeBypassesActiveContext(route);
    const goalOverlay = activeGoalOverlayContext(state, route);
    const prepareFreshRoute = shouldPrepareFreshRouteOnActivePrompt(prompt, route, {
      command,
      bypassActiveRoute,
      goalOverlay
    });
    if (isBlockingClarificationAwaiting(state) && !looksLikeClarificationCancel(prompt)) {
      const activeContext = await activeRouteContext(root, state);
      const additionalContext = [updateContext, activeContext].filter(Boolean).join('\n\n');
      return { continue: true, additionalContext, systemMessage: visibleHookMessage('user-prompt-submit', additionalContext) };
    }
    const shouldLoadActiveContext = !command && !bypassActiveRoute && !goalOverlay && !prepareFreshRoute;
    const activeContext = shouldLoadActiveContext ? await activeRouteContext(root, state) : '';
    const contexts = [updateContext];
    if (activeContext && shouldLoadActiveContext) contexts.push(routePipelineContext(prompt), activeContext);
    else contexts.push((await prepareRoute(root, prompt, state, {
      sessionKey,
      parentModel: observedParentModel(payload)
    })).additionalContext);
    if (goalOverlay) contexts.push(goalOverlay);
    const codePackNote = await codePackFreshnessNote(root);
    if (codePackNote) contexts.push(codePackNote);
    const additionalContext = contexts.filter(Boolean).join('\n\n');
    return { continue: true, additionalContext, systemMessage: visibleHookMessage('user-prompt-submit', additionalContext) };
  }
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  if (diagnosticPromptAllowedDuringNoQuestions(prompt)) {
    return {
      continue: true,
      systemMessage: 'SKS: diagnostic command allowed during no-question mode by command registry contract.'
    };
  }
  const id = state.mission_id;
  if (id) await appendJsonl(path.join(missionDir(root, id), 'user_queue.jsonl'), { ts: nowIso(), payload });
  return {
    decision: 'block',
    reason: 'SKS no-question/no-interruption mode is active. User prompt has been queued until the run completes.'
  };
}

function routeBypassesActiveContext(route: any = null) {
  return ['DFix', 'Answer', 'Commit', 'CommitAndPush', 'Wiki', 'ComputerUse'].includes(String(route?.id || ''));
}

function routeIsGitOnly(route: any = null) {
  return ['Commit', 'CommitAndPush'].includes(String(route?.id || ''));
}

function shouldPrepareFreshRouteOnActivePrompt(prompt: any, route: any = null, opts: any = {}) {
  if (!route || opts.command || opts.bypassActiveRoute || opts.goalOverlay) return false;
  if (looksLikeActiveContinuationPrompt(prompt)) return false;
  return routeRequiresSubagents(route, prompt);
}

function isClarificationAwaiting(state: any = {}) {
  const phase = String(state.phase || '');
  const stopGate = String(state.stop_gate || '');
  const gateAwaiting = phase.includes('CLARIFICATION_AWAITING_ANSWERS') || stopGate === 'clarification-gate';
  if (!gateAwaiting) return false;
  if (!state?.mission_id) return false;
  if (state.ambiguity_gate_required !== true || state.ambiguity_gate_passed === true) return false;
  return Boolean(state.clarification_required || state.implementation_allowed === false);
}

function isBlockingClarificationAwaiting(state: any = {}) {
  return isClarificationAwaiting(state);
}

function looksLikeClarificationCancel(prompt: any = '') {
  return /^(cancel|reset|restart|new mission|새로|취소|중단|리셋|다시 시작)\b/i.test(String(prompt || '').trim());
}

function activeGoalOverlayContext(state: any = {}, route: any = null) {
  if (state.mode !== 'GOAL' || !state.mission_id) return '';
  if (!route || route.id === 'Goal' || route.id === 'DFix' || route.id === 'Answer') return '';
  return [
    `Legacy SKS Goal state ${state.mission_id} is non-authoritative and must not be updated.`,
    `Do not let it hijack this new ${route.command || '$SKS'} prompt. The newly prepared route mission and gate are authoritative for this turn.`,
    'Codex native Goal is the only persisted Goal owner; use native controls only when the user explicitly returns to Goal.'
  ].join('\n');
}

async function hookPreTool(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  const skillAvailabilityBlock = await subagentSkillAvailabilityPreToolBlockReason(
    root,
    payload,
    officialSubagentArtifactDir(root, state, sessionKey)
  ).catch((error: unknown) => {
    const code = error instanceof Error && error.message === 'subagent_skill_availability_guard_invalid'
      ? 'subagent_skill_availability_guard_invalid'
      : 'subagent_skill_availability_guard_check_failed';
    return `SKS blocked this child tool call because managed skill availability failed (${code}). Return the blocker to the root parent without using tools.`;
  });
  if (skillAvailabilityBlock) {
    return { decision: 'block', permissionDecision: 'deny', reason: skillAvailabilityBlock };
  }
  if (needsMutationSafetyCheck(payload)) {
    const madSksImmutableDecision = await checkMadSksImmutableModification(root, state, payload);
    if (madSksImmutableDecision.action === 'block') {
      return { decision: 'block', permissionDecision: 'deny', reason: madSksImmutableBlockReason(madSksImmutableDecision) };
    }
    const harnessDecision = await checkHarnessModification(root, payload, { phase: 'pre-tool' });
    if (harnessDecision.action === 'block') {
      return { decision: 'block', permissionDecision: 'deny', reason: harnessGuardBlockReason(harnessDecision) };
    }
    const dbDecision = await checkDbOperation(root, state, payload, { duringNoQuestion: noQuestion });
    if (dbDecision.action === 'block' || dbDecision.action === 'confirm') {
      return { decision: 'block', permissionDecision: 'deny', reason: dbBlockReason(dbDecision) };
    }
  }
  if (clarificationGateLocked(state) && !clarificationAnswerToolAllowed(payload)) {
    return { decision: 'block', permissionDecision: 'deny', reason: clarificationPauseBlockReason(state) };
  }
  const command = extractCommand(payload);
  const agentRecursionDecision = agentWorkerHookRecursionDecision(state, payload, command);
  if (agentRecursionDecision) return agentRecursionDecision;
  if (noQuestion && looksInteractiveCommand(command)) return { decision: 'block', reason: interactiveCommandReason(command) };
  const hostCapabilityDecision = await enforceHostCapabilityPreTool(root, state, payload, sessionKey);
  if (hostCapabilityDecision && hostCapabilityDecision.continue !== true) return hostCapabilityDecision;
  const waveGuidance = await parentWaveGuidanceContext(root, state, sessionKey).catch(() => '');
  if (waveGuidance) {
    return {
      continue: true,
      additionalContext: waveGuidance,
      systemMessage: visibleHookMessage('pre-tool', 'SKS Naruto wave lifecycle requires root-parent follow-up.')
    };
  }
  return { continue: true };
}

async function parentWaveGuidanceContext(root: any, state: any = {}, sessionKey: any = null) {
  if (!state?.mission_id && !state?.official_subagent_run_id) return '';
  const isNaruto = String(state?.mode || '').toUpperCase() === 'NARUTO'
    || String(state?.route || state?.route_command || '').replace(/^\$/, '').toUpperCase() === 'NARUTO'
    || state?.subagents_required === true;
  if (!isNaruto) return '';
  // Child worker hooks must not receive parent wave spawn instructions.
  if (agentWorkerHookContext(state, {})) return '';
  const artifactDir = officialSubagentArtifactDir(root, state, sessionKey);
  const plan: any = await readJson(path.join(artifactDir, 'subagent-plan.json'), null).catch(() => null);
  if (!plan || plan.workflow !== 'official_codex_subagent') return '';
  const lifecycle = plan.wave_lifecycle || null;
  const guidance = lifecycle?.parent_guidance || buildWaveParentGuidance(lifecycle);
  if (!guidance?.required) return '';
  return renderWaveParentGuidance(guidance);
}

function agentWorkerHookRecursionDecision(state: any = {}, payload: any = {}, command: any = '') {
  if (!agentWorkerHookContext(state, payload)) return null;
  const guard = scanAgentTextForRecursion(command);
  if (guard.ok) return null;
  return {
    decision: 'block',
    permissionDecision: 'deny',
    reason: `Agent command recursion guard blocked nested SKS route command in Codex PreToolUse hook: ${guard.violations.join(', ')}`
  };
}

function agentWorkerHookContext(state: any = {}, payload: any = {}) {
  const env = {
    ...(payload.env || {}),
    ...(payload.tool_input?.env || {}),
    ...(payload.toolInput?.env || {}),
    ...(payload.input?.env || {}),
    ...(payload.tool?.input?.env || {})
  };
  void state;
  return Boolean(String(env.SKS_AGENT_WORKER || '') === '1'
    || String(env.SKS_DISABLE_ROUTE_RECURSION || '') === '1'
    || payload.agent_worker === true
    || payload.agentWorker === true);
}

async function hookPostTool(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  state = { ...state, _session_key: state?._session_key || sessionKey };
  await Promise.all([
    recordHostCapabilityPostTool(root, state, payload, sessionKey).catch(() => null),
    recordMadSksSqlPlanePostToolLifecycle(root, state, payload).catch(() => null),
    recordContext7Evidence(root, state, payload).catch(() => null),
    recordSubagentEvidence(root, state, payload).catch(() => null),
    toolFailed(payload) ? recordToolErrorTaxonomy(root, state, payload).catch(() => null) : Promise.resolve(null)
  ]);
  if (!noQuestion) return { continue: true };
  if (toolFailed(payload)) {
    return {
      additionalContext: 'SKS no-question mode is active. Do not ask the user about this tool failure. Apply the active decision ladder, create a fix task only inside the sealed contract, and continue. Do not create unrequested fallback implementation code; block with evidence if the requested path is impossible.',
      systemMessage: visibleHookMessage('post-tool')
    };
  }
  return { continue: true };
}

async function enforceHostCapabilityPreTool(root: string, state: any = {}, payload: any = {}, sessionKey: any = null) {
  const tool = acasHostToolName(payload.tool_name);
  if (!tool) return null;
  if (explicitlyDeniedHostCapabilityTool(tool)) {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: `SKS denied acas-tools.${tool}; this tool is explicitly denied for model execution.`
    };
  }
  const context = await loadHostCapabilityHookContext(root, state, payload, sessionKey);
  if (!context) {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: 'SKS denied this acas-tools call because it has no valid task-scoped Naruto mission, run, and session context.'
    };
  }
  if (!context.binding) {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: `SKS denied this acas-tools call because the current Naruto mission has no valid task-scoped host capability runtime: ${context.blocker}`
    };
  }
  const observation = sanitizeHostCapabilityPreToolUse(context.binding.runtime, payload);
  if (!observation) {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: 'SKS denied this acas-tools call because its official PreToolUse identity fields are invalid.'
    };
  }
  let authorization: { decision: 'allowed' | 'denied'; blocker: string | null } = {
    decision: observation.decision,
    blocker: observation.blocker
  };
  try {
    await withFileLock({
      lockPath: path.join(context.dir, '.host-capability-hooks.lock'),
      timeoutMs: 5_000,
      staleMs: 60_000
    }, async () => {
      const current = await readJson(path.join(context.dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), null).catch(() => null);
      const result = authorizeAndMergeHostCapabilityPreToolObservation({
        binding: context.binding!,
        current,
        observation
      });
      authorization = result;
      await writeJsonAtomic(path.join(context.dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), result.observations);
    });
  } catch {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: 'SKS denied this acas-tools call because its bounded PreToolUse evidence could not be persisted.'
    };
  }
  if (authorization.decision === 'denied') {
    return {
      decision: 'block',
      permissionDecision: 'deny',
      reason: authorization.blocker
        ? `SKS denied acas-tools.${observation.tool}; ${authorization.blocker}.`
        : `SKS denied acas-tools.${observation.tool}; it is outside runtime.allowed_tool_names for this mission, run, and session.`
    };
  }
  return { continue: true };
}

async function recordHostCapabilityPostTool(root: string, state: any = {}, payload: any = {}, sessionKey: any = null) {
  if (!acasHostToolName(payload.tool_name)) return null;
  const context = await loadHostCapabilityHookContext(root, state, payload, sessionKey);
  if (!context?.binding) return null;
  const observation = sanitizeHostCapabilityPostToolUse(payload);
  if (!observation) return null;
  return withFileLock({
    lockPath: path.join(context.dir, '.host-capability-hooks.lock'),
    timeoutMs: 5_000,
    staleMs: 60_000
  }, async () => {
    const current = await readJson(path.join(context.dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), null).catch(() => null);
    const next = mergeHostCapabilityPostToolObservation({
      binding: context.binding!,
      current,
      observation
    });
    const evidence = buildHostCapabilityEvidenceFromHookObservations({
      binding: context.binding!,
      observations: next
    });
    await Promise.all([
      writeJsonAtomic(path.join(context.dir, HOST_CAPABILITY_HOOK_OBSERVATIONS_FILENAME), next),
      writeJsonAtomic(path.join(context.dir, HOST_CAPABILITY_HOOK_EVIDENCE_FILENAME), evidence)
    ]);
    return evidence;
  });
}

async function loadHostCapabilityHookContext(
  root: string,
  state: any = {},
  payload: any = {},
  sessionKey: any = null
): Promise<{
  dir: string;
  binding: HostCapabilityHookRuntimeBinding | null;
  blocker: string;
} | null> {
  const missionId = String(state?.mission_id || '').trim();
  const workflowRunId = String(state?.official_subagent_run_id || '').trim();
  const payloadSession = String(payload?.session_id || '').trim();
  const expectedSession = String(state?.session_scope || sessionKey || '').trim();
  const isNaruto = String(state?.mode || '').toUpperCase() === 'NARUTO'
    || String(state?.route || state?.route_command || '').replace(/^\$/, '').toUpperCase() === 'NARUTO'
    || state?.subagents_required === true;
  if (!isNaruto || !missionId || !workflowRunId || !payloadSession || !expectedSession) return null;
  if (payloadSession !== expectedSession || (sessionKey && String(sessionKey) !== payloadSession)) return null;
  const dir = missionDir(root, missionId);
  const [raw, plan] = await Promise.all([
    readJson(path.join(dir, HOST_CAPABILITY_HOOK_RUNTIME_FILENAME), null).catch(() => null),
    readJson(path.join(dir, 'subagent-plan.json'), null).catch(() => null)
  ]);
  const request = requestHostCapabilities(plan?.goal || state?.prompt || '');
  return { dir, ...resolveHostCapabilityHookRuntimeBinding(raw, {
    missionId,
    workflowRunId,
    sessionScope: payloadSession,
    request
  }) };
}

function needsMutationSafetyCheck(payload: any = {}) {
  const toolName = String(payload.tool_name || payload.toolName || payload.name || payload.tool?.name || '');
  const knownReadOnly = /^(Read|Grep|Glob|LS|TodoRead|WebFetch|WebSearch|BashOutput|NotebookRead|ListMcpResources|ReadMcpResource)$/i;
  if (knownReadOnly.test(toolName)) return /\b(sql|supabase|db|migration)\b/i.test(JSON.stringify(payload || {}));
  if (/^(Edit|Write|MultiEdit|NotebookEdit|Bash|Shell|ApplyPatch)$/i.test(toolName)) return true;
  if (/\b(sql|supabase|db|migration)\b/i.test(toolName)) return true;
  return true;
}

async function recordMadSksSqlPlanePostToolLifecycle(root: any, state: any = {}, payload: any = {}) {
  if (!state?.mission_id) return null;
  return maybeRecordMadSksSqlPlaneToolResultFromToolUse({
    root,
    missionId: String(state.mission_id),
    toolCallPayload: payload,
    toolResult: payload
  });
}

function extractRowCount(payload: any = {}) {
  const candidates = [
    payload.row_count,
    payload.rowCount,
    payload.tool_response?.row_count,
    payload.tool_response?.rowCount,
    payload.toolResponse?.rowCount,
    payload.result?.row_count,
    payload.result?.rowCount,
    payload.result?.rows_affected,
    payload.tool_response?.rows_affected
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractToolError(payload: any = {}) {
  return String(payload.error || payload.message || payload.stderr || payload.tool_response?.stderr || payload.toolResponse?.stderr || payload.result?.stderr || payload.result?.error || 'tool_failed');
}

async function recordToolErrorTaxonomy(root: any, state: any = {}, payload: any = {}) {
  if (!state?.mission_id) return null;
  const classification = classifyToolError({
    code: payload.exit_code ?? payload.exitCode ?? payload.tool_response?.exit_code ?? payload.result?.exit_code,
    name: payload.tool_name || payload.name || payload.tool?.name,
    message: payload.error || payload.message || payload.stderr || payload.tool_response?.stderr || payload.result?.stderr,
    stderr: payload.stderr || payload.tool_response?.stderr || payload.result?.stderr
  });
  const record = {
    ts: nowIso(),
    classification,
    unknown_is_harness_bug: classification === 'Unknown',
    tool: payload.tool_name || payload.name || payload.tool?.name || null,
    payload_hash: sha256(JSON.stringify(payload || {})).slice(0, 16)
  };
  await appendJsonl(path.join(missionDir(root, state.mission_id), 'tool-errors.jsonl'), record);
  return record;
}

async function hookPermission(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  void sessionKey;
  const madSksImmutableDecision = await checkMadSksImmutableModification(root, state, payload);
  if (madSksImmutableDecision.action === 'block') {
    return { decision: 'deny', permissionDecision: 'deny', reason: madSksImmutableBlockReason(madSksImmutableDecision) };
  }
  const harnessDecision = await checkHarnessModification(root, payload, { phase: 'permission-request' });
  if (harnessDecision.action === 'block') {
    return { decision: 'deny', permissionDecision: 'deny', reason: harnessGuardBlockReason(harnessDecision) };
  }
  const dbDecision = await checkDbOperation(root, state, payload, { duringNoQuestion: noQuestion });
  if (dbDecision.action === 'block' || dbDecision.action === 'confirm') {
    return { decision: 'deny', permissionDecision: 'deny', reason: dbBlockReason(dbDecision) };
  }
  if (clarificationGateLocked(state) && !clarificationAnswerToolAllowed(payload)) {
    return { decision: 'deny', permissionDecision: 'deny', reason: clarificationPauseBlockReason(state) };
  }
  if (noQuestion && looksLikeUserGitAction(payload)) return { continue: true };
  if (!noQuestion) return { continue: true };
  return {
    decision: 'deny',
    permissionDecision: 'deny',
    reason: 'SKS no-question mode forbids mid-loop approval prompts. Choose a non-approval safe alternative using the active plan.'
  };
}

async function checkMadSksImmutableModification(root: any, state: any = {}, payload: any = {}) {
  if (!isMadSksRouteState(state)) return { action: 'allow' };
  if (await isHarnessSourceProject(root).catch(() => false)) {
    return { action: 'allow', reason: 'harness_source_exception_or_unlocked' };
  }
  const command = extractCommand(payload);
  const classified: any = await classifyMadSksShellCommand({ command: command || JSON.stringify(payload || {}), cwd: payload.cwd || process.cwd(), root: packageRoot() }).catch((err: any) => ({ action: 'allow', error: err.message }));
  if (classified.action === 'block' && (classified.protected_core_matches?.length || classified.reasons?.includes('cwd_is_protected_core'))) {
    await appendJsonl(path.join(root, '.sneakoscope', 'state', 'mad-sks-immutable-guard.jsonl'), { ts: nowIso(), classified }).catch(() => {});
    return { action: 'block', classified };
  }
  return { action: 'allow', classified };
}

function madSksImmutableBlockReason(decision: any = {}) {
  const reasons = decision.classified?.reasons?.join(', ') || 'protected_core_path';
  return `MAD-SKS immutable harness guard blocked this tool call. SKS package/source/dist/scripts/schemas/release metadata remain read-only even in MAD-SKS mode: ${reasons}.`;
}

function looksLikeUserGitAction(payload: any = {}) {
  const command = extractCommand(payload);
  const haystack = [
    command,
    codexGitActionMetadataText(payload),
    payload.action,
    payload.intent,
    payload.operation,
    payload.permission,
    payload.description,
    payload.message,
    payload.tool_name,
    payload.toolName
  ].filter(Boolean).join(' ');
  if (/\b(?:reset\s+--hard|clean\s+-[^\s]*f|checkout\s+--|restore\s+|rm\s+|push\s+--force|push\s+-[^\s]*f)\b/i.test(command)) return false;
  if (codexGitActionMetadataSignal(haystack)) return true;
  if (/\bcodex\b[\s_-]*(?:app\s*)?(?:git\s*)?(?:action|commit|push|pr)\b/i.test(haystack)) return true;
  if (!/^\s*git\s+/i.test(command)) return false;
  return /\bgit\s+(?:status|diff|add|commit|push|branch|remote|rev-parse|log)\b/i.test(command);
}

function clarificationGateLocked(state: any = {}) {
  if (isBlockingClarificationAwaiting(state)) return true;
  return Boolean(
    state?.mission_id
    && state.implementation_allowed === false
    && state.ambiguity_gate_required === true
    && state.ambiguity_gate_passed !== true
    && (String(state.phase || '').includes('CLARIFICATION_AWAITING_ANSWERS') || String(state.stop_gate || '') === 'clarification-gate')
  );
}

function clarificationAnswerToolAllowed(payload: any = {}) {
  const command = extractCommand(payload);
  if (/\bpipeline\s+answer\b/i.test(command) && /\b(?:sks|sks\.js|bin\/sks\.js|node)\b/i.test(command)) return true;
  if (!payloadMentionsAnswersJson(payload)) return false;
  if (!command) return true;
  if (/\bpipeline\s+answer\b/i.test(command)) return true;
  return !/\b(npm|git|selftest|packcheck|release:check|publish:dry|publish:ignore-scripts|publish:npm|doctor|naruto|qa-loop|wiki|db|test)\b/i.test(command);
}

function payloadMentionsAnswersJson(payload: any = {}) {
  try {
    return /\banswers\.json\b/i.test(JSON.stringify(payload || {}));
  } catch {
    return false;
  }
}

function clarificationPauseBlockReason(state: any = {}) {
  const id = state?.mission_id || 'latest';
  const route = state.route_command || state.route || state.mode || 'route';
  return `SKS ${route} ambiguity gate is paused and waiting for explicit user answers. Do not run implementation, tests, route materialization, or unrelated tools yet. The only allowed action is sealing the user's reply with "sks pipeline answer ${id} --stdin"; elapsed time or repeated hook resumes never count as answers.`;
}

async function hookStop(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  const last = extractLastMessage(payload);
  if (!noQuestion) {
    const lightTurn = await consumeLightTurnStopBypass(root, { sessionKey, turnId: hookTurnId(payload) });
    if (lightTurn.accepted) return { continue: true, action: 'light_turn', silent: true };
  }
  if (state?.mode === 'LOOP' || state?.route === 'Loop' || state?.route_command === '$Loop') {
    const missionId = state?.mission_id;
    if (missionId) {
      const continuation = await evaluateLoopContinuation({ root, missionId }).catch(() => null);
      if (continuation?.should_continue) {
        return {
          decision: 'block',
          reason: `SKS Loop continuation required. Resume with: ${continuation.resume_instruction}`
        };
      }
    }
  }
  if (await consumeCodexGitActionStopBypass(root, payload)) {
    return {
      continue: true,
      systemMessage: 'SKS: Codex App git action accepted without route finalization gates.'
    };
  }
  if (looksLikeCodexGitActionStopCompletion(last, payload)) {
    return {
      continue: true,
      systemMessage: 'SKS: Codex App git action completion accepted without route finalization gates.'
    };
  }
  if (!noQuestion && (hasDfixLightCompletion(last) || await consumeLightRouteStop(root, payload))) {
    return {
      continue: true,
      systemMessage: 'SKS: DFix ultralight finalization accepted; full-route Honest Mode loopback is not required.'
    };
  }
  if (state?.subagents_required === true) {
    await refreshOfficialSubagentCompletionArtifacts(root, state, last, sessionKey).catch(() => null);
  }
  const routeDecision = await evaluateStop(root, state, payload, { noQuestion });
  if (routeDecision) return routeDecision;
  if (!noQuestion) {
    const languageBasis = state?.prompt || state?.task || extractUserPrompt(payload) || last;
    if (!hasHonestMode(last)) {
      const reason = localizedFinalizationReason('honest_mode_missing', languageBasis);
      const repeatDecision = await finalizationRepeatDecision(root, state, payload, reason, 'honest_mode_missing');
      return repeatDecision || {
        decision: 'block',
        reason
      };
    }
    if (!hasCompletionSummary(last)) {
      const reason = localizedFinalizationReason('completion_summary_missing', languageBasis);
      const repeatDecision = await finalizationRepeatDecision(root, state, payload, reason, 'completion_summary_missing');
      return repeatDecision || {
        decision: 'block',
        reason
      };
    }
    if (shouldLoopBackAfterHonestMode(state) && hasHonestModeUnresolvedGap(last)) {
      const loopback = await recordHonestModeLoopback(root, state, last, sessionKey);
      return {
        decision: 'block',
        reason: `${localizedFinalizationReason('honest_loopback', languageBasis)} Loopback: ${loopback.relative_file}`
      };
    }
    if (state?.honest_loop_required) await resolveHonestModeLoopback(root, state, sessionKey);
    return { continue: true };
  }
  return {
    decision: 'block',
    reason: 'SKS no-question run is not done. Continue autonomously, fix failing checks, update the active gate file, and do not ask the user.'
  };
}

async function consumeLightRouteStop(root: any, payload: any = {}) {
  const file = path.join(root, '.sneakoscope', 'state', LIGHT_ROUTE_STOP_ARTIFACT);
  const record = await readJson(file, null).catch(() => null);
  if (!record?.pending_stop_bypass) return false;
  if (record.route !== 'DFix') return false;
  const nowMs = Date.now();
  const expiresMs = Date.parse(record.expires_at || '');
  if (!Number.isFinite(expiresMs) || expiresMs < nowMs) return false;
  const currentConversation = conversationId(payload);
  if (record.conversation_id && record.conversation_id !== currentConversation) return false;
  await writeJsonAtomic(file, {
    ...record,
    pending_stop_bypass: false,
    consumed_at: nowIso()
  }).catch(() => null);
  return true;
}

function hasDfixLightCompletion(text: any) {
  const s = String(text || '');
  const marker = /^\s*(?:\*\*)?\s*(?:\$?DFix|dfix)\s*(?:완료\s*요약|completion\s+summary)\s*[:：]/im.test(s);
  if (!marker) return false;
  const honest = /^\s*(?:\*\*)?\s*(?:\$?DFix|dfix)\s*(?:솔직모드|honest(?:\s+mode)?)\s*[:：]/im.test(s);
  if (!honest) return false;
  const verification = /(검증|확인|통과|verified|verification|checked|evidence|근거)/i.test(s);
  const gap = /(미검증|남은|문제|gap|remaining|not verified|not run|blocker|차단|불가|없음|none)/i.test(s);
  return verification && gap;
}

async function armCodexGitActionStopBypass(root: any, payload: any = {}) {
  const nowMs = Date.now();
  const record = {
    schema_version: 1,
    route: 'codex_git_action',
    pending_stop_bypass: true,
    conversation_id: conversationId(payload),
    created_at: nowIso(),
    expires_at: new Date(nowMs + CODEX_GIT_ACTION_STOP_TTL_MS).toISOString()
  };
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'state', CODEX_GIT_ACTION_STOP_ARTIFACT), record);
  return record;
}

async function consumeCodexGitActionStopBypass(root: any, payload: any = {}) {
  const file = path.join(root, '.sneakoscope', 'state', CODEX_GIT_ACTION_STOP_ARTIFACT);
  const record = await readJson(file, null).catch(() => null);
  if (!record?.pending_stop_bypass) return false;
  if (!['codex_git_action', 'codex_git_commit'].includes(record.route)) return false;
  const expiresMs = Date.parse(record.expires_at || '');
  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) return false;
  const currentConversation = conversationId(payload);
  if (record.conversation_id && record.conversation_id !== currentConversation) return false;
  await writeJsonAtomic(file, {
    ...record,
    pending_stop_bypass: false,
    consumed_at: nowIso()
  }).catch(() => null);
  return true;
}

function hasHonestMode(text: any) {
  const s = String(text || '');
  return /(SKS Honest Mode|솔직모드|Honest Mode)/i.test(s)
    && /(verified|verification|검증|tests?|테스트|evidence|근거|gap|제약|uncertainty|불확실)/i.test(s);
}

function hasCompletionSummary(text: any) {
  const s = String(text || '');
  const summary = /(completion summary|change summary|what changed|what was done|done summary|작업\s*요약|완료\s*요약|변경\s*요약|무엇을\s*(?:했|했고|변경)|뭐가\s*어떻게|정리)/i.test(s);
  const verification = /(verified|verification|검증|tests?|테스트|evidence|근거|확인|통과)/i.test(s);
  const gap = /(gap|gaps|remaining|제약|남은|미검증|not verified|not run|not claimed|불확실|없음|none)/i.test(s);
  return summary && verification && gap;
}

function hasHonestModeUnresolvedGap(text: any) {
  return honestModeGapLines(text).length > 0;
}

export function honestModeGapLines(text: any) {
  const issue = /(gap|remaining|unverified|not verified|not run|not complete|incomplete|failed|blocked|blocker|could not|couldn't|missing|미완료|미검증|미실행|실패|차단|누락|못했|못 했|안 했|안함|아직|남은)/i;
  return String(text || '')
    .split(/\n/)
    .map((line: any) => line.trim())
    .filter((line: any) => issue.test(line) && !honestGapLineResolved(line))
    .slice(0, 12);
}

function honestGapLineResolved(line: any) {
  if (/(?:unverified|미검증)\s*:\s*\[\s*\]/i.test(line) && /blockers?\s*:\s*\[\s*\]/i.test(line)) return true;
  if (/(?:^|[\s*-])(?:unverified|미검증|blockers?)\s*:\s*\[\s*\](?:\s*(?:[,.;]|$).*)?$/i.test(line)) return true;
  if (/(?:미해결|남은)\s*(?:gap|갭|문제|항목)\s*:\s*(?:없음|없습니다|없다|0|0개)(?:\s|,|\.|$)/i.test(line)) return true;
  if (/unresolved\s+gaps?\s+(?:for|in)[^:]*:\s*(?:none|no|0)\b/i.test(line)) return true;
  if (/no\s+unresolved\s+gaps?\s+remain/i.test(line)) return true;
  if (/(남은\s*(?:gap|갭|문제)\s*:\s*없음|남은\s*(?:gap|갭|문제)\s*없음|remaining\s+gaps?\s*:\s*(none|no|0)|no\s+remaining\s+gaps?)/i.test(line)) return true;
  if (/no\s+active\s+blocking\s+route\s+gate\s+detected/i.test(line)) return true;
  if (/(non[-\s]?blocker|non[-\s]?blocking|not\s+(?:a\s+)?blocker|no\s+blocker|does\s+not\s+block|not\s+blocking|blocker\s*(?:는|가)?\s*(?:아님|아닙니다|없음)|차단(?:하지|하진|하지는)\s*않|막(?:지|지는)\s*않)/i.test(line)) return true;
  if (/(요약\s*(?:없으면|없는\s*경우).*(?:차단|block).*(?:요약\s*(?:있으면|있는\s*경우)|통과|pass)|(?:missing|without)\s+summary.*(?:block|blocked).*(?:with\s+summary|pass|accepted))/i.test(line)) return true;
  if (/(차단(?:되는지)?\s*검증|차단\s*(?:확인|검증)|blocked\s+(?:as\s+expected|verified))/i.test(line) && !/(미확인|미검증|못|안\s*됨|실패|failed|not\s+verified|not\s+blocked)/i.test(line)) return true;
  if (/(CHANGELOG|README|\.md|missing|누락|미완료|미검증|미실행|안 했|못했|못 했)/i.test(line)) return false;
  return /(없음|없습니다|없다|해당 없음|none|no unresolved|no remaining|no gaps|zero|0개|n\/a|not applicable)\.?\s*$/i.test(line);
}

function shouldLoopBackAfterHonestMode(state: any = {}) {
  if (!state?.mission_id) return false;
  if (state.implementation_allowed === false) return false;
  const route = String(state.route || state.mode || '').toLowerCase();
  if (['answer', 'dfix', 'wiki'].includes(route)) return false;
  return Boolean(state.ambiguity_gate_passed || state.clarification_passed || /CONTRACT_SEALED|HONEST_LOOPBACK/i.test(String(state.phase || '')));
}

async function recordHonestModeLoopback(root: any, state: any = {}, lastMessage: any = '', sessionKey: any = null) {
  const id = state.mission_id;
  const dir = missionDir(root, id);
  const previousPhase = state.phase || null;
  const mode = String(state.mode || state.route || 'SKS').toUpperCase();
  const phase = `${mode}_HONEST_LOOPBACK_AFTER_CLARIFICATION`;
  const artifact = {
    schema_version: 1,
    mission_id: id,
    previous_phase: previousPhase,
    phase,
    created_at: nowIso(),
    reason: 'honest_mode_unresolved_gap',
    issue_lines: honestModeGapLines(lastMessage),
    next_action: 'continue_from_sealed_contract_without_reasking'
  };
  const file = path.join(dir, 'honest-loopback.json');
  await writeJsonAtomic(file, artifact);
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'pipeline.honest_mode.loopback', previous_phase: previousPhase, phase, issues: artifact.issue_lines });
  await setCurrent(root, {
    phase,
    honest_loop_required: true,
    honest_loop_detected_at: artifact.created_at,
    implementation_allowed: true,
    clarification_required: false,
    questions_allowed: false,
    ambiguity_gate_required: true,
    ambiguity_gate_passed: true
  }, { sessionKey: sessionKey || state._session_key });
  return { file, relative_file: path.relative(root, file).split(path.sep).join('/') };
}

async function resolveHonestModeLoopback(root: any, state: any = {}, sessionKey: any = null) {
  const id = state.mission_id;
  const mode = String(state.mode || state.route || 'SKS').toUpperCase();
  if (id) await appendJsonl(path.join(missionDir(root, id), 'events.jsonl'), { ts: nowIso(), type: 'pipeline.honest_mode.loopback_resolved', previous_phase: state.phase || null });
  await setCurrent(root, {
    phase: `${mode}_HONEST_COMPLETE`,
    honest_loop_required: false,
    honest_loop_resolved_at: nowIso(),
    questions_allowed: true
  }, { sessionKey: sessionKey || state._session_key });
}

export async function emitHook(name: any) {
  const result = await hookMain(name);
  process.stdout.write(`${JSON.stringify(normalizeHookResult(name, result))}\n`);
}

export async function selftestCodexCommitHooks() {
  const root = tmpdir();
  const hookBin = path.join(packageRoot(), 'dist', 'bin', 'sks.js');
  const env = { SKS_DISABLE_UPDATE_CHECK: '1' };
  const setup = await runProcess(process.execPath, [hookBin, 'setup', '--install-scope', 'project'], { cwd: root, env, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (setup.code !== 0) throw new Error(`selftest failed: commit setup ${setup.code}: ${setup.stderr}`);
  const runHook = (name: any, payload: any) => runProcess(process.execPath, [hookBin, 'hook', name], { cwd: root, input: JSON.stringify({ cwd: root, ...payload }), env, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  const id = 'commit-selftest';
  const hook = await runHook('user-prompt-submit', { conversation_id: id, action: 'codex_git_commit', prompt: 'Generate a git commit message for the staged diff.' });
  if (hook.code !== 0) throw new Error(`selftest failed: commit hook ${hook.code}: ${hook.stderr}`);
  const hookJson = JSON.parse(hook.stdout);
  if (hookJson.decision === 'block' || hookJson.hookSpecificOutput?.additionalContext || !String(hookJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: commit route bypass');
  const stop = await runHook('stop', { conversation_id: id, last_assistant_message: 'Fix Codex App commit message hook bypass' });
  if (stop.code !== 0) throw new Error(`selftest failed: commit stop ${stop.code}: ${stop.stderr}`);
  const stopJson = JSON.parse(stop.stdout);
  if (stopJson.decision === 'block' || !String(stopJson.systemMessage || '').includes('accepted without route finalization')) throw new Error('selftest failed: commit stop bypass');
  const commitPushId = 'commit-push-selftest';
  const appCommitPushHook = await runHook('user-prompt-submit', { conversation_id: commitPushId, action: 'Codex App Git Actions Commit and Push', prompt: 'Commit and push changes.' });
  if (appCommitPushHook.code !== 0) throw new Error(`selftest failed: app commit-push hook ${appCommitPushHook.code}: ${appCommitPushHook.stderr}`);
  const appCommitPushJson = JSON.parse(appCommitPushHook.stdout);
  if (appCommitPushJson.decision === 'block' || appCommitPushJson.hookSpecificOutput?.additionalContext || !String(appCommitPushJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: app commit-push route bypass');
  const appCommitPushStop = await runHook('stop', { conversation_id: commitPushId, last_assistant_message: 'Commit and push complete.' });
  if (appCommitPushStop.code !== 0) throw new Error(`selftest failed: app commit-push stop ${appCommitPushStop.code}: ${appCommitPushStop.stderr}`);
  if (JSON.parse(appCommitPushStop.stdout).decision === 'block') throw new Error('selftest failed: app commit-push stop bypass');
  const appPushId = 'app-push-selftest';
  const appPushHook = await runHook('user-prompt-submit', { conversation_id: appPushId, metadata: { source: 'codex_app', action: 'Git Actions Push' }, prompt: 'Push changes.' });
  if (appPushHook.code !== 0) throw new Error(`selftest failed: app push hook ${appPushHook.code}: ${appPushHook.stderr}`);
  const appPushJson = JSON.parse(appPushHook.stdout);
  if (appPushJson.decision === 'block' || appPushJson.hookSpecificOutput?.additionalContext || !String(appPushJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: app push metadata route bypass');
  const appPushStop = await runHook('stop', { conversation_id: appPushId, metadata: { source: 'codex_app', action: 'Git Actions Push' }, last_assistant_message: 'Done.' });
  if (appPushStop.code !== 0) throw new Error(`selftest failed: app push stop ${appPushStop.code}: ${appPushStop.stderr}`);
  if (JSON.parse(appPushStop.stdout).decision === 'block') throw new Error('selftest failed: app push metadata stop bypass');
  const metadataLightId = 'metadata-light-commit-push-selftest';
  const metadataLightHook = await runHook('user-prompt-submit', { conversation_id: metadataLightId, prompt: 'Commit and push changes.' });
  if (metadataLightHook.code !== 0) throw new Error(`selftest failed: metadata-light commit-push hook ${metadataLightHook.code}: ${metadataLightHook.stderr}`);
  const metadataLightJson = JSON.parse(metadataLightHook.stdout);
  if (metadataLightJson.decision === 'block' || metadataLightJson.hookSpecificOutput?.additionalContext || !String(metadataLightJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: metadata-light app commit-push route bypass');
  const metadataLightStop = await runHook('stop', { conversation_id: metadataLightId, last_assistant_message: 'Commit and push complete.' });
  if (metadataLightStop.code !== 0) throw new Error(`selftest failed: metadata-light commit-push stop ${metadataLightStop.code}: ${metadataLightStop.stderr}`);
  if (JSON.parse(metadataLightStop.stdout).decision === 'block') throw new Error('selftest failed: metadata-light commit-push stop bypass');
  const settingsHook = await runHook('user-prompt-submit', { model: 'future-codex-catalog-model', metadata: { source: 'codex_app_settings', feature: 'speed profile' } });
  if (settingsHook.code !== 0) throw new Error(`selftest failed: settings hook ${settingsHook.code}: ${settingsHook.stderr}`);
  const settingsJson = JSON.parse(settingsHook.stdout);
  if (settingsJson.decision === 'block' || settingsJson.hookSpecificOutput?.additionalContext || !String(settingsJson.systemMessage || '').includes('settings/profile event ignored')) throw new Error('selftest failed: settings/profile event should not route or block');
  const userHook = await runHook('user-prompt-submit', { prompt: '[커밋 메시지를 생성하지 못했습니다.] 코덱스 앱에서 이 버그 수정해줘' });
  if (userHook.code !== 0) throw new Error(`selftest failed: user commit hook ${userHook.code}: ${userHook.stderr}`);
  if (!JSON.parse(userHook.stdout).hookSpecificOutput?.additionalContext?.includes('$Naruto route prepared')) throw new Error('selftest failed: user prompt route');
  const userCommitPushHook = await runHook('user-prompt-submit', { prompt: '배포하게 커밋하고 푸쉬해줘' });
  if (userCommitPushHook.code !== 0) throw new Error(`selftest failed: user commit-push hook ${userCommitPushHook.code}: ${userCommitPushHook.stderr}`);
  const userCommitPushJson = JSON.parse(userCommitPushHook.stdout);
  if (userCommitPushJson.decision === 'block' || userCommitPushJson.hookSpecificOutput?.additionalContext || !String(userCommitPushJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: user commit-push prompt should bypass route');
  const userCommitPushStop = await runHook('stop', { last_assistant_message: 'Commit and push complete.' });
  if (userCommitPushStop.code !== 0) throw new Error(`selftest failed: user commit-push stop ${userCommitPushStop.code}: ${userCommitPushStop.stderr}`);
  if (JSON.parse(userCommitPushStop.stdout).decision === 'block') throw new Error('selftest failed: user commit-push stop bypass');
}
