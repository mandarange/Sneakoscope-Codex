import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic, appendJsonl, readStdin, nowIso, exists, runProcess, which, PACKAGE_VERSION } from './fsx.mjs';
import { containsUserQuestion, looksInteractiveCommand, noQuestionContinuationReason, interactiveCommandReason } from './no-question-guard.mjs';
import { stateFile, missionDir } from './mission.mjs';
import { checkDbOperation, dbBlockReason } from './db-safety.mjs';

async function loadHookPayload() {
  const raw = await readStdin();
  try { return raw.trim() ? JSON.parse(raw) : {}; } catch { return { raw }; }
}

async function loadState(root) {
  return readJson(stateFile(root), {});
}

function isNoQuestionRunning(state) {
  return (state.mode === 'RALPH' && state.phase === 'RALPH_RUNNING_NO_QUESTIONS')
    || (state.mode === 'RESEARCH' && state.phase === 'RESEARCH_RUNNING_NO_QUESTIONS');
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
  return payload.command || payload.tool_input?.command || payload.input?.command || payload.tool?.input?.command || '';
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

function looksLikeFastDesignFix(prompt) {
  const text = String(prompt || '');
  const designCue = /(글자|텍스트|문구|내용|색|컬러|폰트|간격|여백|정렬|버튼|라벨|영어|한국어|번역|copy|text|color|font|spacing|padding|margin|align|label|button|translate)/i.test(text);
  const changeCue = /(바꿔|변경|수정|교체|고쳐|영어로|한국어로|change|replace|update|make|turn|translate|fix)/i.test(text);
  return designCue && changeCue;
}

function promptPipelineContext(prompt) {
  const command = dollarCommand(prompt);
  const fastDesign = command === 'DF' || looksLikeFastDesignFix(prompt);
  const team = command === 'TEAM';
  const wiki = command === 'GX' || /\b(llm wiki|wiki|context compression|context pack|hydrate|rgba|coordinate|좌표|컨텍스트|압축)\b/i.test(String(prompt || ''));
  const autoresearch = command === 'AUTORESEARCH' || command === 'RESEARCH' || /\b(autoresearch|experiment|benchmark|hypothesis|research|optimi[sz]e|improve metric|falsify|novelty|SEO|GEO)\b/i.test(String(prompt || ''));
  const route = command ? `$${command}` : (fastDesign ? '$DF inferred' : 'default');
  const dfLine = fastDesign
    ? '\nFast design fix: treat this as $DF. Do the smallest relevant edit, avoid Ralph/research loops, avoid broad redesign, and run only cheap verification when useful.'
    : '';
  const teamLine = team
    ? '\nTeam route: first use a planning/debate team, synthesize one agreed objective, close planning agents, then form a fresh implementation team with disjoint write scopes.'
    : '';
  const autoresearchLine = autoresearch
    ? '\nAutoResearch route: use an experiment loop with a clear program, fixed budget, metric, keep/discard decision, ledger, falsification, and next experiment.'
    : '';
  const wikiLine = wiki
    ? '\nLLM Wiki route: preserve context through TriWiki RGBA/trig coordinate anchors. Prefer sks wiki pack for hydratable context; keep ids, hashes, source paths, and coordinates for non-selected claims instead of lossy summaries.'
    : '';
  return `SKS prompt pipeline active. Route: ${route}. Before work, respect the SKS update-check context if present. Optimize the user request before acting: extract intent, target files/surfaces, constraints, acceptance criteria, and the smallest safe execution path. Use explicit $ commands when present: $DF fast design/content edit, $Team multi-agent orchestration, $Ralph clarification-gated mission, $Research discovery run, $AutoResearch iterative experiment loop, $DB database safety, $GX visual context, $SKS general SKS help. Without a command, infer the lightest matching route and avoid heavy loops unless the task requires them. Preserve multi-turn context with LLM Wiki coordinate packs when compression or continuity matters. Do not stop at a plan when implementation was requested; continue until the stated goal is actually handled or a hard blocker is honestly reported. Before final answer, perform SKS Honest Mode: verify evidence, list tests run or gaps, call out uncertainty, and confirm the goal is actually complete.${dfLine}${teamLine}${autoresearchLine}${wikiLine}`;
}

export async function hookMain(name) {
  const payload = await loadHookPayload();
  const root = await projectRoot(payload.cwd || process.cwd());
  const state = await loadState(root);
  const noQuestion = isNoQuestionRunning(state);
  if (name === 'user-prompt-submit') return hookUserPrompt(root, state, payload, noQuestion);
  if (name === 'pre-tool') return hookPreTool(root, state, payload, noQuestion);
  if (name === 'post-tool') return hookPostTool(root, state, payload, noQuestion);
  if (name === 'permission-request') return hookPermission(root, state, payload, noQuestion);
  if (name === 'stop') return hookStop(root, state, payload, noQuestion);
  return { continue: true };
}

async function hookUserPrompt(root, state, payload, noQuestion) {
  if (!noQuestion) {
    const prompt = extractUserPrompt(payload);
    const updateContext = await updateCheckContext(root, payload, prompt);
    return { continue: true, additionalContext: `${updateContext}${updateContext ? '\n\n' : ''}${promptPipelineContext(prompt)}` };
  }
  const id = state.mission_id;
  if (id) await appendJsonl(path.join(missionDir(root, id), 'user_queue.jsonl'), { ts: nowIso(), payload });
  return {
    decision: 'block',
    reason: 'SKS no-question/no-interruption mode is active. User prompt has been queued until the run completes.'
  };
}

async function hookPreTool(root, state, payload, noQuestion) {
  const dbDecision = await checkDbOperation(root, state, payload, { duringRalph: noQuestion });
  if (dbDecision.action === 'block') {
    return { decision: 'block', permissionDecision: 'deny', reason: dbBlockReason(dbDecision) };
  }
  const command = extractCommand(payload);
  if (noQuestion && looksInteractiveCommand(command)) return { decision: 'block', reason: interactiveCommandReason(command) };
  return { continue: true };
}

async function hookPostTool(root, state, payload, noQuestion) {
  const dbDecision = await checkDbOperation(root, state, payload, { duringRalph: noQuestion });
  if (dbDecision.action === 'block') {
    return { decision: 'block', reason: dbBlockReason(dbDecision) };
  }
  if (!noQuestion) return { continue: true };
  const failed = payload.exit_code && payload.exit_code !== 0;
  if (failed) {
    return {
      additionalContext: 'SKS no-question mode is active. Do not ask the user about this tool failure. Apply the active plan fallback ladder, create a fix task, and continue.'
    };
  }
  return { continue: true };
}

async function hookPermission(root, state, payload, noQuestion) {
  const dbDecision = await checkDbOperation(root, state, payload, { duringRalph: noQuestion });
  if (dbDecision.action === 'block') {
    return { decision: 'deny', permissionDecision: 'deny', reason: dbBlockReason(dbDecision) };
  }
  if (!noQuestion) return { continue: true };
  return {
    decision: 'deny',
    permissionDecision: 'deny',
    reason: 'SKS no-question mode forbids mid-loop approval prompts. Choose a non-approval safe alternative using the active plan.'
  };
}

async function hookStop(root, state, payload, noQuestion) {
  if (!noQuestion) {
    const last = extractLastMessage(payload);
    if (!hasHonestMode(last)) {
      return {
        decision: 'block',
        reason: 'SKS Honest Mode is required before finishing. Re-check the actual goal, verify evidence/tests, state gaps honestly, and only then provide the final answer. Include a short "SKS Honest Mode" or "솔직모드" section.'
      };
    }
    return { continue: true };
  }
  const id = state.mission_id;
  const last = extractLastMessage(payload);
  if (containsUserQuestion(last)) return { decision: 'block', reason: noQuestionContinuationReason() };
  if (id) {
    for (const gateName of ['done-gate.json', 'research-gate.json']) {
      const gatePath = path.join(missionDir(root, id), gateName);
      if (await exists(gatePath)) {
        const gate = await readJson(gatePath, {});
        if (gate.passed === true) return { continue: true };
      }
    }
  }
  return {
    decision: 'block',
    reason: 'SKS no-question run is not done. Continue autonomously, fix failing checks, update the active gate file, and do not ask the user.'
  };
}

async function updateCheckContext(root, payload, prompt) {
  if (process.env.SKS_DISABLE_UPDATE_CHECK === '1') return '';
  const statePath = path.join(root, '.sneakoscope', 'state', 'update-check.json');
  const updateState = await readJson(statePath, {});
  const conv = conversationId(payload);
  const pending = updateState.pending_offer;
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
    return `SKS update check: user accepted update to ${pending.latest}. Before doing other work, run the appropriate update command, then rerun sks setup and sks doctor --fix. Global install: npm i -g sneakoscope. Project install: npm i -D sneakoscope && npx sks setup --install-scope project.`;
  }
  if (updateState.skipped?.conversation_id === conv && updateState.skipped?.latest) {
    return `SKS update check: update ${updateState.skipped.latest} was skipped for this conversation only. Do not ask again in this conversation; check again next conversation.`;
  }
  const check = await checkLatestVersion();
  await writeJsonAtomic(statePath, {
    ...updateState,
    current: PACKAGE_VERSION,
    latest: check.latest || null,
    checked_at: nowIso(),
    check_error: check.error || null
  });
  if (!check.latest || check.error || compareVersions(check.latest, PACKAGE_VERSION) <= 0) return '';
  await writeJsonAtomic(statePath, {
    ...updateState,
    current: PACKAGE_VERSION,
    latest: check.latest,
    checked_at: nowIso(),
    pending_offer: { conversation_id: conv, latest: check.latest, offered_at: nowIso() },
    skipped: updateState.skipped?.conversation_id === conv ? null : updateState.skipped || null
  });
  return `SKS update check: installed ${PACKAGE_VERSION}, latest ${check.latest}. Before any other work, ask the user to choose: "Update SKS now" or "Skip update for this conversation". If they choose update, run npm i -g sneakoscope for global installs, or npm i -D sneakoscope && npx sks setup --install-scope project for project installs, then run sks setup and sks doctor --fix. If they skip, do not ask again in this conversation, but check again next conversation.`;
}

async function checkLatestVersion() {
  const npm = await which('npm').catch(() => null);
  if (!npm) return { error: 'npm not found' };
  const result = await runProcess(npm, ['view', 'sneakoscope', 'version'], { timeoutMs: 3500, maxOutputBytes: 4096 });
  if (result.code !== 0) return { error: `${result.stderr || result.stdout || 'npm view failed'}`.trim() };
  return { latest: result.stdout.trim().split(/\s+/).pop() };
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

export async function emitHook(name) {
  const result = await hookMain(name);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
