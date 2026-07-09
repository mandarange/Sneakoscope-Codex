import path from 'node:path';
import { projectRoot, readJson, readText, writeJsonAtomic, appendJsonl, nowIso, runProcess, sha256, packageRoot, tmpdir, type JsonData } from './fsx.js';
import { looksInteractiveCommand, interactiveCommandReason } from './no-question-guard.js';
import { loadStateForSession, missionDir, setCurrent } from './mission.js';
import { checkDbOperation, dbBlockReason, handleMadSksUserConfirmation } from './db-safety.js';
import { maybeRecordMadDbToolResultFromToolUse } from './mad-db/mad-db-result-lifecycle.js';
import { checkHarnessModification, harnessGuardBlockReason, isHarnessSourceProject } from './harness-guard.js';
import { isMadSksRouteState } from './permission-gates.js';
import { classifyMadSksShellCommand } from './mad-sks/write-guard.js';
import { activeRouteContext, evaluateStop, prepareRoute, promptPipelineContext as routePipelineContext, recordContext7Evidence, recordSubagentEvidence, routePrompt } from './pipeline.js';
import { localizedFinalizationReason } from './language-preference.js';
import { classifyToolError } from './evaluation.js';
import { REQUIRED_CODEX_MODEL, isForbiddenCodexModel } from './codex-model-guard.js';
import { dollarCommand, routeRequiresSubagents, stripVisibleDecisionAnswerBlocks } from './routes.js';
import { leanEngineeringCompactText } from './lean-engineering-policy.js';
import { appendMissionStatus } from './recallpulse.js';
import { scanAgentTextForRecursion } from './agents/agent-recursion-guard.js';
import { evaluateLoopContinuation } from './loops/loop-continuation-enforcer.js';
import { diagnosticPromptAllowedDuringNoQuestions } from './routes/diagnostic-allowlist.js';
import { maybeReconcileProjectSkillsPreflight } from './hooks-runtime/skill-reconcile-preflight.js';
import { codePackFreshnessNote } from './hooks-runtime/code-pack-freshness-preflight.js';
import { joinSystemMessages, teamLiveDigest } from './hooks-runtime/team-digest.js';
const STOP_REPEAT_GUARD_ARTIFACT = 'stop-hook-repeat-guard.json';
const LIGHT_ROUTE_STOP_ARTIFACT = 'light-route-stop.json';
const CODEX_GIT_ACTION_STOP_ARTIFACT = 'codex-git-action-stop-bypass.json';
const STOP_REPEAT_GUARD_WINDOW_MS = 10 * 60 * 1000;
const STOP_REPEAT_GUARD_MAX_ENTRIES = 25;
const DEFAULT_STOP_REPEAT_GUARD_LIMIT = 2;
const CODEX_GIT_ACTION_STOP_TTL_MS = 15 * 60 * 1000;
const UPDATE_CHECK_HOOK_INVOCATION_POLICY = 'function-only:no-runSksUpdateCheck-call-in-hooks';
// Update checks stay function-only in hooks: the policy marker above is checked
// by release readiness so ordinary Codex hook flow cannot grow a hidden update
// prompt path.
import { loadHookPayload, normalizeHookResult, visibleHookMessage } from './hooks-runtime/hook-io.js';
export { loadHookPayload, normalizeHookResult };

async function loadState(root: any, payload: any = {}) {
  return loadStateForSession(root, conversationId(payload));
}

function isNoQuestionRunning(state: any) {
  return (state.mode === 'RESEARCH' && state.phase === 'RESEARCH_RUNNING_NO_QUESTIONS')
    || (state.mode === 'QALOOP' && state.phase === 'QALOOP_RUNNING_NO_QUESTIONS');
}

function extractLastMessage(payload: any) {
  return payload.last_assistant_message || payload.assistant_message || payload.message || payload.response || payload.raw || '';
}

