import path from 'node:path';
import { projectRoot, readJson, readText, writeJsonAtomic, appendJsonl, readStdin, nowIso, runProcess, which, PACKAGE_VERSION, sha256, packageRoot } from './fsx.mjs';
import { looksInteractiveCommand, interactiveCommandReason } from './no-question-guard.mjs';
import { missionDir, setCurrent, stateFile } from './mission.mjs';
import { checkDbOperation, dbBlockReason, handleMadSksUserConfirmation } from './db-safety.mjs';
import { checkHarnessModification, harnessGuardBlockReason } from './harness-guard.mjs';
import { activeRouteContext, evaluateStop, prepareRoute, promptPipelineContext as routePipelineContext, recordContext7Evidence, recordSubagentEvidence, routePrompt } from './pipeline.mjs';
import { classifyToolError } from './evaluation.mjs';
import { REQUIRED_CODEX_MODEL, isForbiddenCodexModel } from './codex-model-guard.mjs';
import { stripVisibleDecisionAnswerBlocks } from './routes.mjs';

const TEAM_DIGEST_MAX_EVENTS = 4;
const TEAM_DIGEST_MESSAGE_CHARS = 180;
const TEAM_DIGEST_CONTEXT_CHARS = 1600;
const TEAM_DIGEST_SYSTEM_CHARS = 260;
const STOP_REPEAT_GUARD_ARTIFACT = 'stop-hook-repeat-guard.json';
const LIGHT_ROUTE_STOP_ARTIFACT = 'light-route-stop.json';
const STOP_REPEAT_GUARD_WINDOW_MS = 10 * 60 * 1000;
const STOP_REPEAT_GUARD_MAX_ENTRIES = 25;
const DEFAULT_STOP_REPEAT_GUARD_LIMIT = 2;

async function loadHookPayload() {
  const raw = await readStdin();
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { raw }; }
}

async function loadState(root) {
  return readJson(stateFile(root), {});
}

function isNoQuestionRunning(state) {
  return (state.mode === 'RESEARCH' && state.phase === 'RESEARCH_RUNNING_NO_QUESTIONS')
    || (state.mode === 'QALOOP' && state.phase === 'QALOOP_RUNNING_NO_QUESTIONS');
}

function extractLastMessage(payload) {
  return payload.last_assistant_message || payload.assistant_message || payload.message || payload.response || payload.raw || '';
}

function extractUserPrompt(payload) {
  return payload.prompt
    || payload.user_prompt
    || payload.userPrompt
    || payload.message
    || payload.input?.prompt
    || payload.input?.message
    || payload.raw
    || '';
}

function conversationId(payload) {
  return String(payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || payload.cwd || 'default');
}

function extractCommand(payload) {
  return payload.command || payload.tool_input?.command || payload.toolInput?.command || payload.input?.command || payload.tool?.input?.command || '';
}

function toolFailed(payload = {}) {
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
  if (payload.success === false || payload.tool_response?.success === false || payload.toolResponse?.success === false || payload.result?.success === false) return true;
  if (payload.executed === false) return true;
  return false;
}

function dollarCommand(prompt) {
  const match = String(prompt || '').trim().match(/^\$([A-Za-z][A-Za-z0-9_-]*)(?:\s|:|$)/);
  return match ? match[1].toUpperCase() : null;
}

