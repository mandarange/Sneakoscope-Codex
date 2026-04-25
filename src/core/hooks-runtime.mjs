import path from 'node:path';
import { projectRoot, readJson, appendJsonl, readStdin, nowIso, exists } from './fsx.mjs';
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

function extractCommand(payload) {
  return payload.command || payload.tool_input?.command || payload.input?.command || payload.tool?.input?.command || '';
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
  if (!noQuestion) return { continue: true };
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
  if (!noQuestion) return { continue: true };
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

export async function emitHook(name) {
  const result = await hookMain(name);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
