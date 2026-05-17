import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { initProject } from '../init.mjs';
import { getCodexInfo, runCodexExec } from '../codex-adapter.mjs';
import { createMission, loadMission, setCurrent, stateFile } from '../mission.mjs';
import { writeQuestions } from '../questions.mjs';
import { sealContract } from '../decision-contract.mjs';
import { buildQaLoopQuestionSchema, buildQaLoopPrompt, evaluateQaGate, qaStatus, writeMockQaResult, writeQaLoopArtifacts } from '../qa-loop.mjs';
import { containsUserQuestion, noQuestionContinuationReason } from '../no-question-guard.mjs';
import { CODEX_COMPUTER_USE_EVIDENCE_SOURCE, ROUTES, routePrompt, stripVisibleDecisionAnswerBlocks } from '../routes.mjs';
import { scanDbSafety } from '../db-safety.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { flag, promptOf, readMaxCycles, resolveMissionId, safeReadTextFile } from './command-utils.mjs';
import fsp from 'node:fs/promises';

export async function qaLoopCommand(sub, args = []) {
  const known = new Set(['prepare', 'answer', 'run', 'status', 'help', '--help', '-h']);
  const action = known.has(sub) ? sub : 'prepare';
  const actionArgs = action === 'prepare' && sub && !known.has(sub) ? [sub, ...args] : args;
  if (action === 'prepare') return qaLoopPrepare(actionArgs);
  if (action === 'answer') return qaLoopAnswer(actionArgs);
  if (action === 'run') return qaLoopRun(actionArgs);
  if (action === 'status') return qaLoopStatus(actionArgs);
  console.log(`SKS QA-LOOP

Usage:
  sks qa-loop prepare "target"
  sks qa-loop answer <mission-id|latest> <answers.json>
  sks qa-loop run <mission-id|latest> [--mock] [--max-cycles N]
  sks qa-loop status <mission-id|latest>
`);
}

function qaRoute() {
  return ROUTES.find((route) => route.id === 'QALoop') || routePrompt('$QA-LOOP');
}

async function qaLoopPrepare(args) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const prompt = stripVisibleDecisionAnswerBlocks(promptOf(args));
  if (!prompt) throw new Error('Missing QA target prompt.');
  const { id, dir } = await createMission(root, { mode: 'qaloop', prompt });
  const schema = buildQaLoopQuestionSchema(prompt);
  const route = qaRoute();
  await writeQuestions(dir, schema);
  await writeJsonAtomic(path.join(dir, 'route-context.json'), { route: 'QALoop', command: '$QA-LOOP', mode: 'QALOOP', task: prompt, required_skills: route?.requiredSkills || [], context7_required: false, original_stop_gate: 'qa-gate.json', clarification_gate: true });
  if (schema.slots.length === 0) {
    await writeJsonAtomic(path.join(dir, 'answers.json'), schema.inferred_answers || {});
    const result = await sealContract(dir, { id, prompt, mode: 'qaloop' });
    if (!result.ok) {
      console.error('Inferred QA-LOOP answers failed validation.');
      console.error(JSON.stringify(result.validation, null, 2));
      process.exitCode = 2;
      return;
    }
    const artifactResult = await writeQaLoopArtifacts(dir, { id, prompt, mode: 'qaloop' }, result.contract);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.prepare.auto_sealed', slots: 0, hash: result.contract.sealed_hash, checklist_count: artifactResult.checklist_count });
    await setCurrent(root, { mission_id: id, route: 'QALoop', route_command: '$QA-LOOP', mode: 'QALOOP', phase: 'QALOOP_CLARIFICATION_CONTRACT_SEALED', questions_allowed: false, implementation_allowed: true, clarification_required: false, clarification_passed: true, ambiguity_gate_required: true, ambiguity_gate_passed: true, stop_gate: 'qa-gate.json', qa_loop_artifacts_ready: true, qa_report_file: artifactResult.report_file, qa_checklist_count: artifactResult.checklist_count, reasoning_effort: 'high', reasoning_profile: 'sks-logic-high', reasoning_temporary: true });
    if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.qa-loop-prepare.v1', ok: true, mission_id: id, report_file: artifactResult.report_file, checklist_count: artifactResult.checklist_count }, null, 2));
    console.log(`QA-LOOP mission created: ${id}`);
    console.log('QA-LOOP contract auto-sealed from prompt, TriWiki/current-code defaults, and conservative safety policy.');
    console.log(`Checklist: ${artifactResult.checklist_count} cases`);
    console.log(`Report: ${path.relative(root, path.join(dir, artifactResult.report_file))}`);
    console.log(`Run: sks qa-loop run ${id} --max-cycles ${schema.inferred_answers?.MAX_QA_CYCLES || 1}`);
    return;
  }
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.prepare.questions_created', slots: schema.slots.length });
  await setCurrent(root, { mission_id: id, route: 'QALoop', route_command: '$QA-LOOP', mode: 'QALOOP', phase: 'QALOOP_CLARIFICATION_AWAITING_ANSWERS', questions_allowed: true, implementation_allowed: false, clarification_required: true, ambiguity_gate_required: true, stop_gate: 'clarification-gate', reasoning_effort: 'high', reasoning_profile: 'sks-logic-high', reasoning_temporary: true });
  console.log(`QA-LOOP mission created: ${id}`);
  console.log(`Answer schema: ${path.relative(root, path.join(dir, 'required-answers.schema.json'))}`);
}