function extractUserPrompt(payload: any) {
  return payload.prompt
    || payload.user_prompt
    || payload.userPrompt
    || payload.message
    || payload.input?.prompt
    || payload.input?.message
    || payload.raw
    || '';
}

function conversationId(payload: any) {
  return String(payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || payload.cwd || 'default');
}

function explicitConversationId(payload: any = {}) {
  return payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || null;
}

function extractCommand(payload: any) {
  return payload.command || payload.tool_input?.command || payload.toolInput?.command || payload.input?.command || payload.tool?.input?.command || '';
}

function codexGitActionMetadataText(payload: any = {}) {
  const seen = new Set();
  const out: any[] = [];
  const interesting = new Set([
    'action',
    'intent',
    'operation',
    'permission',
    'description',
    'kind',
    'type',
    'feature',
    'tool_name',
    'toolName',
    'name',
    'label',
    'title',
    'source',
    'event',
    'hook',
    'hook_name',
    'hookName',
    'hook_event_name',
    'hookEventName',
    'id',
    'command'
  ]);
  const noisy = new Set([
    'prompt',
    'user_prompt',
    'userPrompt',
    'message',
    'assistant_message',
    'last_assistant_message',
    'response',
    'raw',
    'stdout',
    'stderr'
  ]);
  function walk(value: any, depth: any = 0, parentKey: any = '') {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
    seen.add(value);
    for (const [key, candidate] of Object.entries(value)) {
      if (noisy.has(key)) continue;
      if (typeof candidate === 'string') {
        if (interesting.has(key) || /\b(?:codex[_\s-]*app|git[_\s-]*actions?|codex_git_|gitCommit|gitPush|pull\s+request)\b/i.test(candidate)) {
          out.push(`${key}:${candidate}`);
        }
        continue;
      }
      if (candidate && typeof candidate === 'object') {
        const allowedContainer = interesting.has(key)
          || /^(?:input|metadata|context|client|thread|session|request|payload|tool|tool_input|toolInput|permission_request|permissionRequest)$/i.test(key)
          || parentKey;
        if (allowedContainer) walk(candidate, depth + 1, key);
      }
    }
  }
  walk(payload);
  return out.join(' ');
}

function codexGitActionMetadataSignal(text: any = '') {
  const s = String(text || '');
  if (!s) return false;
  const action = String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  if (/\bcodex\s*app\b[\s\S]{0,120}\bgit\b[\s\S]{0,120}\b(?:action|actions|commit|push|pr|pull request)\b/i.test(action)) return true;
  if (/\bgit\s*actions?\b[\s\S]{0,120}\b(?:commit|push|pr|pull request|commit\s*(?:and|&)\s*push)\b/i.test(action)) return true;
  if (/\bcodex\s*git\s*(?:commit|push|pr|pull request|commit\s*(?:and|&)\s*push)\b/i.test(action)) return true;
  if (/\b(?:git\s*)?(?:commit|push|commit\s*(?:and|&)\s*push|create\s+(?:a\s+)?pull\s+request|pull\s+request|pr)\b/i.test(action)) {
    return /\b(?:action|intent|operation|permission|feature|tool\s*name|source|event|hook|name|label|title|type|kind|id)\s*:/i.test(action);
  }
  return false;
}

function toolFailed(payload: any = {}) {
  const candidates = [
    payload.exit_code,
    payload.exitCode,
    payload.tool_response?.exit_code,
    payload.toolResponse?.exitCode,
    payload.result?.exit_code,
    payload.result?.exitCode
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n)) return n !== 0;
  }
  if (payload.isError === true || payload.tool_response?.isError === true || payload.toolResponse?.isError === true || payload.result?.isError === true) return true;
  if (payload.success === false || payload.tool_response?.success === false || payload.toolResponse?.success === false || payload.result?.success === false) return true;
  if (payload.executed === false) return true;
  return false;
}

export async function hookMain(name: any): Promise<JsonData> {
  const payload = await loadHookPayload();
  return evaluateHookPayload(name, payload);
}