function looksLikeUpdateDecline(prompt) {
  return /^(no|nope|skip|later|not now|don't|dont|아니|아니요|안해|안 함|나중에|건너뛰|스킵)/i.test(String(prompt || '').trim());
}

function looksLikeUpdateAccept(prompt) {
  return /^(yes|y|ok|okay|update|upgrade|do it|go ahead|응|네|예|업데이트|해줘|진행)/i.test(String(prompt || '').trim());
}

export async function hookMain(name) {
  const payload = await loadHookPayload();
  const root = await projectRoot(payload.cwd || process.cwd());
  const state = await loadState(root);
  const noQuestion = isNoQuestionRunning(state);
  if (name === 'user-prompt-submit') {
    const modelBlock = blockForbiddenClientModel(payload);
    if (modelBlock) return modelBlock;
    return hookUserPrompt(root, state, payload, noQuestion);
  }
  if (name === 'pre-tool') return hookPreTool(root, state, payload, noQuestion);
  if (name === 'post-tool') return hookPostTool(root, state, payload, noQuestion);
  if (name === 'permission-request') return hookPermission(root, state, payload, noQuestion);
  if (name === 'stop') return hookStop(root, state, payload, noQuestion);
  return { continue: true };
}

function blockForbiddenClientModel(payload = {}) {
  const model = forbiddenClientModelFromPayload(payload);
  if (!model || !isForbiddenCodexModel(model)) return null;
  return {
    decision: 'block',
    reason: `SKS requires ${REQUIRED_CODEX_MODEL}; client payload requested ${model}. Switch the Codex client/session model to ${REQUIRED_CODEX_MODEL} and retry.`
  };
}

function forbiddenClientModelFromPayload(payload = {}) {
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
  return candidates.find((value) => typeof value === 'string' && isForbiddenCodexModel(value)) || '';
}

function clientModelCandidates(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return [];
  const out = [];
  for (const key of ['model', 'model_id', 'modelId', 'client_model', 'clientModel']) {
    if (typeof value[key] === 'string') out.push(value[key]);
  }
  for (const key of ['client', 'metadata', 'context', 'thread', 'session']) {
    out.push(...clientModelCandidates(value[key], depth + 1));
  }
  return out;
}

async function hookUserPrompt(root, state, payload, noQuestion) {
  if (!noQuestion) {
    const prompt = stripVisibleDecisionAnswerBlocks(extractUserPrompt(payload));
    const madSksConfirmation = await handleMadSksUserConfirmation(root, state, prompt);
    if (madSksConfirmation?.handled) {
      const teamDigest = await teamLiveDigest(root, state);
      const additionalContext = [madSksConfirmation.additionalContext, teamDigest?.context].filter(Boolean).join('\n\n');
      return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
    }
    const updateContext = await updateCheckContext(root, payload, prompt);
    const command = dollarCommand(prompt);
    const route = routePrompt(prompt);
    const bypassActiveRoute = route?.id === 'DFix' || route?.id === 'Answer';
    const goalOverlay = activeGoalOverlayContext(state, route);
    if (isBlockingClarificationAwaiting(state) && !looksLikeClarificationCancel(prompt)) {
      const activeContext = await activeRouteContext(root, state);
      const teamDigest = await teamLiveDigest(root, state);
      const additionalContext = [updateContext, activeContext, teamDigest?.context].filter(Boolean).join('\n\n');
      return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
    }
    const teamDigest = bypassActiveRoute ? null : await teamLiveDigest(root, state);
    const activeContext = await activeRouteContext(root, state);
    const contexts = [updateContext];
    if (activeContext && !command && !bypassActiveRoute && !goalOverlay) contexts.push(routePipelineContext(prompt), activeContext);
    else contexts.push((await prepareRoute(root, prompt, state)).additionalContext);
    if (goalOverlay) contexts.push(goalOverlay);
    if (teamDigest?.context) contexts.push(teamDigest.context);
    const additionalContext = contexts.filter(Boolean).join('\n\n');
    return { continue: true, additionalContext, systemMessage: joinSystemMessages(visibleHookMessage('user-prompt-submit', additionalContext), teamDigest?.system) };
  }
  const id = state.mission_id;
  if (id) await appendJsonl(path.join(missionDir(root, id), 'user_queue.jsonl'), { ts: nowIso(), payload });
  return {
    decision: 'block',
    reason: 'SKS no-question/no-interruption mode is active. User prompt has been queued until the run completes.'
  };
}

function isClarificationAwaiting(state = {}) {
  const phase = String(state.phase || '');
  const stopGate = String(state.stop_gate || '');
  const gateAwaiting = phase.includes('CLARIFICATION_AWAITING_ANSWERS') || stopGate === 'clarification-gate';
  if (!gateAwaiting) return false;
  if (!state?.mission_id) return false;
  if (state.ambiguity_gate_required !== true || state.ambiguity_gate_passed === true) return false;
  return Boolean(state.clarification_required || state.implementation_allowed === false);
}

function isBlockingClarificationAwaiting(state = {}) {
  return isClarificationAwaiting(state);
}

function looksLikeClarificationCancel(prompt = '') {
  return /^(cancel|reset|restart|new mission|새로|취소|중단|리셋|다시 시작)\b/i.test(String(prompt || '').trim());
}

function activeGoalOverlayContext(state = {}, route = null) {
  if (state.mode !== 'GOAL' || !state.mission_id) return '';
  if (!route || route.id === 'Goal' || route.id === 'DFix' || route.id === 'Answer') return '';
  return [
    `Active Goal overlay: existing Goal mission ${state.mission_id} remains available for lightweight continuation context only.`,
    `Do not let that active Goal hijack this new ${route.command || '$SKS'} prompt. The newly prepared route mission and gate are authoritative for this turn.`,
    `Goal artifact: .sneakoscope/missions/${state.mission_id}/goal-workflow.json. Use Codex native /goal controls only if the user explicitly returns to $Goal.`
  ].join('\n');
}

async function hookPreTool(root, state, payload, noQuestion) {
  const harnessDecision = await checkHarnessModification(root, payload, { phase: 'pre-tool' });
  if (harnessDecision.action === 'block') {
    return { decision: 'block', permissionDecision: 'deny', reason: harnessGuardBlockReason(harnessDecision) };
  }
  const dbDecision = await checkDbOperation(root, state, payload, { duringNoQuestion: noQuestion });
  if (dbDecision.action === 'block' || dbDecision.action === 'confirm') {
    return { decision: 'block', permissionDecision: 'deny', reason: dbBlockReason(dbDecision) };
  }
  if (clarificationGateLocked(state) && !clarificationAnswerToolAllowed(payload)) {
    return { decision: 'block', permissionDecision: 'deny', reason: clarificationPauseBlockReason(state) };
  }
  const command = extractCommand(payload);
  if (noQuestion && looksInteractiveCommand(command)) return { decision: 'block', reason: interactiveCommandReason(command) };
  return { continue: true };
}

async function hookPostTool(root, state, payload, noQuestion) {
  const dbDecision = await checkDbOperation(root, state, payload, { duringNoQuestion: noQuestion });
  if (dbDecision.action === 'block' || dbDecision.action === 'confirm') {
    return { decision: 'block', reason: dbBlockReason(dbDecision) };
  }
  await recordContext7Evidence(root, state, payload).catch(() => null);
  await recordSubagentEvidence(root, state, payload).catch(() => null);
  if (toolFailed(payload)) await recordToolErrorTaxonomy(root, state, payload).catch(() => null);
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

async function recordToolErrorTaxonomy(root, state = {}, payload = {}) {
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

async function hookPermission(root, state, payload, noQuestion) {
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

function looksLikeUserGitAction(payload = {}) {
  const command = extractCommand(payload);
  const haystack = [
    command,
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
  if (/\bcodex\b[\s_-]*(?:app\s*)?(?:git\s*)?(?:action|commit|push|pr)\b/i.test(haystack)) return true;
  if (!/^\s*git\s+/i.test(command)) return false;
  return /\bgit\s+(?:status|diff|add|commit|push|branch|remote|rev-parse|log)\b/i.test(command);
}

function clarificationGateLocked(state = {}) {
  if (isBlockingClarificationAwaiting(state)) return true;
  return Boolean(
    state?.mission_id
    && state.implementation_allowed === false
    && state.ambiguity_gate_required === true
    && state.ambiguity_gate_passed !== true
    && (String(state.phase || '').includes('CLARIFICATION_AWAITING_ANSWERS') || String(state.stop_gate || '') === 'clarification-gate')
  );
}

function clarificationAnswerToolAllowed(payload = {}) {
  const command = extractCommand(payload);
  if (/\bpipeline\s+answer\b/i.test(command) && /\b(?:sks|sks\.mjs|bin\/sks\.mjs|node)\b/i.test(command)) return true;
  if (!payloadMentionsAnswersJson(payload)) return false;
  if (!command) return true;
  if (/\bpipeline\s+answer\b/i.test(command)) return true;
  return !/\b(npm|git|selftest|packcheck|release:check|publish:dry|publish:npm|doctor|team|qa-loop|wiki|db|test)\b/i.test(command);
}

function payloadMentionsAnswersJson(payload = {}) {
  try {
    return /\banswers\.json\b/i.test(JSON.stringify(payload || {}));
  } catch {
    return false;
  }
}

function clarificationPauseBlockReason(state = {}) {
  const id = state?.mission_id || 'latest';
  const route = state.route_command || state.route || state.mode || 'route';
  return `SKS ${route} ambiguity gate is paused and waiting for explicit user answers. Do not run implementation, tests, route materialization, or unrelated tools yet. The only allowed action is sealing the user's reply with "sks pipeline answer ${id} --stdin"; elapsed time or repeated hook resumes never count as answers.`;
}

async function hookStop(root, state, payload, noQuestion) {
  const last = extractLastMessage(payload);
  if (!noQuestion && (hasDfixLightCompletion(last) || await consumeLightRouteStop(root, payload))) {
    return {
      continue: true,
      systemMessage: 'SKS: DFix ultralight finalization accepted; full-route Honest Mode loopback is not required.'
    };
  }
  const routeDecision = await evaluateStop(root, state, payload, { noQuestion });
  if (routeDecision) return routeDecision;
  if (!noQuestion) {
    if (!hasHonestMode(last)) {
      const reason = 'SKS Honest Mode is required before finishing. Re-check the actual goal, verify evidence/tests, state gaps honestly, and only then provide the final answer. Include a short "SKS Honest Mode" or "솔직모드" section.';
      const repeatDecision = await finalizationRepeatDecision(root, state, payload, reason, 'honest_mode_missing');
      return repeatDecision || {
        decision: 'block',
        reason
      };
    }
    if (!hasCompletionSummary(last)) {
      const reason = 'SKS final completion summary is required before finishing. Explain what was done, what changed for the user/repo, what was verified, and any remaining gaps before or alongside SKS Honest Mode.';
      const repeatDecision = await finalizationRepeatDecision(root, state, payload, reason, 'completion_summary_missing');
      return repeatDecision || {
        decision: 'block',
        reason
      };
    }
    if (shouldLoopBackAfterHonestMode(state) && hasHonestModeUnresolvedGap(last)) {
      const loopback = await recordHonestModeLoopback(root, state, last);
      return {
        decision: 'block',
        reason: `SKS Honest Mode found unresolved gaps. Continue from the post-ambiguity execution phase using decision-contract.json, fix them, rerun verification, refresh/validate TriWiki, then retry final Honest Mode. Loopback: ${loopback.relative_file}`
      };
    }
    if (state?.honest_loop_required) await resolveHonestModeLoopback(root, state);
    return { continue: true };
  }
  return {
    decision: 'block',
    reason: 'SKS no-question run is not done. Continue autonomously, fix failing checks, update the active gate file, and do not ask the user.'
  };
}

async function consumeLightRouteStop(root, payload = {}) {
  const file = path.join(root, '.sneakoscope', 'state', LIGHT_ROUTE_STOP_ARTIFACT);
  const record = await readJson(file, null).catch(() => null);
  if (!record?.pending_stop_bypass) return false;
  if (record.route !== 'DFix') return false;
  const nowMs = Date.now();
  const expiresMs = Date.parse(record.expires_at || '');
  if (!Number.isFinite(expiresMs) || expiresMs < nowMs) return false;
  const currentConversation = conversationId(payload);
  if (record.conversation_id && explicitConversationId(payload) && record.conversation_id !== currentConversation) return false;
  await writeJsonAtomic(file, {
    ...record,
    pending_stop_bypass: false,
    consumed_at: nowIso()
  }).catch(() => null);
  return true;
}

function hasDfixLightCompletion(text) {
  const s = String(text || '');
  const marker = /^\s*(?:\*\*)?\s*(?:\$?DFix|dfix)\s*(?:완료\s*요약|completion\s+summary)\s*[:：]/im.test(s);
  if (!marker) return false;
  const honest = /^\s*(?:\*\*)?\s*(?:\$?DFix|dfix)\s*(?:솔직모드|honest(?:\s+mode)?)\s*[:：]/im.test(s);
  if (!honest) return false;
  const verification = /(검증|확인|통과|verified|verification|checked|evidence|근거)/i.test(s);
  const gap = /(미검증|남은|문제|gap|remaining|not verified|not run|blocker|차단|불가|없음|none)/i.test(s);
  return verification && gap;
}

function explicitConversationId(payload = {}) {
  return payload.conversation_id || payload.thread_id || payload.session_id || payload.chat_id || null;
}

async function finalizationRepeatDecision(root, state = {}, payload = {}, reason = '', kind = 'finalization') {
  const now = nowIso();
  const guardPath = path.join(root, '.sneakoscope', 'state', STOP_REPEAT_GUARD_ARTIFACT);
  const previous = await readJson(guardPath, {}).catch(() => ({}));
  const limit = stopRepeatGuardLimit();
  const entries = pruneStopRepeatEntries(previous.entries || {}, now);
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
  if (repeatCount < limit) return null;
  return {
    continue: true,
    systemMessage: `SKS stop hook repeat guard suppressed repeated ${kind} prompt after ${repeatCount} identical block(s). No completion success is claimed by the hook.`
  };
}

function stopRepeatKey(state = {}, payload = {}, reason = '', kind = '') {
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

function stopRepeatInWindow(entry = {}, now = nowIso()) {
  const last = Date.parse(entry.last_seen || '');
  const current = Date.parse(now);
  if (!Number.isFinite(last) || !Number.isFinite(current)) return false;
  return current - last <= STOP_REPEAT_GUARD_WINDOW_MS;
}

function pruneStopRepeatEntries(entries = {}, now = nowIso()) {
  return Object.fromEntries(Object.entries(entries)
    .filter(([, entry]) => stopRepeatInWindow(entry, now))
    .sort((a, b) => Date.parse(b[1]?.last_seen || '') - Date.parse(a[1]?.last_seen || ''))
    .slice(0, STOP_REPEAT_GUARD_MAX_ENTRIES));
}

async function updateCheckContext(root, payload, prompt) {
  if (process.env.SKS_DISABLE_UPDATE_CHECK === '1') return '';
  const statePath = path.join(root, '.sneakoscope', 'state', 'update-check.json');
  const updateState = await readJson(statePath, {});
  const conv = conversationId(payload);
  const pending = updateState.pending_offer;
  let effective = null;
  async function effectiveVersion() {
    if (!effective) {
      const installed = await detectInstalledSksVersion();
      effective = {
        installed,
        current: highestVersion([PACKAGE_VERSION, installed.version])
      };
    }
    return effective;
  }
  if (pending?.latest) {
    const currentCheck = await effectiveVersion();
    if (compareVersions(pending.latest, currentCheck.current) <= 0) {
      await writeJsonAtomic(statePath, {
        ...updateState,
        current: currentCheck.current,
        runtime_current: PACKAGE_VERSION,
        installed_current: currentCheck.installed.version || null,
        latest: pending.latest,
        checked_at: nowIso(),
        pending_offer: null,
        check_error: null
      });
      return '';
    }
  }
  if (updateState.skipped?.latest) {
    const currentCheck = await effectiveVersion();
    if (compareVersions(updateState.skipped.latest, currentCheck.current) <= 0) {
      await writeJsonAtomic(statePath, {
        ...updateState,
        current: currentCheck.current,
        runtime_current: PACKAGE_VERSION,
        installed_current: currentCheck.installed.version || null,
        latest: updateState.skipped.latest,
        checked_at: nowIso(),
        pending_offer: null,
        skipped: null,
        check_error: null
      });
      return '';
    }
  }
  if (pending?.conversation_id === conv && pending?.latest && looksLikeUpdateDecline(prompt)) {
    await writeJsonAtomic(statePath, {
      ...updateState,
      pending_offer: null,
      skipped: { conversation_id: conv, latest: pending.latest, skipped_at: nowIso() }
    });
    return `SKS update check: user skipped update to ${pending.latest} for this conversation only. Continue the previous task without updating. Check again on the next conversation.`;
  }
  if (pending?.conversation_id === conv && pending?.latest && looksLikeUpdateAccept(prompt)) {
    await writeJsonAtomic(statePath, {
      ...updateState,
      pending_offer: null,
      accepted: { conversation_id: conv, latest: pending.latest, accepted_at: nowIso() }
    });
    return `SKS update check: user accepted update to ${pending.latest}. Before doing other work, run exactly this command and nothing else: npm i -g sneakoscope@latest. Do not start a pipeline route, run setup, or run doctor for this accepted update command.`;
  }
  if (updateState.skipped?.conversation_id === conv && updateState.skipped?.latest) {
    return `SKS update check: update ${updateState.skipped.latest} was skipped for this conversation only. Do not ask again in this conversation; check again next conversation.`;
  }
  const check = await checkLatestVersion();
  const { installed, current } = await effectiveVersion();
  const isCurrent = check.latest && compareVersions(check.latest, current) <= 0;
  await writeJsonAtomic(statePath, {
    ...updateState,
    current,
    runtime_current: PACKAGE_VERSION,
    installed_current: installed.version || null,
    latest: check.latest || null,
    checked_at: nowIso(),
    pending_offer: isCurrent ? null : updateState.pending_offer || null,
    check_error: check.error || null
  });
  if (!check.latest || check.error || isCurrent) return '';
  await writeJsonAtomic(statePath, {
    ...updateState,
    current,
    runtime_current: PACKAGE_VERSION,
    installed_current: installed.version || null,
    latest: check.latest,
    checked_at: nowIso(),
    pending_offer: { conversation_id: conv, latest: check.latest, offered_at: nowIso() },
    skipped: updateState.skipped?.conversation_id === conv ? null : updateState.skipped || null
  });
  return `SKS update check: installed ${current}, latest ${check.latest}. Before any other work, ask the user to choose: "Update SKS now" or "Skip update for this conversation". If they choose update, run exactly this command and nothing else: npm i -g sneakoscope@latest. Do not start a pipeline route, run setup, or run doctor for this accepted update command. If they skip, do not ask again in this conversation, but check again next conversation.`;
}

async function checkLatestVersion() {
  if (process.env.SKS_NPM_VIEW_SNEAKOSCOPE_VERSION) return { latest: process.env.SKS_NPM_VIEW_SNEAKOSCOPE_VERSION };
  const npm = await which('npm').catch(() => null);
  if (!npm) return { error: 'npm not found' };
  const result = await runProcess(npm, ['view', 'sneakoscope', 'version'], { timeoutMs: 3500, maxOutputBytes: 4096 });
  if (result.code !== 0) return { error: `${result.stderr || result.stdout || 'npm view failed'}`.trim() };
  return { latest: result.stdout.trim().split(/\s+/).pop() };
}

async function detectInstalledSksVersion() {
  const override = parseVersionText(process.env.SKS_INSTALLED_SKS_VERSION || '');
  if (override) return { version: override, source: 'env' };
  const candidates = [];
  const pkg = await readJson(path.join(packageRoot(), 'package.json'), {}).catch(() => ({}));
  if (parseVersionText(pkg.version)) candidates.push({ version: parseVersionText(pkg.version), source: 'package.json' });
  const sks = await which('sks').catch(() => null);
  if (!sks) return candidates[0] || { version: null, source: null };
  const result = await runProcess(sks, ['--version'], {
    timeoutMs: 2000,
    maxOutputBytes: 4096,
    env: { SKS_DISABLE_UPDATE_CHECK: '1' }
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (result.code === 0 && parseVersionText(result.stdout)) candidates.push({ version: parseVersionText(result.stdout), source: sks });
  if (candidates.length) return candidates.reduce((best, candidate) => compareVersions(candidate.version, best.version) > 0 ? candidate : best);
  return { version: null, source: sks, error: `${result.stderr || result.stdout || 'sks --version failed'}`.trim() };
}

function parseVersionText(text) {
  const match = String(text || '').match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match ? match[0] : null;
}

function highestVersion(versions = []) {
  return versions.filter(Boolean).reduce((best, candidate) => compareVersions(candidate, best) > 0 ? candidate : best, '0.0.0');
}

function compareVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function hasHonestMode(text) {
  const s = String(text || '');
  return /(SKS Honest Mode|솔직모드|Honest Mode)/i.test(s)
    && /(verified|verification|검증|tests?|테스트|evidence|근거|gap|제약|uncertainty|불확실)/i.test(s);
}

function hasCompletionSummary(text) {
  const s = String(text || '');
  const summary = /(completion summary|change summary|what changed|what was done|done summary|작업\s*요약|완료\s*요약|변경\s*요약|무엇을\s*(?:했|했고|변경)|뭐가\s*어떻게|정리)/i.test(s);
  const verification = /(verified|verification|검증|tests?|테스트|evidence|근거|확인|통과)/i.test(s);
  const gap = /(gap|gaps|remaining|제약|남은|미검증|not verified|not run|not claimed|불확실|없음|none)/i.test(s);
  return summary && verification && gap;
}

function hasHonestModeUnresolvedGap(text) {
  return honestModeGapLines(text).length > 0;
}

function honestModeGapLines(text) {
  const issue = /(gap|remaining|unverified|not verified|not run|not complete|incomplete|failed|blocked|blocker|could not|couldn't|missing|미완료|미검증|미실행|실패|차단|누락|못했|못 했|안 했|안함|아직|남은)/i;
  return String(text || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => issue.test(line) && !honestGapLineResolved(line))
    .slice(0, 12);
}

function honestGapLineResolved(line) {
  if (/(남은\s*(?:gap|갭|문제)\s*:\s*없음|남은\s*(?:gap|갭|문제)\s*없음|remaining\s+gaps?\s*:\s*(none|no|0)|no\s+remaining\s+gaps?)/i.test(line)) return true;
  if (/no\s+active\s+blocking\s+route\s+gate\s+detected/i.test(line)) return true;
  if (/(non[-\s]?blocker|non[-\s]?blocking|not\s+(?:a\s+)?blocker|no\s+blocker|does\s+not\s+block|not\s+blocking|blocker\s*(?:는|가)?\s*(?:아님|아닙니다|없음)|차단(?:하지|하진|하지는)\s*않|막(?:지|지는)\s*않)/i.test(line)) return true;
  if (/(요약\s*(?:없으면|없는\s*경우).*(?:차단|block).*(?:요약\s*(?:있으면|있는\s*경우)|통과|pass)|(?:missing|without)\s+summary.*(?:block|blocked).*(?:with\s+summary|pass|accepted))/i.test(line)) return true;
  if (/(차단(?:되는지)?\s*검증|차단\s*(?:확인|검증)|blocked\s+(?:as\s+expected|verified))/i.test(line) && !/(미확인|미검증|못|안\s*됨|실패|failed|not\s+verified|not\s+blocked)/i.test(line)) return true;
  if (/(CHANGELOG|README|\.md|missing|누락|미완료|미검증|미실행|안 했|못했|못 했)/i.test(line)) return false;
  return /(없음|없습니다|없다|해당 없음|none|no unresolved|no remaining|no gaps|zero|0개|n\/a|not applicable)\.?\s*$/i.test(line);
}

function shouldLoopBackAfterHonestMode(state = {}) {
  if (!state?.mission_id) return false;
  if (state.implementation_allowed === false) return false;
  const route = String(state.route || state.mode || '').toLowerCase();
  if (['answer', 'dfix', 'wiki'].includes(route)) return false;
  return Boolean(state.ambiguity_gate_passed || state.clarification_passed || /CONTRACT_SEALED|HONEST_LOOPBACK/i.test(String(state.phase || '')));
}

async function recordHonestModeLoopback(root, state = {}, lastMessage = '') {
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
  });
  return { file, relative_file: path.relative(root, file).split(path.sep).join('/') };
}

async function resolveHonestModeLoopback(root, state = {}) {
  const id = state.mission_id;
  const mode = String(state.mode || state.route || 'SKS').toUpperCase();
  if (id) await appendJsonl(path.join(missionDir(root, id), 'events.jsonl'), { ts: nowIso(), type: 'pipeline.honest_mode.loopback_resolved', previous_phase: state.phase || null });
  await setCurrent(root, {
    phase: `${mode}_HONEST_COMPLETE`,
    honest_loop_required: false,
    honest_loop_resolved_at: nowIso(),
    questions_allowed: true
  });
}

async function teamLiveDigest(root, state = {}) {
  if (!isTeamState(state) || !state.mission_id) return null;
  const id = String(state.mission_id);
  const dir = missionDir(root, id);
  const dashboard = await readJson(path.join(dir, 'team-dashboard.json'), null).catch(() => null);
  const transcript = await readText(path.join(dir, 'team-transcript.jsonl'), '').catch(() => '');
  let events = transcript.split(/\n/).filter(Boolean).slice(-TEAM_DIGEST_MAX_EVENTS * 3).map(parseTeamTranscriptLine).filter(Boolean);
  let source = 'team-transcript.jsonl';
  if (!events.length) {
    const live = await readText(path.join(dir, 'team-live.md'), '').catch(() => '');
    events = live.split(/\n/).filter((line) => /^- \d{4}-\d{2}-\d{2}T/.test(line.trim())).slice(-TEAM_DIGEST_MAX_EVENTS).map(parseTeamLiveLine).filter(Boolean);
    source = 'team-live.md';
  }
  if (!events.length) {
    events = dashboard?.latest_messages || [];
    source = 'team-dashboard.json';
  }
  events = normalizeTeamEvents(events).slice(-TEAM_DIGEST_MAX_EVENTS);
  if (!events.length) return null;

  const phase = oneLine(state.phase || dashboard?.phase || 'TEAM', 48);
  const lines = events.map(formatTeamDigestEvent);
  const context = boundText([
    `SKS Team live digest: mission ${id}, phase ${phase}, source ${source}.`,
    `Open tmux multi-view with: sks team open-tmux ${id}`,
    `Open live view with: sks team watch ${id}`,
    'Recent events:',
    ...lines.map((line) => `- ${line}`)
  ].join('\n'), TEAM_DIGEST_CONTEXT_CHARS);
  const system = boundText(`SKS Team live: ${lines.at(-1) || `${id} ${phase}`}`, TEAM_DIGEST_SYSTEM_CHARS);
  return { context, system };
}

function isTeamState(state = {}) {
  const values = [state.mode, state.route, state.route_command, state.stop_gate].map((value) => String(value || '').toLowerCase());
  return values.some((value) => value === 'team' || value === '$team' || value.includes('team-gate'));
}

function normalizeTeamEvents(events = []) {
  return events.map((event) => ({
    ts: String(event?.ts || ''),
    agent: oneLine(event?.agent || 'unknown', 40),
    phase: oneLine(event?.phase || 'general', 48),
    message: oneLine(event?.message || '', TEAM_DIGEST_MESSAGE_CHARS)
  })).filter((event) => event.message);
}

function parseTeamTranscriptLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseTeamLiveLine(line) {
  const match = String(line || '').trim().match(/^-\s+(\S+)\s+\[([^\]]+)\]\s+([^:]+):\s*(.*)$/);
  if (!match) return null;
  return { ts: match[1], phase: match[2], agent: match[3], message: match[4] };
}

function formatTeamDigestEvent(event) {
  const ts = shortIsoTime(event.ts);
  return `${ts} [${event.phase}] ${event.agent}: ${event.message}`;
}

function shortIsoTime(ts) {
  return String(ts || '').replace(/^\d{4}-\d{2}-\d{2}T/, '').replace(/\.\d{3}Z$/, 'Z') || 'recent';
}

function oneLine(value, limit) {
  return boundText(String(value || '').replace(/\s+/g, ' ').trim(), limit);
}

function boundText(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function joinSystemMessages(...parts) {
  return boundText(parts.filter(Boolean).join(' | '), 420);
}

export async function emitHook(name) {
  const result = await hookMain(name);
  process.stdout.write(`${JSON.stringify(normalizeHookResult(name, result))}\n`);
}

function normalizeHookResult(name, result = {}) {
  const eventName = codexHookEventName(name);
  const out = { ...result };
  const systemMessage = out.systemMessage || visibleHookMessage(name, out.reason || out.additionalContext || '');
  const normalized = { continue: out.continue !== false, systemMessage };
  const reason = out.reason || 'SKS guard denied this action.';

  if (eventName === 'UserPromptSubmit' || eventName === 'PostToolUse') {
    if (out.decision === 'block') {
      normalized.decision = 'block';
      normalized.reason = reason;
    }
    if (out.additionalContext) {
      normalized.hookSpecificOutput = {
        hookEventName: eventName,
        additionalContext: out.additionalContext
      };
    }
    return normalized;
  }

  if (eventName === 'PreToolUse') {
    if (out.decision === 'block' || out.permissionDecision === 'deny' || out.decision === 'deny') {
      normalized.decision = 'block';
      normalized.reason = reason;
    }
    return normalized;
  }

  if (eventName === 'PermissionRequest') {
    if (out.decision === 'deny' || out.permissionDecision === 'deny') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'deny',
          message: reason
        }
      };
    } else if (out.decision === 'allow' || out.permissionDecision === 'allow') {
      normalized.hookSpecificOutput = {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow' }
      };
    }
    return normalized;
  }

  if (eventName === 'Stop') {
    if (out.decision === 'block') {
      normalized.decision = 'block';
      normalized.reason = reason;
    }
    return normalized;
  }

  return normalized;
}

function codexHookEventName(name) {
  return {
    'user-prompt-submit': 'UserPromptSubmit',
    'pre-tool': 'PreToolUse',
    'post-tool': 'PostToolUse',
    'permission-request': 'PermissionRequest',
    'stop': 'Stop'
  }[name] || name;
}

function visibleHookMessage(name, text = '') {
  const body = String(text || '');
  if (name === 'user-prompt-submit') {
    if (body.includes('DFix ultralight pipeline active')) return 'SKS: DFix ultralight task list injected.';
    if (body.includes('SKS answer-only pipeline active')) return 'SKS: answer-only research context injected.';
    if (body.includes('SKS wiki pipeline active')) return 'SKS: wiki refresh context injected.';
    if (body.includes('$Goal route prepared')) return 'SKS: Goal workflow bridge prepared for native Codex /goal continuation.';
    if (body.includes('Computer Use fast lane active')) return 'SKS: Computer Use fast lane injected; defer TriWiki/Honest Mode to final closeout.';
    if (body.includes('MANDATORY ambiguity-removal gate') || body.includes('VISIBLE RESPONSE CONTRACT') || body.includes('Required questions still pending')) return 'SKS: stale clarification gate detected; continue from inferred route contract.';
    if (body.includes('$Team route prepared') || body.includes('Team route')) return 'SKS: Team route, live transcript, and subagent plan injected.';
    if (body.includes('$QA-LOOP route prepared') || body.includes('QA-LOOP')) return 'SKS: QA-LOOP route and safety checklist injected.';
    if (body.includes('Subagent policy: REQUIRED')) return 'SKS: route context injected; subagent execution gate is active.';
    return 'SKS: skill-first route context injected.';
  }
  if (name === 'post-tool') return 'SKS: tool result inspected; Context7/subagent/DB evidence updated when relevant.';
  if (name === 'stop') {
    if (body.includes('Required questions')) return 'SKS: stale clarification wording detected; route should auto-seal from inferred defaults.';
    return body ? 'SKS: stop gate checked; continuing until route evidence passes.' : 'SKS: stop gate checked.';
  }
  if (name === 'permission-request') return body ? 'SKS: permission request evaluated by harness guards.' : 'SKS: permission request inspected.';
  if (name === 'pre-tool') return body ? 'SKS: tool call inspected by harness guards.' : 'SKS: tool call inspected.';
  return 'SKS: hook evaluated.';
}