async function qaLoopAnswer(args) {
  const root = await sksRoot();
  const [missionArg, answerFile] = args;
  const id = await resolveMissionId(root, missionArg);
  if (!id || !answerFile) throw new Error('Usage: sks qa-loop answer <mission-id|latest> <answers.json>');
  const { dir, mission } = await loadMission(root, id);
  const answers = await readJson(path.resolve(answerFile));
  await writeJsonAtomic(path.join(dir, 'answers.json'), answers);
  const result = await sealContract(dir, mission);
  if (!result.ok) {
    console.error('Answer validation failed. QA-LOOP remains locked.');
    console.error(JSON.stringify(result.validation, null, 2));
    process.exitCode = 2;
    return;
  }
  const artifactResult = await writeQaLoopArtifacts(dir, mission, result.contract);
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.contract.sealed', hash: result.contract.sealed_hash, checklist_count: artifactResult.checklist_count });
  await setCurrent(root, { mission_id: id, route: 'QALoop', route_command: '$QA-LOOP', mode: 'QALOOP', phase: 'QALOOP_CLARIFICATION_CONTRACT_SEALED', questions_allowed: false, implementation_allowed: true, clarification_required: false, clarification_passed: true, ambiguity_gate_passed: true, stop_gate: 'qa-gate.json', reasoning_effort: 'high', reasoning_profile: 'sks-logic-high', reasoning_temporary: true });
  console.log(`QA-LOOP contract sealed for ${id}`);
}