export async function evaluateHookPayload(name: any, payload: any = {}, opts: any = {}): Promise<JsonData> {
  const root = opts.root || await projectRoot(payload.cwd || process.cwd());
  const sessionKey = conversationId(payload);
  if (!explicitConversationId(payload)) {
    await appendJsonl(path.join(root, '.sneakoscope', 'state', 'session-id-fallback-warning.jsonl'), {
      ts: nowIso(),
      warning: 'hook_payload_missing_explicit_session_id',
      conversation_id: sessionKey,
      cwd_hash: sha256(String(payload.cwd || root)).slice(0, 12),
      hook: name
    }).catch(() => null);
  }
  const loadedState = opts.state || payload.state || await loadState(root, payload);
  const state = { ...loadedState, _session_key: loadedState?._session_key || sessionKey };
  const noQuestion = isNoQuestionRunning(state);
  if (name === 'user-prompt-submit') {
    const modelBlock = blockForbiddenClientModel(payload);
    if (modelBlock) return modelBlock;
    return hookUserPrompt(root, state, payload, noQuestion, sessionKey);
  }
  if (name === 'pre-tool') return hookPreTool(root, state, payload, noQuestion, sessionKey);
  if (name === 'post-tool') return hookPostTool(root, state, payload, noQuestion, sessionKey);
  if (name === 'permission-request') return hookPermission(root, state, payload, noQuestion, sessionKey);
  if (name === 'stop') return hookStop(root, state, payload, noQuestion, sessionKey);
  if (name === 'subagent-start') return hookSubagentStart(root, state, sessionKey);
  return { continue: true };
}

async function hookSubagentStart(root: any, state: any, sessionKey: any = null) {
  void sessionKey;
  const active = await activeRouteContext(root, state).catch(() => '');
  const additionalContext = [leanEngineeringCompactText(), active].filter(Boolean).join('\n\n');
  return { continue: true, additionalContext };
}

function blockForbiddenClientModel(payload: any = {}) {
  const model = forbiddenClientModelFromPayload(payload);
  if (!model || !isForbiddenCodexModel(model)) return null;
  if (looksLikeCodexUiSettingsEvent(payload)) return null;
  return {
    decision: 'block',
    reason: `SKS requires ${REQUIRED_CODEX_MODEL}; client payload requested ${model}. Switch the Codex client/session model to ${REQUIRED_CODEX_MODEL} and retry.`
  };
}

function looksLikeCodexUiSettingsEvent(payload: any = {}) {
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  const haystack = [
    payload.action,
    payload.intent,
    payload.operation,
    payload.permission,
    payload.description,
    payload.kind,
    payload.type,
    payload.feature,
    payload.source,
    payload.event,
    payload.hook,
    payload.hook_name,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source,
    payload.context?.surface,
    payload.session?.surface
  ].filter(Boolean).join(' ');
  return !prompt && /\b(?:settings|preferences|profile|speed|fast[_\s-]*mode|reasoning|model[_\s-]*select|codex[_\s-]*app)\b/i.test(haystack);
}

function forbiddenClientModelFromPayload(payload: any = {}) {
  const candidates = [
    payload.model,
    payload.model_id,
    payload.modelId,
    payload.client_model,
    payload.clientModel,
    ...clientModelCandidates(payload.client),
    ...clientModelCandidates(payload.metadata),
    ...clientModelCandidates(payload.context),
    ...clientModelCandidates(payload.thread),
    ...clientModelCandidates(payload.session)
  ];
  return candidates.find((value: any) => typeof value === 'string' && isForbiddenCodexModel(value)) || '';
}

function clientModelCandidates(value: any, depth: any = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return [];
  const out: any[] = [];
  for (const key of ['model', 'model_id', 'modelId', 'client_model', 'clientModel']) {
    if (typeof value[key] === 'string') out.push(value[key]);
  }
  for (const key of ['client', 'metadata', 'context', 'thread', 'session']) {
    out.push(...clientModelCandidates(value[key], depth + 1));
  }
  return out;
}

async function hookUserPrompt(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
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
  await maybeReconcileProjectSkillsPreflight(root).catch(() => null);
  if (!noQuestion) {
    const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
    const madSksConfirmation = await handleMadSksUserConfirmation(root, state, prompt);
    if (madSksConfirmation?.handled) {
      const teamDigest = await teamLiveDigest(root, state);
      const additionalContext = [madSksConfirmation.additionalContext, teamDigest?.context].filter(Boolean).join('\n\n');
      return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
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
    const bypassActiveRoute = routeBypassesActiveContext(route);
    const goalOverlay = activeGoalOverlayContext(state, route);
    const prepareFreshRoute = shouldPrepareFreshRouteOnActivePrompt(prompt, route, {
      command,
      bypassActiveRoute,
      goalOverlay
    });
    if (isBlockingClarificationAwaiting(state) && !looksLikeClarificationCancel(prompt)) {
      const activeContext = await activeRouteContext(root, state);
      const teamDigest = await teamLiveDigest(root, state);
      const additionalContext = [updateContext, activeContext, teamDigest?.context].filter(Boolean).join('\n\n');
      return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
    }
    const teamDigest = (bypassActiveRoute || command || prepareFreshRoute) ? null : await teamLiveDigest(root, state);
    const shouldLoadActiveContext = !command && !bypassActiveRoute && !goalOverlay && !prepareFreshRoute;
    const activeContext = shouldLoadActiveContext ? await activeRouteContext(root, state) : '';
    const contexts = [updateContext];
    if (activeContext && shouldLoadActiveContext) contexts.push(routePipelineContext(prompt), activeContext);
    else contexts.push((await prepareRoute(root, prompt, state, { sessionKey })).additionalContext);
    if (goalOverlay) contexts.push(goalOverlay);
    if (teamDigest?.context) contexts.push(teamDigest.context);
    const codePackNote = await codePackFreshnessNote(root);
    if (codePackNote) contexts.push(codePackNote);
    const additionalContext = contexts.filter(Boolean).join('\n\n');
    return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
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

function looksLikeActiveContinuationPrompt(prompt: any = '') {
  const text = stripVisibleDecisionAnswerBlocks(String(prompt || '')).trim();
  if (!text) return false;
  return /^(?:keep\s+going|continue|resume|go\s+on|proceed|carry\s+on|계속|이어\s*서|이어서|진행|계속\s*해|마저\s*해|다음|next)$/i.test(text);
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
    `Active Goal overlay: existing Goal mission ${state.mission_id} remains available for lightweight continuation context only.`,
    `Do not let that active Goal hijack this new ${route.command || '$SKS'} prompt. The newly prepared route mission and gate are authoritative for this turn.`,
    `Goal artifact: .sneakoscope/missions/${state.mission_id}/goal-workflow.json. Use Codex native /goal controls only if the user explicitly returns to $Goal.`
  ].join('\n');
}

async function hookPreTool(root: any, state: any, payload: any, noQuestion: any, sessionKey: any = null) {
  void sessionKey;
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
  return { continue: true };
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
    recordMadDbPostToolLifecycle(root, state, payload).catch(() => null),
    recordContext7Evidence(root, state, payload).catch(() => null),
    recordSubagentEvidence(root, state, payload).catch(() => null),
    toolFailed(payload) ? recordToolErrorTaxonomy(root, state, payload).catch(() => null) : Promise.resolve(null)
  ]);
  const teamDigest = await teamLiveDigest(root, state);
  if (!noQuestion) {
    return teamDigest?.context
      ? { continue: true, additionalContext: teamDigest.context, systemMessage: joinSystemMessages(visibleHookMessage('post-tool'), teamDigest.system) }
      : { continue: true };
  }
  if (toolFailed(payload)) {
    return {
      additionalContext: [
        'SKS no-question mode is active. Do not ask the user about this tool failure. Apply the active decision ladder, create a fix task only inside the sealed contract, and continue. Do not create unrequested fallback implementation code; block with evidence if the requested path is impossible.',
        teamDigest?.context
      ].filter(Boolean).join('\n\n'),
      systemMessage: joinSystemMessages(visibleHookMessage('post-tool'), teamDigest?.system)
    };
  }
  return teamDigest?.context
    ? { continue: true, additionalContext: teamDigest.context, systemMessage: joinSystemMessages(visibleHookMessage('post-tool'), teamDigest.system) }
    : { continue: true };
}