async function qaLoopRun(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks qa-loop run <mission-id|latest> [--mock] [--max-cycles N]');
  const { dir, mission } = await loadMission(root, id);
  const contractPath = path.join(dir, 'decision-contract.json');
  if (!(await exists(contractPath))) throw new Error('QA-LOOP cannot run: decision-contract.json is missing.');
  const contract = await readJson(contractPath);
  if (!(await exists(path.join(dir, 'qa-ledger.json')))) await writeQaLoopArtifacts(dir, mission, contract);
  const safetyScan = await scanDbSafety(root);
  if (!safetyScan.ok) {
    console.error('QA-LOOP cannot run: SKS safety scan found unsafe project data-tool configuration.');
    console.error(JSON.stringify(safetyScan.findings, null, 2));
    process.exitCode = 2;
    return;
  }
  const fallbackCycles = Number.parseInt(contract.answers?.MAX_QA_CYCLES, 10) || 8;
  const maxCycles = readMaxCycles(args, fallbackCycles);
  const mock = flag(args, '--mock');
  const qaGate = await readJson(path.join(dir, 'qa-gate.json'), {});
  const reportFile = qaGate.qa_report_file;
  await setCurrent(root, { mission_id: id, route: 'QALoop', route_command: '$QA-LOOP', mode: 'QALOOP', phase: 'QALOOP_RUNNING_NO_QUESTIONS', questions_allowed: false, stop_gate: 'qa-gate.json', reasoning_effort: 'high', reasoning_profile: 'sks-logic-high', reasoning_temporary: true });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.run.started', maxCycles, mock });
  if (mock) {
    let gate = await writeMockQaResult(dir, mission, contract);
    const needsVisual = contract.answers?.QA_SCOPE && String(contract.answers.QA_SCOPE).includes('ui');
    if (needsVisual && gate.gate) {
      const nextGate = { ...gate.gate, passed: true, ui_computer_use_evidence: true, ui_evidence_source: CODEX_COMPUTER_USE_EVIDENCE_SOURCE, evidence: [...(gate.gate.evidence || []), 'mock Codex Computer Use fixture evidence'], notes: [...(gate.gate.notes || []), 'Mock fixture creates image voxel evidence; it does not claim a live UI run.'] };
      await writeJsonAtomic(path.join(dir, 'qa-gate.json'), nextGate);
      gate = await evaluateQaGate(dir);
    }
    const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$QA-LOOP', gateFile: 'qa-gate.json', gate: gate.gate || gate, artifacts: ['qa-gate.json', 'qa-ledger.json', reportFile, 'completion-proof.json'], visual: needsVisual, mock, command: { cmd: `sks qa-loop run ${id} --mock`, status: 0 } });
    await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: gate.passed ? 'QALOOP_DONE' : 'QALOOP_PAUSED', questions_allowed: true });
    if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.qa-loop-run.v1', ok: proof.ok, mission_id: id, gate, proof: proof.validation }, null, 2));
    console.log(`Mock QA-LOOP done: ${id}`);
    console.log(`Gate: ${gate.passed ? 'passed' : 'blocked'}`);
    return;
  }
  const codex = await getCodexInfo();
  if (!codex.bin) {
    console.error('Codex CLI not found. Running mock QA-LOOP instead.');
    const gate = await writeMockQaResult(dir, mission, contract);
    await maybeFinalizeRoute(root, { missionId: id, route: '$QA-LOOP', gateFile: 'qa-gate.json', gate: gate.gate || gate, artifacts: ['qa-gate.json', 'qa-ledger.json', reportFile, 'completion-proof.json'], mock: true, statusHint: 'verified_partial', command: { cmd: `sks qa-loop run ${id}`, status: 0 } });
    await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: gate.passed ? 'QALOOP_DONE' : 'QALOOP_PAUSED', questions_allowed: true });
    return;
  }
  let last = '';
  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const cycleDir = path.join(dir, 'qa-loop', `cycle-${cycle}`);
    const outputFile = path.join(cycleDir, 'final.md');
    const prompt = buildQaLoopPrompt({ id, mission, contract, cycle, previous: last, reportFile });
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.cycle.start', cycle });
    const result = await runCodexExec({ root, prompt, outputFile, json: true, profile: 'sks-logic-high', logDir: cycleDir });
    await writeJsonAtomic(path.join(cycleDir, 'process.json'), { code: result.code, stdout_tail: result.stdout, stderr_tail: result.stderr, stdout_bytes: result.stdoutBytes, stderr_bytes: result.stderrBytes, truncated: result.truncated, timed_out: result.timedOut });
    last = await safeReadTextFile(fsp, outputFile, result.stdout || result.stderr || '');
    if (containsUserQuestion(last)) {
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.guard.question_blocked', cycle });
      last = `${last}\n\n${noQuestionContinuationReason()}`;
      continue;
    }
    const gate = await evaluateQaGate(dir);
    if (gate.passed) {
      const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$QA-LOOP', gateFile: 'qa-gate.json', gate: gate.gate || gate, artifacts: ['qa-gate.json', 'qa-ledger.json', reportFile, 'completion-proof.json'], visual: contract.answers?.QA_SCOPE && String(contract.answers.QA_SCOPE).includes('ui'), command: { cmd: `sks qa-loop run ${id}`, status: 0 } });
      await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_DONE', questions_allowed: true });
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.done', cycle });
      if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.qa-loop-run.v1', ok: proof.ok, mission_id: id, gate, proof: proof.validation }, null, 2));
      console.log(`QA-LOOP done: ${id}`);
      return;
    }
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.cycle.continue', cycle, reasons: gate.reasons });
  }
  const gate = await evaluateQaGate(dir);
  const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$QA-LOOP', gateFile: 'qa-gate.json', gate: gate.gate || gate, artifacts: ['qa-gate.json', 'qa-ledger.json', reportFile, 'completion-proof.json'], mock: false, statusHint: 'blocked', reason: 'max_cycles', command: { cmd: `sks qa-loop run ${id}`, status: 2 } });
  await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_PAUSED_MAX_CYCLES', questions_allowed: true });
  if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.qa-loop-run.v1', ok: false, mission_id: id, gate, proof: proof.validation }, null, 2));
  console.log(`QA-LOOP paused after max cycles: ${id}`);
}

async function qaLoopStatus(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks qa-loop status <mission-id|latest>');
  const { dir, mission } = await loadMission(root, id);
  const state = await readJson(stateFile(root), {});
  const status = await qaStatus(dir);
  if (flag(args, '--json')) return console.log(JSON.stringify({ mission, state, qa: status }, null, 2));
  console.log('SKS QA-LOOP Status\n');
  console.log(`Mission:   ${id}`);
  console.log(`Phase:     ${state.phase || mission.phase}`);
  console.log(`Checklist: ${status.checklist_count ?? 'none'}`);
  console.log(`Report:    ${status.report_written ? `present ${status.report_file || ''}`.trim() : 'missing'}`);
  console.log(`Gate:      ${status.gate?.passed ? 'passed' : 'not passed'}`);
  if (status.gate?.reasons?.length) console.log(`Reasons:   ${status.gate.reasons.join(', ')}`);
}