function needsMutationSafetyCheck(payload: any = {}) {
  const toolName = String(payload.tool_name || payload.toolName || payload.name || payload.tool?.name || '');
  const knownReadOnly = /^(Read|Grep|Glob|LS|TodoRead|WebFetch|WebSearch|BashOutput|NotebookRead|ListMcpResources|ReadMcpResource)$/i;
  if (knownReadOnly.test(toolName)) return /\b(sql|supabase|db|migration)\b/i.test(JSON.stringify(payload || {}));
  if (/^(Edit|Write|MultiEdit|NotebookEdit|Bash|Shell|ApplyPatch)$/i.test(toolName)) return true;
  if (/\b(sql|supabase|db|migration)\b/i.test(toolName)) return true;
  return true;
}

async function recordMadDbPostToolLifecycle(root: any, state: any = {}, payload: any = {}) {
  if (!state?.mission_id) return null;
  return maybeRecordMadDbToolResultFromToolUse({
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
  return !/\b(npm|git|selftest|packcheck|release:check|publish:dry|publish:ignore-scripts|publish:npm|doctor|team|qa-loop|wiki|db|test)\b/i.test(command);
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

function looksLikeCodexGitAction(payload: any = {}) {
  const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
  const metadataText = codexGitActionMetadataText(payload);
  const haystack = [
    metadataText,
    payload.action,
    payload.intent,
    payload.operation,
    payload.permission,
    payload.description,
    payload.kind,
    payload.type,
    payload.feature,
    payload.tool_name,
    payload.toolName,
    payload.source,
    payload.event,
    payload.hook,
    payload.hook_name,
    payload.input?.action,
    payload.input?.intent,
    payload.input?.operation,
    payload.input?.feature,
    payload.input?.source,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source
  ].filter(Boolean).join(' ');
  const codexAppGitSignal = /\bcodex[_\s-]*app\b[\s\S]{0,80}\bgit\b[\s\S]{0,80}\b(?:action|actions|commit|push|pr)\b/i.test(haystack);
  const gitActionSignal = /\bgit[_\s-]*actions?\b[\s\S]{0,80}\b(?:commit|push|commit[\s_-]*(?:and|&)?[\s_-]*push)\b/i.test(haystack);
  const appSignal = codexGitActionMetadataSignal(metadataText)
    || codexAppGitSignal
    || gitActionSignal
    || /\b(?:codex[_\s-]*(?:app[_\s-]*)?)?(?:git[_\s-]*)?(?:commit[_\s-]*message|git[_\s-]*commit|git[_\s-]*push|git[_\s-]*pr|codex_git_commit|codex_git_push|codex_git_pr)\b/i.test(haystack)
    || /커밋\s*메시지\s*생성/i.test(haystack);
  const promptSignal = /\bgenerate(?:\s+a)?(?:\s+git)?\s+commit\s+message\b/i.test(prompt)
    || /\bcommit\s+message\b[\s\S]{0,80}\b(?:staged|diff|changes?|git)\b/i.test(prompt)
    || looksLikeStockCodexGitActionPrompt(prompt)
    || /커밋\s*메시지\s*생성/i.test(prompt);
  if (!appSignal && !promptSignal) return false;
  if (looksLikeStockCodexGitActionPrompt(prompt)) return true;
  if (appSignal) return true;
  return !looksLikeUserImplementationRequest(prompt);
}

function looksLikeStockCodexGitActionPrompt(prompt: any = '') {
  const text = String(prompt || '').trim();
  if (!text || text.length > 120) return false;
  return /^(?:generate\s+(?:a\s+)?git\s+commit\s+message(?:\s+for\s+(?:the\s+)?(?:staged\s+)?diff)?|commit\s+changes|commit\s+and\s+push\s+changes|push\s+changes|create\s+(?:a\s+)?commit|create\s+(?:a\s+)?pull\s+request)\.?$/i.test(text);
}

function looksLikeCodexGitActionStopCompletion(last: any = '', payload: any = {}) {
  const text = String(last || '').trim();
  const metadataText = codexGitActionMetadataText(payload);
  const haystack = [
    metadataText,
    payload.action,
    payload.intent,
    payload.operation,
    payload.kind,
    payload.type,
    payload.feature,
    payload.source,
    payload.event,
    payload.metadata?.action,
    payload.metadata?.intent,
    payload.metadata?.operation,
    payload.metadata?.feature,
    payload.metadata?.source
  ].filter(Boolean).join(' ');
  if (codexGitActionMetadataSignal(metadataText)) return true;
  if (/\bcodex[_\s-]*app\b[\s\S]{0,80}\bgit\b[\s\S]{0,80}\b(?:action|commit|push|pr)\b/i.test(haystack)) return true;
  if (!text || text.length > 180) return false;
  return /^(?:commit(?:ted)?(?:\s+and\s+pushed)?(?:\s+changes)?(?:\s+complete[.!]?)?|push(?:ed)?(?:\s+changes)?(?:\s+complete[.!]?)?|created\s+(?:a\s+)?pull\s+request[.!]?)$/i.test(text);
}

function looksLikeUserImplementationRequest(text: any = '') {
  return /(fix|bug|broken|error|issue|implement|change|update|repair|수정|버그|오류|에러|문제|고쳐|고치|해결|변경|수리|패치|안생기|안\s*생기)/i.test(String(text || ''));
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

async function finalizationRepeatDecision(root: any, state: any = {}, payload: any = {}, reason: any = '', kind: any = 'finalization') {
  const now = nowIso();
  const guardPath = path.join(root, '.sneakoscope', 'state', STOP_REPEAT_GUARD_ARTIFACT);
  const previous = await readJson(guardPath, {}).catch(() => ({}));
  const limit = stopRepeatGuardLimit();
  const entries: Record<string, any> = pruneStopRepeatEntries(previous.entries || {}, now);
  const key = stopRepeatKey(state, payload, reason, kind);
  const prior = entries[key] || {};
  const repeatCount = stopRepeatInWindow(prior, now)
    ? Number(prior.repeat_count || 0) + 1
    : 1;
  const record = {
    schema_version: 1,
    updated_at: now,
    window_ms: STOP_REPEAT_GUARD_WINDOW_MS,
    limit,
    entries: {
      ...entries,
      [key]: {
        kind,
        route: state.route_command || state.route || state.mode || null,
        mission_id: state.mission_id || null,
        conversation_id: conversationId(payload),
        first_seen: stopRepeatInWindow(prior, now) ? (prior.first_seen || now) : now,
        last_seen: now,
        repeat_count: repeatCount,
        tripped: repeatCount >= limit,
        reason
      }
    }
  };
  await writeJsonAtomic(guardPath, record).catch(() => null);
  if (state.mission_id) {
    await appendMissionStatus(root, state.mission_id, {
      category: repeatCount >= limit ? 'warning' : 'blocker',
      audience: ['user', 'route', 'final-summary'],
      stage_id: 'before_final',
      message: repeatCount >= limit
        ? `Repeated ${kind} stop prompt was suppressed; route completion is still unclaimed until evidence passes.`
        : reason,
      dedupe_key: key,
      evidence: [STOP_REPEAT_GUARD_ARTIFACT]
    }).catch(() => null);
  }
  if (repeatCount < limit) return null;
  return {
    continue: true,
    systemMessage: `SKS stop hook repeat guard suppressed repeated ${kind} prompt after ${repeatCount} identical block(s). No completion success is claimed by the hook.`
  };
}

function stopRepeatKey(state: any = {}, payload: any = {}, reason: any = '', kind: any = '') {
  return sha256(JSON.stringify({
    kind,
    reason,
    conversation_id: conversationId(payload),
    mission_id: state.mission_id || null,
    route: state.route_command || state.route || state.mode || null,
    gate: state.stop_gate || null
  })).slice(0, 24);
}

function stopRepeatGuardLimit() {
  const raw = Number.parseInt(process.env.SKS_STOP_REPEAT_GUARD_LIMIT || '', 10);
  if (!Number.isFinite(raw)) return DEFAULT_STOP_REPEAT_GUARD_LIMIT;
  return Math.max(1, Math.min(20, raw));
}

function stopRepeatInWindow(entry: any = {}, now: any = nowIso()) {
  const last = Date.parse(entry.last_seen || '');
  const current = Date.parse(now);
  if (!Number.isFinite(last) || !Number.isFinite(current)) return false;
  return current - last <= STOP_REPEAT_GUARD_WINDOW_MS;
}

function pruneStopRepeatEntries(entries: any = {}, now: any = nowIso()) {
  return Object.fromEntries(Object.entries(entries)
    .filter(([, entry]: any) => stopRepeatInWindow(entry, now))
    .sort((a: any, b: any) => Date.parse(b[1]?.last_seen || '') - Date.parse(a[1]?.last_seen || ''))
    .slice(0, STOP_REPEAT_GUARD_MAX_ENTRIES));
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
  const settingsHook = await runHook('user-prompt-submit', { model: 'gpt-5.0-forbidden', metadata: { source: 'codex_app_settings', feature: 'speed profile' } });
  if (settingsHook.code !== 0) throw new Error(`selftest failed: settings hook ${settingsHook.code}: ${settingsHook.stderr}`);
  const settingsJson = JSON.parse(settingsHook.stdout);
  if (settingsJson.decision === 'block' || settingsJson.hookSpecificOutput?.additionalContext || !String(settingsJson.systemMessage || '').includes('settings/profile event ignored')) throw new Error('selftest failed: settings/profile event should not route or block');
  const userHook = await runHook('user-prompt-submit', { prompt: '[커밋 메시지를 생성하지 못했습니다.] 코덱스 앱에서 이 버그 수정해줘' });
  if (userHook.code !== 0) throw new Error(`selftest failed: user commit hook ${userHook.code}: ${userHook.stderr}`);
  if (!JSON.parse(userHook.stdout).hookSpecificOutput?.additionalContext?.includes('$Team route prepared')) throw new Error('selftest failed: user prompt route');
  const userCommitPushHook = await runHook('user-prompt-submit', { prompt: '배포하게 커밋하고 푸쉬해줘' });
  if (userCommitPushHook.code !== 0) throw new Error(`selftest failed: user commit-push hook ${userCommitPushHook.code}: ${userCommitPushHook.stderr}`);
  const userCommitPushJson = JSON.parse(userCommitPushHook.stdout);
  if (userCommitPushJson.decision === 'block' || userCommitPushJson.hookSpecificOutput?.additionalContext || !String(userCommitPushJson.systemMessage || '').includes('git action')) throw new Error('selftest failed: user commit-push prompt should bypass route');
  const userCommitPushStop = await runHook('stop', { last_assistant_message: 'Commit and push complete.' });
  if (userCommitPushStop.code !== 0) throw new Error(`selftest failed: user commit-push stop ${userCommitPushStop.code}: ${userCommitPushStop.stderr}`);
  if (JSON.parse(userCommitPushStop.stdout).decision === 'block') throw new Error('selftest failed: user commit-push stop bypass');
}

