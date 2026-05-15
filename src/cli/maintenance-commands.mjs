import path from 'node:path';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readJson, readText, writeJsonAtomic, writeTextAtomic, appendJsonlBounded, nowIso, exists, ensureDir, packageRoot, dirSize, formatBytes, PACKAGE_VERSION, sksRoot, readStdin, runProcess } from '../core/fsx.mjs';
import { initProject } from '../core/init.mjs';
import { getCodexInfo, runCodexExec } from '../core/codex-adapter.mjs';
import { createMission, loadMission, findLatestMission, missionDir, setCurrent, stateFile } from '../core/mission.mjs';
import { buildQuestionSchema, writeQuestions } from '../core/questions.mjs';
import { sealContract } from '../core/decision-contract.mjs';
import { buildQaLoopQuestionSchema, buildQaLoopPrompt, evaluateQaGate, qaStatus, writeMockQaResult, writeQaLoopArtifacts } from '../core/qa-loop.mjs';
import { containsUserQuestion, noQuestionContinuationReason } from '../core/no-question-guard.mjs';
import { RESEARCH_GENIUS_SUMMARY_ARTIFACT, RESEARCH_SOURCE_SKILL_ARTIFACT, countGeniusOpinionSummaries, countResearchPaperSections, buildResearchPrompt, evaluateResearchGate, findResearchPaperArtifact, researchPaperArtifactForPlan, writeMockResearchResult, writeResearchPlan } from '../core/research.mjs';
import { storageReport, enforceRetention, pruneWikiArtifacts } from '../core/retention.mjs';
import { evaluateDoneGate } from '../core/hproof.mjs';
import { renderCartridge, validateCartridge, driftCartridge, snapshotCartridge } from '../core/gx-renderer.mjs';
import { DEFAULT_EVAL_THRESHOLDS, compareEvaluationReports, runEvaluationBenchmark } from '../core/evaluation.mjs';
import { contextCapsule } from '../core/triwiki-attention.mjs';
import { rgbaKey, rgbaToWikiCoord, validateWikiCoordinateIndex } from '../core/wiki-coordinate.mjs';
import { ALLOWED_REASONING_EFFORTS, CODEX_COMPUTER_USE_ONLY_POLICY, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, RECOMMENDED_SKILLS, ROUTES, hasFromChatImgSignal, reflectionRequiredForRoute, routeNeedsContext7, routePrompt, routeReasoning, routeRequiresSubagents, stackCurrentDocsPolicy, stripVisibleDecisionAnswerBlocks, triwikiContextTracking } from '../core/routes.mjs';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, teamRuntimePlanMetadata, teamRuntimeRequiredArtifacts, writeTeamRuntimeArtifacts } from '../core/team-dag.mjs';
import { appendTeamEvent, formatAgentReasoning, formatRoleCounts, initTeamLive, isTerminalTeamAgentStatus, normalizeTeamSpec, parseTeamSpecArgs, readTeamControl, readTeamDashboard, readTeamLive, readTeamTranscriptTail, renderTeamAgentLane, renderTeamCleanupSummary, renderTeamWatch, requestTeamSessionCleanup, teamCleanupRequested, teamReasoningPolicy } from '../core/team-live.mjs';
import { evaluateTeamReviewPolicyGate, MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, teamReviewPolicy } from '../core/team-review-policy.mjs';
import { ARTIFACT_FILES, writeValidationReport } from '../core/artifact-schemas.mjs';
import { writeEffortDecision } from '../core/effort-orchestrator.mjs';
import { createWorkOrderLedger, writeWorkOrderLedger } from '../core/work-order-ledger.mjs';
import { writeFromChatImgArtifacts } from '../core/from-chat-img-forensics.mjs';
import { renderTeamDashboardState, writeTeamDashboardState } from '../core/team-dashboard-renderer.mjs';
import { runPerfBench, runWorkflowPerfBench } from '../core/perf-bench.mjs';
import { writeProofFieldReport } from '../core/proof-field.mjs';
import { PIPELINE_PLAN_ARTIFACT, validatePipelinePlan, writePipelinePlan } from '../core/pipeline.mjs';
import { GOAL_BRIDGE_ARTIFACT, GOAL_WORKFLOW_ARTIFACT, updateGoalWorkflow, writeGoalWorkflow } from '../core/goal-workflow.mjs';
import { scanCodeStructure, writeCodeStructureReport } from '../core/code-structure.mjs';
import { writeMemorySweepReport } from '../core/memory-governor.mjs';
import { cleanupTmuxTeamView, defaultTmuxSessionName, launchMadTmuxUi, launchTmuxTeamView, reconcileTmuxTeamCockpit, sanitizeTmuxSessionName } from '../core/tmux-ui.mjs';
import { loadSkillDreamState, recordSkillDreamEvent, runSkillDream, writeSkillForgeReport } from '../core/skill-forge.mjs';
import { writeMistakeMemoryReport } from '../core/mistake-memory.mjs';
import { checkDbOperation, checkSqlFile, classifyCommand, classifySql, loadDbSafetyPolicy, safeSupabaseMcpConfig, scanDbSafety } from '../core/db-safety.mjs';
import { harnessGrowthReport, writeHarnessGrowthReport } from '../core/evaluation.mjs';
import { enableMadHighProfile, madHighProfileName } from '../core/auto-review.mjs';
import { permissionGateSummary } from '../core/permission-gates.mjs';

const flag = (args, name) => args.includes(name);
const promptOf = (args) => args.filter((x) => !String(x).startsWith('--')).join(' ').trim();
const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';
const REPOSITORY_URL = 'https://github.com/mandarange/Sneakoscope-Codex.git';
const RESEARCH_DEFAULT_MAX_CYCLES = 12;
const RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES = 120;
const RESEARCH_MIN_CYCLE_TIMEOUT_MINUTES = 15;
const RESEARCH_MAX_CYCLE_TIMEOUT_MINUTES = 240;

async function resolveMissionId(root, arg) { return (!arg || arg === 'latest') ? findLatestMission(root) : arg; }

function ambientGoalContinuation() {
  return {
    schema_version: 1,
    enabled: true,
    mode: 'ambient_codex_native_goal_overlay',
    native_slash_command: '/goal',
    non_disruptive: true,
    rule: 'Use Codex native goal persistence to keep long work resumable when available, but never replace Team, TriWiki, verification, or Honest Mode route gates.'
  };
}

function readOption(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function codexLbImmediateLaunchOpts(args = [], lb = {}, opts = {}) {
  const root = readOption(args, '--root', process.cwd());
  const explicitSession = readOption(args, '--session', null) || readOption(args, '--workspace', null);
  if (lb?.bypass_codex_lb) {
    const session = explicitSession || sanitizeTmuxSessionName(`sks-openai-fallback-${Date.now().toString(36)}-${defaultTmuxSessionName(root)}`);
    console.log(`codex-lb bypass active for this launch: ${lb.chain_health?.status || lb.status}`);
    console.log(`Using fresh OpenAI fallback tmux session: ${session}`);
    return { ...opts, session, codexArgs: [...(opts.codexArgs || []), '-c', 'model_provider="openai"'], codexLbBypassed: true };
  }
  if (!lb?.ok) return opts;
  const nextOpts = withCodexLbProviderArgs(opts);
  if (explicitSession) return nextOpts;
  const session = sanitizeTmuxSessionName(`sks-codex-lb-${Date.now().toString(36)}-${defaultTmuxSessionName(root)}`);
  console.log(`codex-lb active for this launch: ${lb.env_path || lb.base_url || 'configured'}`);
  console.log(`Using fresh tmux session: ${session}`);
  return { ...nextOpts, session, codexLbFreshSession: true };
}

function withCodexLbProviderArgs(opts = {}) {
  const codexArgs = [...(opts.codexArgs || [])];
  const hasProviderOverride = codexArgs.some((arg) => /model_provider\s*=/.test(String(arg || '')));
  if (!hasProviderOverride) codexArgs.push('-c', 'model_provider="codex-lb"');
  return { ...opts, codexArgs };
}

export async function madHighCommand(args = [], deps = {}) {
  const cleanArgs = args.filter((arg) => !['--mad', '--MAD', '--mad-sks', '--high', '--no-auto-install-tmux'].includes(arg));
  if (flag(args, '--json')) {
    const profile = await enableMadHighProfile();
    return console.log(JSON.stringify(profile, null, 2));
  }
  const update = await deps.maybePromptSksUpdateForLaunch(args, { label: 'MAD launch' });
  if (update.status === 'updated') {
    console.log(`SKS updated from ${deps.packageVersion} to ${update.latest}. Rerun: sks --mad`);
    return;
  }
  if (update.status === 'failed') {
    console.error(`SKS update failed: ${update.error}`);
    process.exitCode = 1;
    return;
  }
  const codexUpdate = await deps.maybePromptCodexUpdateForLaunch(args, { label: 'MAD launch' });
  if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
    console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
    process.exitCode = 1;
    return;
  }
  const depStatus = await deps.ensureMadLaunchDependencies(args);
  if (!depStatus.ready) {
    console.error('SKS MAD launch blocked by missing dependencies.');
    for (const action of depStatus.actions) deps.printDepsInstallAction(action);
    process.exitCode = 1;
    return;
  }
  const lb = await deps.maybePromptCodexLbSetupForLaunch(args);
  if (lb.status === 'missing_api_key') {
    process.exitCode = 1;
    return;
  }
  const profile = await enableMadHighProfile();
  const madLaunch = await activateMadTmuxPermissionState(process.cwd());
  console.log(`SKS MAD ready: ${madHighProfileName()} | gate ${madLaunch.mission_id}`);
  console.log('Live full-access active; catastrophic DB wipe/all-row/project-management guards remain.');
  const launchLb = lb.status === 'present' ? { ...lb, status: 'configured' } : lb;
  const launchOpts = codexLbImmediateLaunchOpts(cleanArgs, launchLb, {
    codexArgs: profile.launch_args,
    autoInstallTmux: !flag(args, '--no-auto-install-tmux'),
    conciseBlockers: true
  });
  const workspace = readOption(cleanArgs, '--workspace', readOption(cleanArgs, '--session', launchOpts.session || `sks-mad-${defaultTmuxSessionName(process.cwd())}`));
  return launchMadTmuxUi([...cleanArgs, '--workspace', workspace], {
    ...launchOpts,
    codexArgs: profile.launch_args,
    autoInstallTmux: !flag(args, '--no-auto-install-tmux'),
    conciseBlockers: true,
    missionId: madLaunch.mission_id
  });
}

async function activateMadTmuxPermissionState(cwd = process.cwd()) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: 'sks --mad tmux live full-access session' });
  const gate = {
    schema_version: 1,
    passed: false,
    mad_sks_permission_active: true,
    permissions_deactivated: false,
    live_server_writes_allowed: true,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    activated_by: 'sks --mad',
    cwd: path.resolve(cwd || process.cwd())
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route: 'MadSKS',
    command: '$MAD-SKS',
    mode: 'MADSKS',
    task: gate.activated_by,
    mad_sks_authorization: true,
    tmux_launch: true,
    permission_profile: gate.permission_profile
  });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'mad_sks.tmux_permission_opened',
    route: 'MadSKS',
    live_server_writes_allowed: true,
    catastrophic_safety_guard_active: true
  });
  await setCurrent(root, {
    mission_id: id,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: 'MADSKS_TMUX_PERMISSION_ACTIVE',
    questions_allowed: false,
    implementation_allowed: true,
    mad_sks_active: true,
    mad_sks_modifier: true,
    mad_sks_gate_file: 'mad-sks-gate.json',
    mad_sks_gate_ready: true,
    live_server_writes_allowed: true,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: gate.permission_profile,
    stop_gate: 'mad-sks-gate.json',
    prompt: gate.activated_by
  });
  return { mission_id: id, dir, gate };
}

export function quickstartCommand() {
  console.log(`ㅅㅋㅅ Quickstart

First install and bootstrap this project:
  npm i -g sneakoscope
  sks root
  sks bootstrap
  sks

Use outside a project:
  sks root
  sks deps check
  sks team "global mission"

If tmux is missing:
  sks deps install tmux

Initialize this project for CLI and Codex App:
  sks setup --bootstrap

Open from terminal:
  sks
  sks --auto-review --high
  sks auto-review start --high

Verify:
  sks deps check
  sks codex-app check
  sks tmux check
  sks auto-review status
  sks doctor --fix
  sks context7 check
  sks selftest --mock
  sks commands
  sks dollar-commands

If hooks cannot find the command:
  sks fix-path

Project-only install:
  npm i -D sneakoscope
  npx sks setup --install-scope project

Local-only install artifacts:
  sks setup --local-only
  # writes generated SKS files but excludes .sneakoscope/, .codex/, .agents/, AGENTS.md through .git/info/exclude
  # user-owned AGENTS.md is preserved; an existing SKS managed block is refreshed

Default project setup writes the same SKS generated-file patterns into the project .gitignore.

GitHub install for unreleased commits:
  npm i -g git+${REPOSITORY_URL}
  sks bootstrap
`);
}

export async function researchCommand(sub, args) {
  if (sub === 'prepare') return researchPrepare(args);
  if (sub === 'run') return researchRun(args);
  if (sub === 'status') return researchStatus(args);
  console.error('Usage: sks research <prepare|run|status>');
  process.exitCode = 1;
}

export async function qaLoopCommand(sub, args) {
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

Prompt route:
  $QA-LOOP dogfood UI/API, fix safe issues, reverify

UI evidence:
  Codex Computer Use only for UI-level E2E and visual evidence; do not use Chrome MCP, Browser Use, Playwright, Selenium, Puppeteer, or other browser automation as UI verification evidence.
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
  console.log('QA-LOOP could not auto-seal because required safe defaults were unavailable.');
  console.log(`Answer schema: ${path.relative(root, path.join(dir, 'required-answers.schema.json'))}`);
  console.log('Inspect the schema and provide answers with: sks qa-loop answer <mission-id> answers.json');
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
  console.log(`Hash: ${result.contract.sealed_hash}`);
  console.log(`Checklist: ${artifactResult.checklist_count} cases`);
  console.log(`Report: ${path.relative(root, path.join(dir, artifactResult.report_file))}`);
  console.log(`Run: sks qa-loop run ${id} --max-cycles ${answers.MAX_QA_CYCLES || 8}`);
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
    const gate = await writeMockQaResult(dir, mission, contract);
    await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: gate.passed ? 'QALOOP_DONE' : 'QALOOP_PAUSED', questions_allowed: true });
    console.log(`Mock QA-LOOP done: ${id}`);
    console.log(`Gate: ${gate.passed ? 'passed' : 'blocked'}`);
    return;
  }
  const codex = await getCodexInfo();
  if (!codex.bin) {
    console.error('Codex CLI not found. Running mock QA-LOOP instead.');
    const gate = await writeMockQaResult(dir, mission, contract);
    await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: gate.passed ? 'QALOOP_DONE' : 'QALOOP_PAUSED', questions_allowed: true });
    console.log(`Mock QA-LOOP done: ${id}`);
    return;
  }
  let last = '';
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const cycleDir = path.join(dir, 'qa-loop', `cycle-${cycle}`);
    const outputFile = path.join(cycleDir, 'final.md');
    const prompt = buildQaLoopPrompt({ id, mission, contract, cycle, previous: last, reportFile });
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.cycle.start', cycle });
    const result = await runCodexExec({ root, prompt, outputFile, json: true, profile: 'sks-logic-high', logDir: cycleDir });
    await writeJsonAtomic(path.join(cycleDir, 'process.json'), { code: result.code, stdout_tail: result.stdout, stderr_tail: result.stderr, stdout_bytes: result.stdoutBytes, stderr_bytes: result.stderrBytes, truncated: result.truncated, timed_out: result.timedOut });
    last = await safeReadText(outputFile, result.stdout || result.stderr || '');
    if (containsUserQuestion(last)) {
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.guard.question_blocked', cycle });
      last = `${last}\n\n${noQuestionContinuationReason()}`;
      continue;
    }
    const gate = await evaluateQaGate(dir);
    if (gate.passed) {
      await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_DONE', questions_allowed: true });
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.done', cycle });
      console.log(`QA-LOOP done: ${id}`);
      return;
    }
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'qaloop.cycle.continue', cycle, reasons: gate.reasons });
  }
  await setCurrent(root, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_PAUSED_MAX_CYCLES', questions_allowed: true });
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

async function researchPrepare(args) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const prompt = positionalArgs(args).join(' ').trim();
  if (!prompt) throw new Error('Missing research topic.');
  const { id, dir } = await createMission(root, { mode: 'research', prompt });
  const route = ROUTES.find((entry) => entry.id === 'Research') || routePrompt('$Research');
  const context7Required = routeNeedsContext7(route, prompt);
  const reasoning = routeReasoning(route, prompt);
  const plan = await writeResearchPlan(dir, prompt, { depth: readFlagValue(args, '--depth', 'frontier') });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: prompt, required: context7Required, ambiguity: { required: false, status: 'direct_research_cli' } });
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route: route.id,
    route_command: route.command,
    command: route.command,
    mode: route.mode,
    task: prompt,
    required_skills: route.requiredSkills,
    context7_required: context7Required,
    subagents_required: routeRequiresSubagents(route, prompt),
    reflection_required: reflectionRequiredForRoute(route),
    original_stop_gate: route.stopGate,
    stop_gate: route.stopGate,
    clarification_gate: false,
    pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok,
    pipeline_plan_path: PIPELINE_PLAN_ARTIFACT,
    goal_continuation: pipelinePlan.goal_continuation
  });
  await setCurrent(root, {
    mission_id: id,
    route: route.id,
    route_command: route.command,
    mode: route.mode,
    phase: 'RESEARCH_PREPARED',
    questions_allowed: false,
    implementation_allowed: false,
    context7_required: context7Required,
    context7_verified: false,
    subagents_required: routeRequiresSubagents(route, prompt),
    subagents_verified: false,
    reflection_required: reflectionRequiredForRoute(route),
    visible_progress_required: true,
    context_tracking: 'triwiki',
    required_skills: route.requiredSkills,
    stop_gate: route.stopGate,
    reasoning_effort: reasoning.effort,
    reasoning_profile: reasoning.profile,
    reasoning_temporary: true,
    goal_continuation: pipelinePlan.goal_continuation,
    pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok,
    pipeline_plan_path: PIPELINE_PLAN_ARTIFACT,
    prompt
  });
  console.log(`Research mission created: ${id}`);
  console.log(`Methodology: ${plan.methodology}`);
  console.log(`Plan: ${path.relative(root, path.join(dir, 'research-plan.md'))}`);
  console.log(`Pipeline: ${path.relative(root, path.join(dir, PIPELINE_PLAN_ARTIFACT))}`);
  console.log(`Paper: ${researchPaperArtifactForPlan(plan)}`);
  console.log(`Genius summary: ${RESEARCH_GENIUS_SUMMARY_ARTIFACT}`);
  console.log(`Source skill: ${RESEARCH_SOURCE_SKILL_ARTIFACT}`);
  console.log('Ledgers: source-ledger.json, scout-ledger.json, debate-ledger.json, novelty-ledger.json, falsification-ledger.json');
  console.log(`Run: sks research run ${id} --max-cycles ${RESEARCH_DEFAULT_MAX_CYCLES} --cycle-timeout-minutes ${RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES}`);
  console.log('Loop: Research runs until the gate records unanimous scout consensus, or pauses at the explicit safety cap.');
}

async function researchRun(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks research run <mission-id|latest> [--mock] [--max-cycles N] [--cycle-timeout-minutes N]');
  const { dir, mission } = await loadMission(root, id);
  const planPath = path.join(dir, 'research-plan.json');
  if (!(await exists(planPath))) await writeResearchPlan(dir, mission.prompt || '', {});
  const plan = await readJson(planPath);
  const dbScan = await scanDbSafety(root);
  if (!dbScan.ok) {
    console.error('Research cannot run: DB Guardian found unsafe Supabase/MCP/database configuration.');
    console.error(JSON.stringify(dbScan.findings, null, 2));
    process.exitCode = 2;
    return;
  }
  const maxCycles = readMaxCycles(args, RESEARCH_DEFAULT_MAX_CYCLES);
  const cycleTimeoutMinutes = readResearchCycleTimeoutMinutes(args);
  const cycleTimeoutMs = cycleTimeoutMinutes * 60 * 1000;
  const mock = flag(args, '--mock');
  await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_RUNNING_NO_QUESTIONS', questions_allowed: false, implementation_allowed: false, research_real_run_required: !mock, research_cycle_timeout_minutes: cycleTimeoutMinutes });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.run.started', maxCycles, mock, cycleTimeoutMinutes, real_run_required: !mock });
  if (mock) {
    const gate = await writeMockResearchResult(dir, plan);
    await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: gate.passed ? 'RESEARCH_DONE' : 'RESEARCH_PAUSED', questions_allowed: true, implementation_allowed: false });
    console.log(`Mock research done: ${id}`);
    console.log(`Gate: ${gate.passed ? 'passed' : 'blocked'}`);
    return;
  }
  const codex = await getCodexInfo();
  if (!codex.bin) {
    const blocker = {
      schema_version: 1,
      mission_id: id,
      ts: nowIso(),
      phase: 'RESEARCH_BLOCKED_REAL_RUN_REQUIRED',
      reason: 'Codex CLI not found; normal Research cannot fall back to mock output.',
      required_action: 'Install/configure the Codex CLI or set SKS_CODEX_BIN to a valid executable, then rerun sks research run without --mock.',
      mock_policy: '--mock is allowed only for selftests and dry harness checks.',
      implementation_allowed: false
    };
    await writeJsonAtomic(path.join(dir, 'research-blocker.json'), blocker);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: blocker.ts, type: 'research.blocked.real_run_required', reason: blocker.reason, blocker: 'research-blocker.json' });
    await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_REAL_RUN_REQUIRED', questions_allowed: true, implementation_allowed: false, research_real_run_required: true, blocker: 'research-blocker.json' });
    console.error('Research cannot run real sources: Codex CLI not found.');
    console.error('Mock fallback is disabled for normal Research. Use --mock only for selftests, or install/configure Codex CLI/SKS_CODEX_BIN.');
    process.exitCode = 2;
    return;
  }
  let last = '';
  const researchCodexArgs = ['-c', 'service_tier="fast"', '-c', 'model_reasoning_effort="xhigh"'];
  const sourceMutationBaseline = await researchCodeMutationSnapshot(root, id);
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const cycleDir = path.join(dir, 'research', `cycle-${cycle}`);
    const outputFile = path.join(cycleDir, 'final.md');
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.cycle.start', cycle, timeoutMinutes: cycleTimeoutMinutes, profile: 'sks-research', enforced_reasoning_effort: 'xhigh' });
    const prompt = buildResearchPrompt({ id, mission, plan, cycle, previous: last });
    const result = await runCodexExec({ root, prompt, outputFile, json: true, profile: 'sks-research', extraArgs: researchCodexArgs, logDir: cycleDir, timeoutMs: cycleTimeoutMs });
    await writeJsonAtomic(path.join(cycleDir, 'process.json'), { code: result.code, stdout_tail: result.stdout, stderr_tail: result.stderr, stdout_bytes: result.stdoutBytes, stderr_bytes: result.stderrBytes, truncated: result.truncated, timed_out: result.timedOut });
    const mutation = await researchCodeMutationDelta(root, sourceMutationBaseline, id);
    if (mutation.blocked) {
      const blocker = {
        schema_version: 1,
        mission_id: id,
        ts: nowIso(),
        phase: 'RESEARCH_BLOCKED_CODE_MUTATION',
        reason: 'Research mode must not modify repository source files. Only route-local mission artifacts are allowed.',
        changed_paths: mutation.changed_paths,
        allowed_prefixes: mutation.allowed_prefixes,
        required_action: 'Review the changed paths, keep or revert them manually as appropriate, then rerun Research after the worktree is clean for source files.',
        implementation_allowed: false
      };
      await writeJsonAtomic(path.join(dir, 'research-code-mutation-blocker.json'), blocker);
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: blocker.ts, type: 'research.blocked.code_mutation', changed_paths: mutation.changed_paths });
      await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_CODE_MUTATION', questions_allowed: true, implementation_allowed: false, blocker: 'research-code-mutation-blocker.json' });
      console.error('Research cannot continue: source-code mutation detected outside the route-local mission artifacts.');
      console.error(JSON.stringify(mutation.changed_paths, null, 2));
      process.exitCode = 2;
      return;
    }
    last = await safeReadText(outputFile, result.stdout || result.stderr || '');
    if (containsUserQuestion(last)) {
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.guard.question_blocked', cycle });
      last = `${last}\n\n${noQuestionContinuationReason()}`;
      continue;
    }
    const gate = await evaluateResearchGate(dir);
    if (gate.passed) {
      await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_DONE', questions_allowed: true, implementation_allowed: false });
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.done', cycle });
      await enforceRetention(root).catch(() => {});
      console.log(`Research done: ${id}`);
      return;
    }
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.cycle.continue', cycle, reasons: gate.reasons });
  }
  await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_PAUSED_MAX_CYCLES', questions_allowed: true, implementation_allowed: false });
  console.log(`Research paused after max cycles without unanimous scout consensus: ${id}`);
}

async function researchStatus(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks research status <mission-id|latest>');
  const { dir, mission } = await loadMission(root, id);
  const state = await readJson(stateFile(root), {});
  const gate = await readJson(path.join(dir, 'research-gate.evaluated.json'), await readJson(path.join(dir, 'research-gate.json'), null));
  const ledger = await readJson(path.join(dir, 'novelty-ledger.json'), null);
  const sourceLedger = await readJson(path.join(dir, 'source-ledger.json'), null);
  const scoutLedger = await readJson(path.join(dir, 'scout-ledger.json'), null);
  const debateLedger = await readJson(path.join(dir, 'debate-ledger.json'), null);
  const falsificationLedger = await readJson(path.join(dir, 'falsification-ledger.json'), null);
  const sourceSkillText = await readText(path.join(dir, RESEARCH_SOURCE_SKILL_ARTIFACT), '');
  const geniusSummaryText = await readText(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT), '');
  const plan = await readJson(path.join(dir, 'research-plan.json'), null);
  const paperArtifact = await findResearchPaperArtifact(dir, plan);
  const paperText = paperArtifact.exists ? await readText(paperArtifact.path, '') : '';
  const scoutRows = Array.isArray(scoutLedger?.scouts) ? scoutLedger.scouts : [];
  const sourceLayerRows = Array.isArray(sourceLedger?.source_layers) ? sourceLedger.source_layers : [];
  const sourceLayersCovered = sourceLayerRows.filter((layer) => layer.status === 'covered' && ((Array.isArray(layer.source_ids) && layer.source_ids.length) || (Array.isArray(layer.counterevidence_ids) && layer.counterevidence_ids.length))).length;
  console.log(JSON.stringify({
    mission,
    state,
    gate,
    novelty_entries: ledger?.entries?.length ?? null,
    source_entries: sourceLedger?.sources?.length ?? null,
    source_layers_required: sourceLayerRows.length || gate?.metrics?.source_layers_required || gate?.source_layers_required || null,
    source_layers_covered: gate?.metrics?.source_layers_covered ?? gate?.source_layers_covered ?? (sourceLayerRows.length ? sourceLayersCovered : null),
    triangulation_checks: sourceLedger?.triangulation?.cross_layer_checks?.length ?? gate?.metrics?.triangulation_checks ?? gate?.triangulation_checks ?? null,
    genius_opinion_summaries: gate?.metrics?.genius_opinion_summaries ?? gate?.genius_opinion_summaries ?? (geniusSummaryText.trim() ? countGeniusOpinionSummaries(geniusSummaryText) : null),
    counterevidence_sources: sourceLedger?.counterevidence_sources?.length ?? null,
    xhigh_scouts: scoutRows.length ? scoutRows.filter((scout) => scout.effort === 'xhigh').length : null,
    eureka_moments: scoutRows.length ? scoutRows.filter((scout) => scout.eureka?.exclamation === 'Eureka!' && String(scout.eureka?.idea || '').trim()).length : null,
    scout_findings: scoutRows.length ? scoutRows.reduce((sum, scout) => sum + (Array.isArray(scout.findings) ? scout.findings.length : 0), 0) : null,
    debate_exchanges: debateLedger?.exchanges?.length ?? null,
    consensus_iterations: gate?.metrics?.consensus_iterations ?? gate?.consensus_iterations ?? debateLedger?.consensus_iterations ?? null,
    unanimous_consensus: gate?.metrics?.unanimous_consensus ?? gate?.unanimous_consensus ?? debateLedger?.unanimous_consensus ?? false,
    research_source_skill_present: Boolean(sourceSkillText.trim()),
    genius_opinion_summary_present: Boolean(geniusSummaryText.trim()),
    research_paper_artifact: paperArtifact.name,
    paper_present: Boolean(paperText.trim()),
    paper_sections: countResearchPaperSections(paperText),
    falsification_cases: falsificationLedger?.cases?.length ?? null
  }, null, 2));
}

async function goalCreate(args) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const prompt = promptOf(args);
  if (!prompt) throw new Error('Missing goal task prompt.');
  const { id, dir, mission } = await createMission(root, { mode: 'goal', prompt });
  const workflow = await writeGoalWorkflow(dir, mission, { action: 'create', prompt });
  await setCurrent(root, { mission_id: id, mode: 'GOAL', route: 'Goal', route_command: '$Goal', phase: 'GOAL_READY', questions_allowed: true, implementation_allowed: true, native_goal: workflow.native_goal, stop_gate: 'none' }, { replace: true });
  console.log(`Goal mission created: ${id}`);
  console.log(`Artifact: ${path.relative(root, path.join(dir, GOAL_WORKFLOW_ARTIFACT))}`);
  console.log(`Bridge: ${path.relative(root, path.join(dir, GOAL_BRIDGE_ARTIFACT))}`);
  console.log(`Native Codex control: ${workflow.native_goal.slash_command}`);
}

async function goalControl(action, args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error(`Usage: sks goal ${action} <mission-id|latest>`);
  const { dir } = await loadMission(root, id);
  const workflow = await updateGoalWorkflow(dir, action);
  await setCurrent(root, { mission_id: id, mode: 'GOAL', route: 'Goal', route_command: '$Goal', phase: `GOAL_${String(action).toUpperCase()}`, native_goal: workflow.native_goal, questions_allowed: true, implementation_allowed: action !== 'pause' && action !== 'clear', stop_gate: 'none' }, { replace: true });
  console.log(`Goal ${action}: ${id}`);
  console.log(`Native Codex control: ${workflow.native_goal.slash_command}`);
}

async function goalStatus(args) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks goal status <mission-id|latest>');
  const { dir, mission } = await loadMission(root, id);
  const state = await readJson(stateFile(root), {});
  const workflow = await readJson(path.join(dir, GOAL_WORKFLOW_ARTIFACT), null);
  console.log(JSON.stringify({ mission, state, goal_workflow: workflow }, null, 2));
}


function formatQuestionsForCli(schema) {
  return schema.slots.map((s, i) => {
    const options = s.options ? ` Options: ${s.options.join(', ')}.` : '';
    const examples = s.examples ? ` Examples: ${s.examples.join(', ')}.` : '';
    return `${i + 1}. ${s.id}: ${s.question}${options}${examples}`;
  }).join('\n');
}

async function safeReadText(file, fallback = '') {
  try { return await fsp.readFile(file, 'utf8'); } catch { return fallback; }
}

async function researchCodeMutationSnapshot(root, missionId = null) {
  const tracked = await runProcess('git', ['ls-files'], { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  const status = await runProcess('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (tracked.code !== 0 || status.code !== 0) return { ok: false, reason: 'git_unavailable', hashes: {}, status_rows: [], error: tracked.stderr || status.stderr };
  const allowedPrefixes = researchAllowedMutationPrefixes(missionId);
  const hashes = {};
  for (const rel of tracked.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    if (researchMutationAllowedPath(rel, allowedPrefixes)) continue;
    const file = path.join(root, rel);
    try {
      const bytes = await fsp.readFile(file);
      hashes[rel] = createHash('sha256').update(bytes).digest('hex');
    } catch {
      hashes[rel] = null;
    }
  }
  return {
    ok: true,
    hashes,
    status_rows: status.stdout.split(/\r?\n/).filter(Boolean),
    allowed_prefixes: allowedPrefixes
  };
}

async function researchCodeMutationDelta(root, baseline, missionId) {
  if (!baseline?.ok) return { blocked: false, changed_paths: [], reason: baseline?.reason || 'baseline_unavailable' };
  const current = await researchCodeMutationSnapshot(root, missionId);
  if (!current.ok) return { blocked: false, changed_paths: [], reason: current.reason || 'current_snapshot_unavailable' };
  const changed = new Set();
  for (const [rel, hash] of Object.entries(current.hashes)) {
    if (baseline.hashes[rel] !== hash) changed.add(rel);
  }
  for (const rel of Object.keys(baseline.hashes)) {
    if (!(rel in current.hashes)) changed.add(rel);
  }
  const baselineRows = new Set(baseline.status_rows || []);
  for (const row of current.status_rows || []) {
    if (baselineRows.has(row)) continue;
    const rel = porcelainStatusPath(row);
    if (rel && !researchMutationAllowedPath(rel, current.allowed_prefixes)) changed.add(rel);
  }
  const changedPaths = [...changed].sort();
  return {
    blocked: changedPaths.length > 0,
    changed_paths: changedPaths,
    allowed_prefixes: current.allowed_prefixes
  };
}

function researchAllowedMutationPrefixes(missionId = null) {
  return missionId ? [`.sneakoscope/missions/${missionId}/`] : ['.sneakoscope/missions/'];
}

function researchMutationAllowedPath(rel = '', prefixes = []) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

function porcelainStatusPath(row = '') {
  const payload = String(row || '').slice(3).trim();
  if (!payload) return '';
  const renamed = payload.split(' -> ').pop();
  return String(renamed || '').replace(/^"|"$/g, '');
}

function readBoundedIntegerFlag(args, name, fallback, min, max) {
  const i = args.indexOf(name);
  const raw = i >= 0 && args[i + 1] ? Number(args[i + 1]) : Number(fallback);
  if (!Number.isFinite(raw)) return Math.max(min, Number.parseInt(fallback, 10) || min);
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function readMaxCycles(args, fallback) {
  return readBoundedIntegerFlag(args, '--max-cycles', fallback, 1, 50);
}

function readResearchCycleTimeoutMinutes(args) {
  return readBoundedIntegerFlag(args, '--cycle-timeout-minutes', RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES, RESEARCH_MIN_CYCLE_TIMEOUT_MINUTES, RESEARCH_MAX_CYCLE_TIMEOUT_MINUTES);
}

export async function goalCommand(sub, args) {
  const known = new Set(['create', 'pause', 'resume', 'clear', 'status', 'help', '--help', '-h']);
  const action = known.has(sub) ? sub : 'create';
  const actionArgs = action === 'create' && sub && !known.has(sub) ? [sub, ...args] : args;
  if (action === 'create') return goalCreate(actionArgs);
  if (action === 'pause' || action === 'resume' || action === 'clear') return goalControl(action, actionArgs);
  if (action === 'status') return goalStatus(actionArgs);
  console.log(`SKS Goal

Usage:
  sks goal create "task"
  sks goal pause <mission-id|latest>
  sks goal resume <mission-id|latest>
  sks goal clear <mission-id|latest>
  sks goal status <mission-id|latest>

Prompt route:
  $Goal persist this workflow with Codex native /goal continuation
`);
}

export async function profileCommand(sub, args) {
  const root = await sksRoot();
  if (sub === 'show') return console.log(JSON.stringify(await readJson(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: 'gpt-5.5', reasoning_effort: 'medium' }), null, 2));
  if (sub === 'set') {
    const effort = args[0] || 'medium';
    if (!ALLOWED_REASONING_EFFORTS.has(effort)) throw new Error(`unsupported reasoning effort: ${effort}; use low, medium, high, or xhigh`);
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'model', 'current.json'), { model: 'gpt-5.5', reasoning_effort: effort, set_at: nowIso() });
    return console.log(`Model profile set: gpt-5.5 ${effort}`);
  }
  console.error('Usage: sks profile show|set <low|medium|high|xhigh>');
}

export async function hproofCommand(sub, args) {
  if (sub !== 'check') return console.error('Usage: sks hproof check [mission-id]');
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('No mission found.');
  console.log(JSON.stringify(await evaluateDoneGate(root, id), null, 2));
}

export async function dbCommand(sub, args = []) {
  const root = await sksRoot();
  if (sub === 'policy') {
    console.log(JSON.stringify(await loadDbSafetyPolicy(root), null, 2));
    return;
  }
  if (sub === 'scan') {
    const report = await scanDbSafety(root, { includeMigrations: flag(args, '--migrations') });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 2;
    return;
  }
  if (sub === 'mcp-config') {
    const projectIdx = args.indexOf('--project-ref');
    const featuresIdx = args.indexOf('--features');
    const projectRef = projectIdx >= 0 ? args[projectIdx + 1] : '<project_ref>';
    const features = featuresIdx >= 0 ? args[featuresIdx + 1] : 'database,docs';
    console.log(JSON.stringify(safeSupabaseMcpConfig({ projectRef, readOnly: true, features }), null, 2));
    return;
  }
  if (sub === 'classify' || sub === 'check') {
    const sqlIdx = args.indexOf('--sql');
    const commandIdx = args.indexOf('--command');
    const fileIdx = args.indexOf('--file');
    let result;
    if (fileIdx >= 0 && args[fileIdx + 1]) result = await checkSqlFile(path.resolve(args[fileIdx + 1]));
    else if (commandIdx >= 0 && args[commandIdx + 1]) result = classifyCommand(args[commandIdx + 1]);
    else if (sqlIdx >= 0 && args[sqlIdx + 1]) result = classifySql(args[sqlIdx + 1]);
    else if (sub === 'check' && args[0]) result = await checkSqlFile(path.resolve(args[0]));
    else result = classifySql(args.join(' ').trim());
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = ['destructive', 'write', 'possible_db'].includes(result.level) ? 2 : 0;
    return;
  }
  if (sub === 'scan-payload') {
    const raw = await readStdin();
    const payload = raw.trim() ? JSON.parse(raw) : {};
    const decision = await checkDbOperation(root, {}, payload, { duringNoQuestion: false });
    console.log(JSON.stringify(decision, null, 2));
    process.exitCode = decision.action === 'block' ? 2 : 0;
    return;
  }
  console.error('Usage: sks db policy | db scan [--migrations] | db mcp-config --project-ref <id> | db check --sql "..." | db check --command "..." | db check --file file.sql');
  process.exitCode = 1;
}

export async function validateArtifactsCommand(args = []) {
  const root = await sksRoot();
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest';
  const id = await resolveMissionId(root, missionArg);
  const loaded = id ? await loadMission(root, id) : null;
  const targetDir = loaded ? loaded.dir : root;
  const requiredRaw = readFlagValue(args, '--required', '');
  const required = requiredRaw === 'all'
    ? Object.keys(ARTIFACT_FILES)
    : String(requiredRaw || '').split(',').map((x) => x.trim()).filter(Boolean);
  const report = await writeValidationReport(targetDir, { required });
  const missionMode = String(loaded?.mission?.mode || '').toLowerCase();
  if (missionMode === 'research' || await exists(path.join(targetDir, 'research-gate.json'))) {
    const researchGate = await evaluateResearchGate(targetDir);
    report.route_gate = {
      route: 'Research',
      ok: researchGate.passed === true,
      gate_file: 'research-gate.evaluated.json',
      reasons: researchGate.reasons || []
    };
    if (!report.route_gate.ok) {
      report.ok = false;
      report.errors = [...(report.errors || []), ...report.route_gate.reasons.map((reason) => `research-gate:${reason}`)];
    }
    await writeJsonAtomic(path.join(targetDir, 'artifact-validation.json'), report);
  }
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log(`Artifact validation: ${report.ok ? 'pass' : 'fail'}`);
  console.log(`Target: ${path.relative(root, targetDir) || '.'}`);
  if (report.route_gate) console.log(`Route gate: ${report.route_gate.route} ${report.route_gate.ok ? 'pass' : `fail (${report.route_gate.reasons.join(', ')})`}`);
  if (report.missing.length) console.log(`Missing: ${report.missing.join(', ')}`);
  for (const [schema, result] of Object.entries(report.results)) console.log(`${schema}: ${result.ok ? 'pass' : `fail (${result.errors.join(', ')})`}`);
  if (!report.ok) process.exitCode = 2;
}

export async function perfCommand(sub, args = []) {
  if (!['run', 'workflow'].includes(sub)) {
    console.error('Usage: sks perf run|workflow [--json] [--iterations N] [--intent "task"] [--changed file1,file2]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  if (sub === 'workflow') {
    const changedRaw = readFlagValue(args, '--changed', null);
    const report = await runWorkflowPerfBench(root, {
      iterations: readFlagValue(args, '--iterations', 3),
      intent: readFlagValue(args, '--intent', positionalArgs(args).join(' ')),
      changedFiles: changedRaw ? changedRaw.split(',').filter(Boolean) : undefined
    });
    const outPath = path.join(root, '.sneakoscope', 'reports', `workflow-perf-${Date.now()}.json`);
    await writeJsonAtomic(outPath, report);
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: outPath }, null, 2));
    console.log('SKS Workflow Performance');
    console.log(`Mode: ${report.metrics.decision_mode}`);
    console.log(`Fast lane: ${report.metrics.fast_lane_eligible ? 'yes' : 'no'}`);
    console.log(`Proof Field p95: ${report.metrics.proof_field_build_ms_p95}ms`);
    console.log(`Contract clarity: ${report.metrics.contract_clarity_score}`);
    console.log(`Workflow complexity: ${report.metrics.workflow_complexity_band} (${report.metrics.workflow_complexity_score})`);
    console.log(`Proof cones: ${report.metrics.proof_cone_count}`);
    console.log(`Negative work skipped: ${report.metrics.negative_work_skipped_count}`);
    console.log(`Next: ${report.recommendation.next.join('; ')}`);
    console.log(`Report: ${path.relative(root, outPath)}`);
    return;
  }
  const report = await runPerfBench(root, { iterations: readFlagValue(args, '--iterations', 3) });
  const outPath = path.join(root, '.sneakoscope', 'reports', `perf-${Date.now()}.json`);
  await writeJsonAtomic(outPath, report);
  if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: outPath }, null, 2));
  console.log('SKS Performance');
  console.log(`CLI startup p95: ${report.metrics.cli_startup_ms_p95}ms`);
  console.log(`Package size: ${report.metrics.package_size_kb}KB`);
  console.log(`Budget file: ${path.relative(root, report.budget_file)}`);
  console.log(`Report: ${path.relative(root, outPath)}`);
}

export async function proofFieldCommand(sub, args = []) {
  const action = sub || 'scan';
  if (!['scan', 'help', '--help'].includes(action)) {
    console.error('Usage: sks proof-field scan [--json] [--intent "task"] [--changed file1,file2]');
    process.exitCode = 1;
    return;
  }
  if (action === 'help' || action === '--help') {
    console.log('Usage: sks proof-field scan [--json] [--intent "task"] [--changed file1,file2]');
    console.log('Build a Potential Proof Field report: proof cones, negative-work cache, and fast-lane eligibility for the current change set.');
    return;
  }
  const root = await sksRoot();
  const changedRaw = readFlagValue(args, '--changed', null);
  const report = await writeProofFieldReport(root, {
    intent: readFlagValue(args, '--intent', positionalArgs(args).join(' ')),
    changedFiles: changedRaw ? changedRaw.split(',').filter(Boolean) : undefined
  });
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Proof Field');
  console.log(`Mode: ${report.fast_lane_decision.mode}`);
  console.log(`Eligible: ${report.fast_lane_decision.eligible ? 'yes' : 'no'}`);
  if (report.fast_lane_decision.blockers.length) console.log(`Blockers: ${report.fast_lane_decision.blockers.join(', ')}`);
  console.log(`Contract clarity: ${report.contract_clarity.score}${report.contract_clarity.ask_recommended ? ' (ask recommended)' : ''}`);
  console.log(`Workflow complexity: ${report.workflow_complexity.band} (${report.workflow_complexity.score})`);
  if (report.team_trigger_matrix.active_triggers.length) console.log(`Team triggers: ${report.team_trigger_matrix.active_triggers.join(', ')}`);
  console.log(`Proof cones: ${report.proof_cones.map((cone) => cone.id).join(', ')}`);
  console.log(`Verification: ${report.fast_lane_decision.verification.join('; ')}`);
  console.log(`Report: ${path.relative(root, report.report_path)}`);
}

export async function skillDreamCommand(sub, args = []) {
  const action = sub && !String(sub).startsWith('--') ? sub : 'status';
  const actionArgs = action === sub ? args : [sub, ...args].filter(Boolean);
  if (!['status', 'run', 'record', 'help', '--help'].includes(action)) {
    console.error('Usage: sks skill-dream status|run|record [--json]');
    process.exitCode = 1;
    return;
  }
  if (action === 'help' || action === '--help') {
    console.log('Usage: sks skill-dream status|run|record [--json]');
    console.log('Records cheap generated-skill usage counters and periodically reports keep, merge, prune, and improvement candidates. Reports never delete skills automatically.');
    return;
  }
  const root = await sksRoot();
  if (action === 'record') {
    const skills = readFlagValue(actionArgs, '--skills', '').split(',').map((x) => x.trim()).filter(Boolean);
    const result = await recordSkillDreamEvent(root, {
      route: readFlagValue(actionArgs, '--route', positionalArgs(actionArgs).join(' ') || 'manual'),
      command: readFlagValue(actionArgs, '--command', null),
      required_skills: skills,
      prompt_signature: readFlagValue(actionArgs, '--prompt-signature', null)
    }, { known_skill_names: knownGeneratedSkillNames() });
    if (flag(actionArgs, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Skill Dream Record');
    console.log(`Events since last run: ${result.state.counters.events_since_last_run}`);
    console.log(`Due: ${result.due.due ? 'yes' : 'no'} (${result.due.reason_codes.join(', ')})`);
    if (result.report) console.log(`Report: ${path.relative(root, result.report.report_path)}`);
    return;
  }
  if (action === 'run') {
    const report = await runSkillDream(root, { force: true, known_skill_names: knownGeneratedSkillNames() });
    if (flag(actionArgs, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('SKS Skill Dream');
    console.log(`Inventory: ${report.inventory.total} skills (${report.inventory.generated} generated, ${report.inventory.unknown_or_user} unknown/user)`);
    console.log(`Keep: ${report.keep.length}`);
    console.log(`Merge candidates: ${report.merge_candidates.length}`);
    console.log(`Prune candidates: ${report.prune_candidates.length}`);
    console.log(`Improve candidates: ${report.improve_candidates.length}`);
    console.log(`Apply mode: ${report.apply_mode}; no auto delete: ${report.no_auto_delete ? 'yes' : 'no'}`);
    console.log(`Report: ${path.relative(root, report.report_path)}`);
    return;
  }
  const state = await loadSkillDreamState(root);
  if (flag(actionArgs, '--json')) return console.log(JSON.stringify(state, null, 2));
  console.log('SKS Skill Dream Status');
  console.log(`State: .sneakoscope/skills/dream-state.json`);
  console.log(`Events since last run: ${state.counters.events_since_last_run}/${state.policy.min_events_between_runs}`);
  console.log(`Cooldown: ${state.policy.min_interval_hours}h`);
  console.log(`Last run: ${state.last_run_at || 'never'}`);
  console.log(`Next: ${state.next_run?.due ? 'due' : (state.next_run?.reason_codes || ['not due']).join(', ')}`);
}

export async function harnessCommand(sub, args = []) {
  const action = sub || 'fixture';
  if (!['fixture', 'review'].includes(action)) {
    console.error('Usage: sks harness fixture|review [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  const report = action === 'review'
    ? await writeHarnessGrowthReport(root, path.join(root, '.sneakoscope', 'reports'), {})
    : harnessGrowthReport({});
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Harness Growth');
  console.log(`Forgetting fixture: ${report.forgetting.fixture.passed ? 'pass' : 'fail'}`);
  console.log(`tmux views: ${report.tmux.views.length}`);
  console.log(`Tool taxonomy: ${report.reliability.tool_error_taxonomy.join(', ')}`);
  console.log(`Unknown errors recorded as bugs: ${report.reliability.unknown_errors_are_bugs ? 'yes' : 'no'}`);
}

export async function codeStructureCommand(sub, args = []) {
  const action = sub || 'scan';
  if (action !== 'scan') {
    console.error('Usage: sks code-structure scan [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  const report = await scanCodeStructure(root, { includeOk: flag(args, '--all') });
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Code Structure');
  for (const file of report.files.slice(0, 20)) console.log(`${file.status} ${file.line_count} ${file.path}`);
  if (report.remaining_risks.length) console.log(`Risks: ${report.remaining_risks.join(', ')}`);
}

export async function evalCommand(sub, args) {
  if (!sub || sub === 'help' || sub === '--help') {
    console.log('Usage: sks eval run [--json] [--out report.json] [--iterations N] | sks eval compare --baseline old.json --candidate new.json [--json]');
    return;
  }
  if (sub === 'thresholds') return console.log(JSON.stringify(DEFAULT_EVAL_THRESHOLDS, null, 2));
  const root = await sksRoot();
  if (sub === 'run') {
    const iterations = Number(readFlagValue(args, '--iterations', 200));
    const report = runEvaluationBenchmark({ iterations });
    const saved = await saveEvalReport(root, args, report, 'eval');
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: saved }, null, 2));
    printEvalRun(report, saved);
    return;
  }
  if (sub === 'compare') {
    const positional = positionalArgs(args);
    const baselinePath = readFlagValue(args, '--baseline', positional[0]);
    const candidatePath = readFlagValue(args, '--candidate', positional[1]);
    if (!baselinePath || !candidatePath) throw new Error('Usage: sks eval compare --baseline old.json --candidate new.json [--json]');
    const report = compareEvaluationReports(await readJson(path.resolve(baselinePath)), await readJson(path.resolve(candidatePath)));
    const saved = await saveEvalReport(root, args, report, 'eval-compare');
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: saved }, null, 2));
    printEvalCompare(report, saved);
    return;
  }
  console.error('Usage: sks eval run|compare|thresholds');
  process.exitCode = 1;
}

export async function wikiCommand(sub, args = []) {
  if (!sub || sub === 'help' || sub === '--help') {
    console.log('Usage: sks wiki coords --rgba R,G,B,A | sks wiki pack [--json] [--role worker|verifier] [--max-anchors N] | sks wiki refresh [--json] [--role worker|verifier] [--max-anchors N] [--prune] [--dry-run] | sks wiki sweep [mission-id|latest] [--json] | sks wiki prune [--json] [--dry-run] | sks wiki validate [context-pack.json] [--json]');
    return;
  }
  if (sub === 'coords') {
    const raw = readFlagValue(args, '--rgba', positionalArgs(args)[0] || '');
    const parts = String(raw).split(/[,\s]+/).filter(Boolean).map((x) => Number.parseInt(x, 10));
    if (parts.length < 3) throw new Error('Usage: sks wiki coords --rgba R,G,B,A');
    const coord = rgbaToWikiCoord({ r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 255 });
    console.log(JSON.stringify({ rgba: coord.rgba, rgba_key: rgbaKey(coord.rgba), coord }, null, 2));
    return;
  }
  if (sub === 'pack') {
    const root = await sksRoot();
    const { pack, file } = await writeWikiContextPack(root, args);
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...pack, path: file }, null, 2));
    printWikiPackSummary(root, file, pack);
    return;
  }
  if (sub === 'refresh') {
    const root = await sksRoot();
    const dryRun = flag(args, '--dry-run');
    const { pack, file } = await writeWikiContextPack(root, args, { dryRun });
    const validation = wikiValidationResult(pack);
    const exitCode = validation.result.ok ? 0 : 2;
    const pruneRequested = flag(args, '--prune');
    const pruneResult = pruneRequested
      ? await pruneWikiArtifacts(root, { dryRun })
      : null;
    if (flag(args, '--json')) {
      process.exitCode = exitCode;
      return console.log(JSON.stringify({
        path: file,
        dryRun,
        written: !dryRun,
        claims: pack.claims.length,
        anchors: wikiAnchorCount(pack.wiki),
        attention: wikiAttentionSummary(pack),
        trust_summary: pack.trust_summary,
        validation,
        ...(pruneResult ? { prune: { dryRun: pruneResult.dryRun, scanned: pruneResult.scanned, candidates: pruneResult.candidates, actions: pruneResult.actions } } : {})
      }, null, 2));
    }
    console.log('Sneakoscope LLM Wiki Refresh');
    if (dryRun) console.log('Dry run: context pack was built and validated in memory; no wiki file was written.');
    printWikiPackSummary(root, file, pack);
    console.log(`Validation: ${validation.result.ok ? 'ok' : 'failed'} (${validation.result.checked} anchors, ${validation.trustAnchors} trust anchors)`);
    if (pruneResult) {
      console.log(`${pruneResult.dryRun ? 'Prune dry run' : 'Prune'}: ${pruneResult.candidates} wiki artifact(s), ${pruneResult.scanned} scanned`);
      for (const a of pruneResult.actions.slice(0, 20)) console.log(`- ${a.reason} ${path.relative(root, a.path)} ${a.bytes ? formatBytes(a.bytes) : ''}`.trim());
    } else {
      console.log('Prune: skipped (pass --prune to prune stale/low-trust wiki artifacts)');
    }
    process.exitCode = exitCode;
    return;
  }
  if (sub === 'prune') {
    const root = await sksRoot();
    const pruneResult = await pruneWikiArtifacts(root, { dryRun: flag(args, '--dry-run') });
    if (flag(args, '--json')) {
      return console.log(JSON.stringify({
        dryRun: pruneResult.dryRun,
        scanned: pruneResult.scanned,
        candidates: pruneResult.candidates,
        actions: pruneResult.actions
      }, null, 2));
    }
    console.log('Sneakoscope LLM Wiki Prune');
    console.log(`${pruneResult.dryRun ? 'Dry run' : 'Pruned'}: ${pruneResult.candidates} wiki artifact(s), ${pruneResult.scanned} scanned`);
    for (const a of pruneResult.actions.slice(0, 20)) console.log(`- ${a.reason} ${path.relative(root, a.path)} ${a.bytes ? formatBytes(a.bytes) : ''}`.trim());
    if (pruneResult.actions.length > 20) console.log(`... ${pruneResult.actions.length - 20} more action(s) omitted`);
    return;
  }
  if (sub === 'sweep') {
    const root = await sksRoot();
    const id = await resolveMissionId(root, positionalArgs(args)[0]);
    const dir = id ? missionDir(root, id) : path.join(root, '.sneakoscope', 'reports');
    const report = await writeMemorySweepReport(root, dir, { missionId: id || 'project-wiki' });
    if (id) {
      await writeSkillForgeReport(dir, { mission_id: id, route: 'wiki', task_signature: 'memory sweep' });
      await writeMistakeMemoryReport(dir, { mission_id: id, route: 'wiki', task: 'memory sweep' });
      await writeCodeStructureReport(root, dir, { missionId: id, exception: 'Generated by wiki sweep; split decisions are reported, not applied automatically.' });
    }
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log('Sneakoscope TriWiki Sweep');
    console.log(`Operations: ${report.operations.length}`);
    console.log(`Forget queue: ${report.operations.filter((op) => ['DEMOTE', 'SOFT_FORGET', 'ARCHIVE', 'HARD_DELETE', 'CONSOLIDATE'].includes(op.operation)).length}`);
    console.log(`Budget: ${report.retrieval_budget.actual_tokens}/${report.retrieval_budget.max_tokens} tokens`);
    return;
  }
  if (sub === 'validate') {
    const root = await sksRoot();
    const target = positionalArgs(args)[0] || path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
    const pack = await readJson(path.resolve(target));
    const { result, trustAnchors } = wikiValidationResult(pack);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Wiki coordinate index: ${result.ok ? 'ok' : 'failed'}`);
    console.log(`Anchors checked: ${result.checked}`);
    console.log(`Trust anchors: ${trustAnchors}/${result.checked}`);
    for (const issue of result.issues) console.log(`- ${issue.severity}: ${issue.id}${issue.anchor ? ` ${issue.anchor}` : ''}`);
    process.exitCode = result.ok ? 0 : 2;
    return;
  }
  console.error('Usage: sks wiki coords|pack|refresh|sweep|prune|validate');
  process.exitCode = 1;
}

export async function writeWikiContextPack(root, args = [], opts = {}) {
  const role = readFlagValue(args, '--role', 'worker');
  const maxAnchors = Number(readFlagValue(args, '--max-anchors', role.includes('verifier') ? 48 : 32));
  const pack = contextCapsule({
    mission: { id: 'project-wiki', coord: { rgba: { r: 48, g: 132, b: 212, a: 240 } } },
    role,
    contractHash: null,
    claims: await projectWikiClaims(root),
    q4: { mode: 'project-continuity', package: PACKAGE_VERSION, hydrate: 'anchor-first' },
    q3: ['sks', 'llm-wiki', 'wiki-coordinate', 'gx', 'skills'],
    budget: { maxWikiAnchors: maxAnchors, includeTrustSummary: true }
  });
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  if (!opts.dryRun) {
    await ensureDir(path.dirname(file));
    await writeJsonAtomic(file, pack);
  }
  return { pack, file, role, maxAnchors };
}

export async function migrateWikiContextPack(root) {
  try {
    const { pack } = await writeWikiContextPack(root, ['--max-anchors', '32']);
    return wikiValidationResult(pack).result.ok;
  } catch (err) {
    return false;
  }
}

function wikiAnchorCount(wiki = {}) {
  return (wiki.anchors || wiki.a || []).length;
}

export function wikiVoxelRowCount(wiki = {}) {
  const overlay = wiki.vx || wiki.voxel_overlay || {};
  return (overlay.rows || overlay.v || []).length;
}

function wikiValidationResult(pack = {}) {
  const wikiIndex = pack.wiki || pack;
  const result = validateWikiCoordinateIndex(wikiIndex);
  return { result, trustAnchors: countTrustAnchors(wikiIndex) };
}

function printWikiPackSummary(root, file, pack) {
  console.log('Sneakoscope LLM Wiki Context Pack');
  console.log(`Path:     ${path.relative(root, file)}`);
  console.log(`Claims:   ${pack.claims.length} hydrated text claims`);
  console.log(`Anchors:  ${wikiAnchorCount(pack.wiki)} coordinate anchors (${pack.wiki.overflow_count ?? pack.wiki.o ?? 0} overflow)`);
  console.log(`Voxels:   ${wikiVoxelRowCount(pack.wiki)} metadata rows (${pack.wiki.vx?.s || pack.wiki.vx?.schema || 'none'})`);
  if (pack.attention) console.log(`Attention: use_first=${pack.attention.use_first?.length || 0} hydrate_first=${pack.attention.hydrate_first?.length || 0} (${pack.attention.mode})`);
  console.log(`Schema:   ${pack.wiki.schema}`);
  console.log(`Trust:    avg=${pack.trust_summary.avg} needs_evidence=${pack.trust_summary.needs_evidence}`);
  console.log('Guidance: follow high-trust claims; hydrate source/evidence before relying on lower-trust claims. Stack/version changes require current Context7 or official-doc TriWiki claims before coding.');
  console.log(`Validate: sks wiki validate ${path.relative(root, file)}`);
}

function wikiAttentionSummary(pack = {}) {
  const attention = pack.attention || {};
  return {
    mode: attention.mode || null,
    use_first: Array.isArray(attention.use_first) ? attention.use_first.length : 0,
    hydrate_first: Array.isArray(attention.hydrate_first) ? attention.hydrate_first.length : 0,
    fields: { use_first: ['id', 'rgba', 'h'], hydrate_first: ['id', 'reason'] }
  };
}

function countTrustAnchors(wiki = {}) {
  const rows = Array.isArray(wiki.a)
    ? wiki.a
    : (Array.isArray(wiki.anchors) ? wiki.anchors.map((anchor) => [anchor.id, null, null, null, null, null, null, null, null, anchor.trust_score, anchor.trust_band]) : []);
  return rows.filter((row) => row?.[9] != null && row?.[10]).length;
}

export async function projectWikiClaims(root) {
  const claims = [
    ['wiki-hooks', '.codex/hooks.json routes UserPromptSubmit, tool, permission, and Stop events through SKS guards.', '.codex/hooks.json', 'code', 'high'],
    ['wiki-config', '.codex/config.toml enables Codex App profiles, multi-agent support, and Team agent limits.', '.codex/config.toml', 'code', 'high'],
    ['wiki-skills', '.agents/skills provides official repo-local routes plus support skills for dfix, team, goal, research, autoresearch, db, gx, wiki, reflection, evaluation, design-system/UI editing, and imagegen workflows.', '.agents/skills', 'code', 'medium'],
    ['wiki-agents', '.codex/agents defines Team analysis scout, planning, implementation, DB safety, and QA reviewer roles.', '.codex/agents', 'code', 'medium'],
    ['wiki-policy', '.sneakoscope/policy.json stores update-check, honest-mode, retention, database, performance, and prompt-pipeline policy.', '.sneakoscope/policy.json', 'contract', 'high'],
    ['wiki-memory', '.sneakoscope/memory stores Q0 raw, Q1 evidence, Q2 facts, Q3 tags, and Q4 control bits for hydratable context.', '.sneakoscope/memory', 'wiki', 'high'],
    ['wiki-gx', 'GX cartridges keep vgraph.json and beta.json as deterministic visual context sources with render, validation, drift, and snapshot outputs.', '.sneakoscope/gx/cartridges', 'vgraph', 'medium'],
    ['wiki-db', 'Database safety blocks destructive SQL, risky Supabase commands, unsafe MCP writes, and production data mutation.', '.sneakoscope/db-safety.json', 'code', 'critical'],
    ['wiki-hproof', 'H-Proof blocks completion when unsupported critical claims, DB safety issues, missing tests, or high visual/wiki drift remain.', '.sneakoscope/hproof', 'test', 'critical'],
    ['wiki-eval', 'sks eval run measures token savings, evidence-weighted accuracy proxy, required recall, unsupported critical filtering, and build runtime.', 'src/core/evaluation.mjs', 'test', 'medium'],
    ['wiki-trig', 'TriWiki maps RGBA channels to domain angle, layer radius, phase, and concentration using deterministic trigonometric coordinates.', 'src/core/wiki-coordinate.mjs', 'code', 'high']
  ];
  const out = [];
  for (const [id, text, file, authority, risk] of claims) {
    out.push({
      id,
      text,
      authority,
      risk,
      status: await exists(path.join(root, file)) ? 'supported' : 'unknown',
      freshness: 'fresh',
      source: file,
      file,
      evidence_count: await exists(path.join(root, file)) ? 1 : 0
    });
  }

  const stackPolicy = stackCurrentDocsPolicy();
  out.push({
    id: 'wiki-stack-current-docs-policy',
    text: `When project tech stack, framework, package, runtime, SDK, MCP, or deployment-platform versions change, use Context7 or official vendor docs, write current syntax/security/limit guidance to ${stackPolicy.memory_path}, refresh TriWiki, validate it, and prefer those claims over stale model defaults before coding.`,
    authority: 'contract',
    risk: 'critical',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/routes.mjs',
    file: 'src/core/routes.mjs',
    evidence_count: 3,
    required_weight: 1.35,
    trust_score: 0.95
  });
  out.push({
    id: 'wiki-stack-current-docs-examples',
    text: `Current-doc examples that belong in TriWiki when relevant: Supabase hosted keys prefer sb_publishable_/sb_secret_ over legacy anon/service_role defaults, Next.js 16 uses proxy.ts/proxy.js instead of deprecated middleware convention, and Vercel duration limits such as the 300s Fluid Compute default constrain long-running server work.`,
    authority: 'wiki',
    risk: 'critical',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/routes.mjs',
    file: 'src/core/routes.mjs',
    evidence_count: 4,
    required_weight: 1.25,
    trust_score: 0.92
  });
  out.push({
    id: 'wiki-stack-current-docs-vercel-duration',
    text: 'Vercel Function duration limits are deployment constraints; record current official limits in TriWiki before designing long-running server work, including the 300s Fluid Compute default when applicable.',
    authority: 'wiki',
    risk: 'high',
    status: 'supported',
    freshness: 'fresh',
    source: 'https://vercel.com/docs/functions/limitations',
    file: 'https://vercel.com/docs/functions/limitations',
    evidence_count: 2,
    required_weight: 1.2,
    trust_score: 0.9
  });
  out.push({
    id: 'wiki-aggressive-active-recall',
    text: 'TriWiki should be used aggressively for performance and accuracy: route prompts and worker handoffs should consume attention.use_first for compact high-trust recall and attention.hydrate_first for source hydration of risky or lower-trust claims before decisions.',
    authority: 'code',
    risk: 'high',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/triwiki-attention.mjs',
    file: 'src/core/triwiki-attention.mjs',
    evidence_count: 3,
    required_weight: 1.45,
    trust_score: 0.95
  });
  out.push({
    id: 'wiki-positive-recall-priming-guard',
    text: 'TriWiki compact recall should phrase selected guidance as the positive target behavior; anti-goal or failure-pattern wording should stay hydratable by source/hash instead of being pasted into the active recall text.',
    authority: 'code',
    risk: 'high',
    status: 'supported',
    freshness: 'fresh',
    source: 'src/core/triwiki-attention.mjs',
    file: 'src/core/triwiki-attention.mjs',
    evidence_count: 3,
    required_weight: 1.42,
    trust_score: 0.94
  });
  out.push(...(await memoryWikiClaims(root)));
  out.push(...(await userRequestSignalWikiClaims(root)));
  out.push(...(await teamAnalysisWikiClaims(root)));
  return out;
}

async function memoryWikiClaims(root) {
  const base = path.join(root, '.sneakoscope', 'memory');
  const files = await listMemoryClaimFiles(base);
  const claims = [];
  for (const file of files.slice(0, 80)) {
    const relFile = path.relative(root, file);
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!text.trim()) continue;
    const rows = selectMemoryClaimRows(parseMemoryClaimRows(text, relFile), 48);
    let index = 0;
    for (const row of rows) {
      const source = row.source || relFile;
      const sourceExists = source && (await exists(path.join(root, source)));
      index += 1;
      claims.push({
        id: row.id || `memory-${slugifyClaimId(relFile)}-${index}`,
        text: row.text,
        authority: row.authority || 'wiki',
        risk: row.risk || 'high',
        status: row.status || (sourceExists || source === relFile ? 'supported' : 'unknown'),
        freshness: row.freshness || 'fresh',
        source,
        file: source,
        evidence_count: row.evidence_count ?? (sourceExists ? 2 : 1),
        required_weight: row.required_weight ?? 0.85,
        trust_score: row.trust_score
      });
    }
  }
  return claims;
}

function selectMemoryClaimRows(rows = [], limit = 48) {
  const prepared = (rows || []).map((row, index) => ({ row, index, total: rows.length }));
  if (prepared.length <= limit) return prepared.map((item) => item.row);
  const picked = new Map();
  const add = (item) => {
    if (!item?.row) return;
    const key = item.row.id || `${item.index}:${item.row.text}`;
    if (!picked.has(key)) picked.set(key, item);
  };
  const required = prepared.filter(({ row }) =>
    Number(row.required_weight || 0) >= 0.95
    || Number(row.trust_score || 0) >= 0.9
    || row.risk === 'critical'
    || (row.risk === 'high' && Number(row.evidence_count || 0) >= 3)
  );
  for (const item of required) add(item);
  for (const item of prepared.slice(-12)) add(item);
  const already = new Set([...picked.values()].map((item) => item.index));
  const scored = prepared
    .filter((item) => !already.has(item.index))
    .map((item) => ({ ...item, score: memoryRowPriorityScore(item) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  for (const item of scored) {
    if (picked.size >= limit) break;
    add(item);
  }
  return [...picked.values()]
    .sort((a, b) => a.index - b.index)
    .slice(0, limit)
    .map((item) => item.row);
}

function memoryRowPriorityScore({ row, index, total }) {
  const required = Number(row.required_weight || 0);
  const trust = Number(row.trust_score || 0);
  const evidence = Number(row.evidence_count || 0);
  const recency = total > 1 ? index / (total - 1) : 1;
  const risk = { low: 0, medium: 0.35, high: 0.9, critical: 1.25 }[row.risk || 'medium'] ?? 0.35;
  const freshness = { fresh: 0.45, unknown: 0.1, stale: -0.4 }[row.freshness || 'unknown'] ?? 0.1;
  return required * 8 + trust * 4 + Math.log1p(Math.max(0, evidence)) + recency * 2 + risk + freshness;
}

async function listMemoryClaimFiles(base) {
  const out = [];
  async function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p, depth + 1);
      else if (/\.(md|txt|json)$/i.test(entry.name)) out.push(p);
    }
  }
  await walk(base);
  return out;
}

function parseMemoryClaimRows(text, relFile) {
  if (/\.json$/i.test(relFile)) {
    try {
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.claims) ? parsed.claims : []);
      return rows.map((row) => normalizeMemoryClaimRow(row, relFile)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeMemoryClaimRow(line.replace(/^[-*]\s*/, ''), relFile))
    .filter(Boolean);
}

function normalizeMemoryClaimRow(row, relFile) {
  if (!row) return null;
  if (typeof row === 'object') {
    const text = String(row.text || row.claim || '').trim();
    if (!text) return null;
    return {
      id: row.id ? String(row.id) : null,
      text: text.slice(0, 320),
      source: row.source || row.file || relFile,
      authority: row.authority,
      risk: row.risk,
      status: row.status || row.confidence,
      freshness: row.freshness,
      updated_at: row.updated_at || row.updatedAt || row.created_at || row.createdAt,
      evidence_count: Number.isFinite(Number(row.evidence_count)) ? Number(row.evidence_count) : undefined,
      required_weight: Number.isFinite(Number(row.required_weight)) ? Number(row.required_weight) : undefined,
      trust_score: Number.isFinite(Number(row.trust_score)) ? Number(row.trust_score) : undefined
    };
  }
  const clean = String(row || '').trim();
  if (!/\bclaim\s*:/i.test(clean)) return null;
  const source = extractClaimField(clean, 'source') || extractClaimField(clean, 'file') || extractClaimField(clean, 'path') || relFile;
  const status = extractClaimField(clean, 'status') || extractClaimField(clean, 'confidence');
  return {
    id: extractClaimField(clean, 'id'),
    text: clean.slice(0, 320),
    source,
    authority: extractClaimField(clean, 'authority') || 'wiki',
    risk: extractClaimField(clean, 'risk') || 'high',
    status,
    freshness: extractClaimField(clean, 'freshness') || 'fresh',
    updated_at: extractClaimField(clean, 'updated_at') || extractClaimField(clean, 'updatedAt') || extractClaimField(clean, 'created_at'),
    evidence_count: parseOptionalNumber(extractClaimField(clean, 'evidence_count')),
    required_weight: parseOptionalNumber(extractClaimField(clean, 'required_weight')),
    trust_score: parseOptionalNumber(extractClaimField(clean, 'trust_score'))
  };
}

function extractClaimField(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`\\b${escaped}\\s*[:=]\\s*\\\`?([^\\\`|,;]+)`, 'i'));
  return match ? match[1].trim().replace(/[.;)]$/, '') : null;
}

function parseOptionalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function slugifyClaimId(value) {
  return String(value || 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'claim';
}

async function userRequestSignalWikiClaims(root) {
  const base = path.join(root, '.sneakoscope', 'missions');
  let entries = [];
  try {
    entries = await fsp.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const topics = new Map();
  const strong = [];
  const missionIds = entries.filter((item) => item.isDirectory() && item.name.startsWith('M-')).map((item) => item.name).sort().reverse().slice(0, 120);
  for (const id of missionIds) {
    const mission = await readJson(path.join(base, id, 'mission.json'), null);
    const prompt = String(mission?.prompt || '').trim();
    if (!prompt) continue;
    const signal = userRequestSignal(prompt);
    for (const topic of signal.topics) {
      const current = topics.get(topic) || { count: 0, strong: 0, examples: [] };
      current.count += 1;
      if (signal.intensity >= 1) current.strong += 1;
      if (current.examples.length < 3) current.examples.push(id);
      topics.set(topic, current);
    }
    if (signal.intensity >= 1) strong.push({ id, signal });
  }
  const claims = [];
  for (const [topic, row] of [...topics.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 16)) {
    const weight = Math.min(1.25, 0.45 + row.count * 0.12 + row.strong * 0.18);
    claims.push({
      id: `user-request-frequency-${slugifyClaimId(topic)}`,
      text: `User request topic "${topic}" appeared ${row.count} time(s); repeated topics should be consulted before asking predictable clarification questions.`,
      authority: 'wiki',
      risk: row.strong ? 'high' : 'medium',
      status: 'supported',
      freshness: 'fresh',
      source: '.sneakoscope/missions',
      file: '.sneakoscope/missions',
      evidence_count: row.count,
      request_count: row.count,
      strong_feedback_count: row.strong,
      required_weight: Number(weight.toFixed(2)),
      trust_score: row.strong ? 0.92 : undefined
    });
  }
  for (const item of strong.slice(0, 12)) {
    claims.push({
      id: `user-strong-feedback-${item.id}`,
      text: `Mission ${item.id} contains strong user feedback markers; treat the underlying preference as high-priority context and avoid repeating the same friction.`,
      authority: 'wiki',
      risk: 'high',
      status: 'supported',
      freshness: 'fresh',
      source: `.sneakoscope/missions/${item.id}/mission.json`,
      file: `.sneakoscope/missions/${item.id}/mission.json`,
      evidence_count: item.signal.markers.length,
      request_count: 1,
      strong_feedback_count: 1,
      required_weight: 1.15,
      trust_score: 0.94
    });
  }
  return claims;
}

function userRequestSignal(prompt = '') {
  const lower = String(prompt || '').toLowerCase();
  const markers = [];
  for (const pattern of [/;;+/g, /!!+/g, /\b왜\b/g, /화|짜증|답답|문제|제발|강력|두번다시|자꾸|계속/g]) {
    const found = String(prompt || '').match(pattern);
    if (found) markers.push(...found);
  }
  const topicRules = [
    ['ambiguity-questions', /모호|ambiguity|clarification|질문|답변|answers?\.json|decision-contract|추론|예측/],
    ['triwiki-priority-memory', /triwiki|wiki|메모리|memory|기억|우선|반복|자주|카운팅|count|frequency|weight/],
    ['install-bootstrap', /bootstrap|postinstall|doctor|deps|tmux|homebrew|최초\s*설치|셋업|setup/],
    ['version-release', /버전|version|publish:dry|release|npm\s+pack/],
    ['qa-loop', /qa|e2e|검증|리포트|report/],
    ['team-pipeline', /team|subagent|세션|cleanup|reflection|회고|반성/],
    ['safety-boundary', /삭제|파괴|destructive|production|권한|보안|인증|결제/]
  ];
  const topics = topicRules.filter(([, pattern]) => pattern.test(lower)).map(([topic]) => topic);
  if (!topics.length) topics.push('general-user-preference');
  return { intensity: Math.min(3, markers.length), markers, topics };
}

async function teamAnalysisWikiClaims(root) {
  const base = path.join(root, '.sneakoscope', 'missions');
  let entries = [];
  try {
    entries = await fsp.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const claims = [];
  for (const entry of entries.filter((item) => item.isDirectory() && item.name.startsWith('M-')).map((item) => item.name).sort().reverse().slice(0, 10)) {
    const file = path.join(base, entry, 'team-analysis.md');
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).slice(0, 24);
    let index = 0;
    for (const line of lines) {
      const clean = line.replace(/^[-*]\s*/, '').slice(0, 260);
      if (!clean) continue;
      const source = extractTeamAnalysisSource(clean) || path.relative(root, file);
      const risk = extractTeamAnalysisRisk(clean);
      const sourceExists = source && (await exists(path.join(root, source)));
      index += 1;
      claims.push({
        id: `team-analysis-${entry}-${index}`,
        text: clean,
        authority: 'wiki',
        risk,
        status: sourceExists || source === path.relative(root, file) ? 'supported' : 'unknown',
        freshness: 'fresh',
        source,
        file: source,
        evidence_count: 1,
        required_weight: 0.5
      });
    }
  }
  return claims;
}

function extractTeamAnalysisSource(text) {
  const match = String(text || '').match(/\b(?:source|file|path)\s*[:=]\s*`?([^`|,\s]+)/i);
  return match ? match[1].replace(/[.;)]$/, '') : null;
}

function extractTeamAnalysisRisk(text) {
  const match = String(text || '').match(/\b(critical|high|medium|low)\b/i);
  return match ? match[1].toLowerCase() : 'medium';
}

async function saveEvalReport(root, args, report, prefix) {
  if (flag(args, '--no-save')) return null;
  const requested = readFlagValue(args, '--out', null);
  const file = requested
    ? path.resolve(requested)
    : path.join(root, '.sneakoscope', 'reports', `${prefix}-${nowIso().replace(/[:.]/g, '-')}.json`);
  await ensureDir(path.dirname(file));
  await writeJsonAtomic(file, report);
  return file;
}

function pct(x) {
  return `${(100 * x).toFixed(1)}%`;
}

function printEvalRun(report, saved) {
  const c = report.comparison;
  console.log('Sneakoscope Eval');
  console.log(`Scenario:  ${report.scenario.id}`);
  console.log(`Tokens:    ${report.baseline.estimated_tokens} -> ${report.candidate.estimated_tokens} (${pct(c.token_savings_pct)} saved)`);
  console.log(`Accuracy:  ${report.baseline.quality.accuracy_proxy} -> ${report.candidate.quality.accuracy_proxy} (${c.accuracy_delta >= 0 ? '+' : ''}${c.accuracy_delta})`);
  console.log(`Recall:    ${report.candidate.quality.required_recall}`);
  console.log(`Precision: ${report.baseline.quality.relevance_precision} -> ${report.candidate.quality.relevance_precision}`);
  if (report.candidate.wiki) console.log(`Wiki:      ${report.candidate.wiki.anchors} anchors, valid=${report.candidate.wiki.valid}`);
  console.log(`Build ms:  ${report.baseline.context_build_ms_per_run} -> ${report.candidate.context_build_ms_per_run}`);
  console.log(`Meaningful improvement: ${c.meaningful_improvement ? 'yes' : 'no'}`);
  if (saved) console.log(`Report:    ${saved}`);
}

function printEvalCompare(report, saved) {
  const c = report.comparison;
  console.log('Sneakoscope Eval Compare');
  console.log(`Baseline:  ${report.baseline_label}`);
  console.log(`Candidate: ${report.candidate_label}`);
  console.log(`Tokens:    ${report.baseline.estimated_tokens} -> ${report.candidate.estimated_tokens} (${pct(c.token_savings_pct)} saved)`);
  console.log(`Accuracy:  ${report.baseline.quality.accuracy_proxy} -> ${report.candidate.quality.accuracy_proxy} (${c.accuracy_delta >= 0 ? '+' : ''}${c.accuracy_delta})`);
  console.log(`Meaningful improvement: ${c.meaningful_improvement ? 'yes' : 'no'}`);
  if (saved) console.log(`Report:    ${saved}`);
}

export async function memoryCommand(sub, args) { return gc(args || []); }

export async function gcCommand(args) {
  const root = await sksRoot();
  const res = await enforceRetention(root, { dryRun: flag(args, '--dry-run') });
  if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
  console.log(flag(args, '--dry-run') ? 'ㅅㅋㅅ GC dry run' : 'ㅅㅋㅅ GC completed');
  console.log(`Storage: ${res.report.total_human || '0 B'}`);
  console.log(`Actions: ${res.actions.length}`);
  for (const a of res.actions.slice(0, 20)) console.log(`- ${a.action} ${a.path || a.mission || ''} ${a.bytes ? formatBytes(a.bytes) : ''}`);
}

export async function statsCommand(args) {
  const root = await sksRoot();
  const report = await storageReport(root);
  const pkgBytes = await dirSize(packageRoot()).catch(() => 0);
  const out = { package: { bytes: pkgBytes, human: formatBytes(pkgBytes) }, storage: report };
  if (flag(args, '--json')) return console.log(JSON.stringify(out, null, 2));
  console.log('ㅅㅋㅅ Stats');
  console.log(`Package: ${out.package.human}`);
  console.log(`State:   ${report.total_human || '0 B'}`);
  for (const [name, sec] of Object.entries(report.sections || {})) console.log(`- ${name}: ${sec.human}`);
}

function positionalArgs(args = []) {
  const out = [];
  const valueFlags = new Set(['--format', '--iterations', '--out', '--baseline', '--candidate', '--install-scope', '--max-cycles', '--cycle-timeout-minutes', '--depth', '--scope', '--transport', '--query', '--topic', '--tokens', '--timeout-ms', '--sql', '--command', '--project-ref', '--agent', '--phase', '--message', '--role', '--max-anchors', '--lines', '--intent', '--changed', '--route', '--skills', '--prompt-signature']);
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('--')) out.push(arg);
  }
  return out;
}

function readFlagValue(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function knownGeneratedSkillNames() {
  return Array.from(new Set([...DOLLAR_SKILL_NAMES, ...RECOMMENDED_SKILLS]));
}

function cartridgeName(args, fallback = 'architecture-atlas') {
  const raw = positionalArgs(args)[0] || fallback;
  return String(raw).trim().replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function cartridgeDir(root, name) {
  return path.join(root, '.sneakoscope', 'gx', 'cartridges', name);
}

export function defaultVGraph(name) {
  return {
    id: name,
    title: 'Sneakoscope Context Map',
    version: 1,
    nodes: [
      { id: 'source', label: 'vgraph source', kind: 'source', layer: 'input', status: 'safe' },
      { id: 'contract', label: 'decision contract', kind: 'guard', layer: 'policy', status: 'safe' },
      { id: 'proof', label: 'H-Proof gate', kind: 'guard', layer: 'verification', status: 'safe' }
    ],
    edges: [
      { from: 'source', to: 'contract', label: 'constrains' },
      { from: 'contract', to: 'proof', label: 'verifies' }
    ],
    invariants: [
      'vgraph.json remains the source of truth',
      'rendered SVG hash must match source hash'
    ],
    tests: [
      'sks gx validate',
      'sks gx drift'
    ],
    risks: []
  };
}

export function defaultBeta(name) {
  return {
    id: name,
    version: 1,
    read_order: ['title', 'layers', 'nodes', 'edges', 'invariants', 'tests'],
    renderer: 'sneakoscope-codex-deterministic-svg'
  };
}

export async function gxCommand(sub, args) {
  const root = await sksRoot();
  const name = cartridgeName(args);
  const dir = cartridgeDir(root, name);
  if (sub === 'init') {
    const vgraphPath = path.join(dir, 'vgraph.json');
    const betaPath = path.join(dir, 'beta.json');
    const created = [];
    if (!(await exists(vgraphPath)) || flag(args, '--force')) {
      await writeJsonAtomic(vgraphPath, defaultVGraph(name));
      created.push('vgraph.json');
    }
    if (!(await exists(betaPath)) || flag(args, '--force')) {
      await writeJsonAtomic(betaPath, defaultBeta(name));
      created.push('beta.json');
    }
    const render = await renderCartridge(dir, { format: 'all' });
    const validation = await validateCartridge(dir);
    const drift = await driftCartridge(dir);
    console.log(JSON.stringify({ cartridge: path.relative(root, dir), created, render, validation: validation.ok, drift: drift.status }, null, 2));
    return;
  }
  if (sub === 'render') {
    const format = readFlagValue(args, '--format', 'all');
    console.log(JSON.stringify(await renderCartridge(dir, { format }), null, 2));
    return;
  }
  if (sub === 'validate') {
    const validation = await validateCartridge(dir);
    console.log(JSON.stringify(validation, null, 2));
    process.exitCode = validation.ok ? 0 : 2;
    return;
  }
  if (sub === 'drift') {
    const drift = await driftCartridge(dir);
    console.log(JSON.stringify(drift, null, 2));
    process.exitCode = drift.status === 'low' ? 0 : 2;
    return;
  }
  if (sub === 'snapshot') {
    await renderCartridge(dir, { format: 'all' });
    console.log(JSON.stringify(await snapshotCartridge(dir), null, 2));
    return;
  }
  console.error('Usage: sks gx init|render|validate|drift|snapshot');
  process.exitCode = 1;
}

export async function team(args) {
  const teamSubcommands = new Set(['log', 'tail', 'watch', 'lane', 'status', 'dashboard', 'event', 'message', 'open-tmux', 'attach-tmux', 'cleanup-tmux']);
  if (teamSubcommands.has(args[0])) return teamCommand(args[0], args.slice(1));
  const jsonOutput = flag(args, '--json');
  const openTmux = !jsonOutput && !flag(args, '--no-open-tmux') && !flag(args, '--no-tmux');
  const cleanCreateArgs = args.filter((arg) => !['--open-tmux', '--tmux-open', '--no-open-tmux', '--no-tmux', '--no-attach'].includes(String(arg)));
  const opts = parseTeamCreateArgs(cleanCreateArgs);
  const { prompt, agentSessions, roleCounts, roster } = opts;
  if (!prompt) {
    console.error('Usage: sks team "task" [executor:5 reviewer:6 user:1] [--agents N] [--no-open-tmux] [--json]');
    console.error('       sks team log|tail|watch|lane|status|message|open-tmux|attach-tmux|cleanup-tmux [mission-id|latest]');
    console.error('       sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."');
    console.error('       sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'team', prompt });
  const schema = buildQuestionSchema(prompt);
  await writeQuestions(dir, schema);
  const plan = buildTeamPlan(id, prompt, { agentSessions, roleCounts, roster });
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
  await writeTextAtomic(path.join(dir, 'team-workflow.md'), teamWorkflowMarkdown(plan));
  const liveFiles = await initTeamLive(id, dir, prompt, { agentSessions, roleCounts, roster });
  await writeJsonAtomic(path.join(dir, 'team-roster.json'), { schema_version: 1, mission_id: id, role_counts: roleCounts, agent_sessions: agentSessions, bundle_size: roster.bundle_size, roster, confirmed: true, source: 'default_or_prompt_team_spec' });
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const teamReasoning = teamReasoningPolicy(prompt, roster);
  const promptEffort = teamReasoning.prompt_policy?.effort || 'medium';
  const runtime = await writeTeamRuntimeArtifacts(dir, plan, {});
  const effortDecision = await writeEffortDecision(dir, {
    mission_id: id,
    task_id: 'TEAM-INTAKE',
    route: fromChatImgRequired ? 'from-chat-img' : 'team',
    prompt,
    tool_use: promptEffort === 'medium',
    multi_step_decision: promptEffort !== 'low',
    spans_many_files: promptEffort === 'high' || promptEffort === 'xhigh',
    is_deterministic: promptEffort === 'low',
    has_verified_skill: true,
    high_risk: promptEffort === 'high' || promptEffort === 'xhigh',
    risk_scores: {
      security: /security|auth|permission|database|supabase|sql|보안|권한|데이터베이스/i.test(prompt) ? 0.8 : 0.1,
      destructive_action: /delete|drop|reset|remove|삭제|초기화/i.test(prompt) ? 0.8 : 0.1,
      user_impact: /release|publish|deploy|commit|push|production|배포|커밋|푸쉬|운영/i.test(prompt) ? 0.8 : 0.3
    }
  });
  const workOrder = createWorkOrderLedger({
    missionId: id,
    route: fromChatImgRequired ? 'from-chat-img' : 'team',
    sourcesComplete: !fromChatImgRequired,
    requests: [{ verbatim: prompt, normalized_requirement: prompt, implementation_tasks: ['TASK-001'], status: 'pending' }]
  });
  await writeWorkOrderLedger(dir, workOrder);
  if (fromChatImgRequired) await writeFromChatImgArtifacts(dir, { missionId: id, requests: [{ verbatim: prompt }], ambiguities: ['image source inventory must be completed before implementation'] });
  await writeHarnessGrowthReport(root, dir, {});
  let dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team analysis scouts' });
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), { passed: false, team_roster_confirmed: true, analysis_artifact: false, triwiki_refreshed: false, triwiki_validated: false, consensus_artifact: false, ...runtime.gate_fields, implementation_team_fresh: false, review_artifact: false, integration_evidence: false, session_cleanup: false, context7_evidence: false, ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}) });
  dashboardState = await writeTeamDashboardState(dir, { missionId: id, mission: { id, mode: 'team' }, effort: effortDecision.selected_effort, phase: 'intake', next_action: fromChatImgRequired ? 'complete visual source inventory and work-order mapping' : 'run Team analysis scouts' });
  const route = routePrompt(`$Team ${prompt}`) || ROUTES.find((candidate) => candidate.id === 'Team');
  const routeReason = routeReasoning(route, prompt);
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: prompt, required: false, ambiguity: { required: false, status: 'team_cli_direct' } });
  await setCurrent(root, { mission_id: id, route: 'Team', route_command: '$Team', mode: 'TEAM', phase: 'TEAM_PARALLEL_ANALYSIS_SCOUTING', questions_allowed: false, implementation_allowed: true, context7_required: false, context7_verified: false, subagents_required: true, subagents_verified: false, reflection_required: true, visible_progress_required: true, context_tracking: 'triwiki', required_skills: route?.requiredSkills || ['team'], stop_gate: 'team-gate.json', reasoning_effort: routeReason.effort, reasoning_profile: routeReason.profile, reasoning_temporary: true, team_agent_reasoning_policy: teamReasoning, goal_continuation: pipelinePlan.goal_continuation, agent_sessions: agentSessions, role_counts: roleCounts, team_roster_confirmed: true, team_graph_ready: runtime.ok, team_live_ready: true, from_chat_img_required: fromChatImgRequired, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT, prompt });
  const result = {
    mission_id: id,
    mission_dir: dir,
    plan: path.join(dir, 'team-plan.json'),
    workflow: path.join(dir, 'team-workflow.md'),
    team_graph: path.join(dir, TEAM_GRAPH_ARTIFACT),
    runtime_tasks: path.join(dir, TEAM_RUNTIME_TASKS_ARTIFACT),
    decomposition_report: path.join(dir, TEAM_DECOMPOSITION_ARTIFACT),
    worker_inbox_dir: path.join(dir, TEAM_INBOX_DIR),
    live: liveFiles.live,
    transcript: liveFiles.transcript,
    dashboard: liveFiles.dashboard,
    dashboard_state: path.join(dir, ARTIFACT_FILES.team_dashboard_state),
    effort_decision: path.join(dir, ARTIFACT_FILES.effort_decision),
    work_order_ledger: path.join(dir, ARTIFACT_FILES.work_order_ledger),
    pipeline_plan: path.join(dir, PIPELINE_PLAN_ARTIFACT),
    dashboard_state_valid: dashboardState.ok,
    context_pack: path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'),
    agent_sessions: agentSessions,
    bundle_size: roster.bundle_size,
    role_counts: roleCounts,
    questions: path.join(dir, 'questions.md'),
    codex_agents: ['analysis_scout', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer']
  };
  result.tmux = await launchTmuxTeamView({ root, missionId: id, plan, promptFile: result.workflow, json: jsonOutput || !openTmux, attach: openTmux, args });
  if (jsonOutput) return console.log(JSON.stringify(result, null, 2));
  console.log(`Team mission created: ${id}`);
  console.log(`Agent sessions: ${agentSessions}`);
  console.log(`Role counts: ${formatRoleCounts(roleCounts)}`);
  console.log(`Review policy: minimum ${MIN_TEAM_REVIEWER_LANES} reviewer/QA validation lanes`);
  if (result.tmux.ready) {
    const tmuxState = result.tmux.created ? 'opened' : 'not opened';
    console.log(`tmux: ${tmuxState} ${result.tmux.opened_lane_count || result.tmux.agents.length} agent lane(s) in ${result.tmux.session || result.tmux.workspace}`);
    if (result.tmux.preflight_cleanup?.closed_lane_count) console.log(`tmux cleanup preflight: closed ${result.tmux.preflight_cleanup.closed_lane_count} stale Team pane(s)`);
    if (result.tmux.split_ui?.mode) console.log(`tmux UI: ${result.tmux.split_ui.mode} (${result.tmux.split_ui.layout})`);
  }
  else console.log(`tmux: blocked (${Array.from(new Set(result.tmux.blockers || [])).join('; ')})`);
  console.log(`Watch: sks team watch ${id}`);
  console.log(`Artifacts: .sneakoscope/missions/${id}`);
}

export function parseTeamCreateArgs(args) {
  const spec = parseTeamSpecArgs(args);
  const prompt = spec.cleanArgs.join(' ').trim();
  const normalized = normalizeTeamSpec({ agentSessions: spec.agentSessions, roleCounts: spec.roleCounts, prompt });
  return { prompt, agentSessions: normalized.agentSessions, roleCounts: normalized.roleCounts, roster: normalized.roster };
}

export function buildTeamPlan(id, prompt, opts = {}) {
  const spec = normalizeTeamSpec({ ...opts, prompt });
  const { agentSessions, roleCounts, roster } = spec;
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const fromChatImgCoveragePhase = fromChatImgRequired ? [{
    id: 'from_chat_img_coverage_reconciliation',
    goal: `Before implementation, write ${FROM_CHAT_IMG_WORK_ORDER_ARTIFACT}, ${FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT}, ${FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT}, ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, and ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}: every visible customer request, screenshot image region, and separate attachment must be listed, source-bound, mapped to work-order item(s), confidence-tagged, tracked with checkboxes, and reconciled with unresolved_items empty. After implementation, run scoped QA-LOOP over the exact work-order range and write ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}.`,
    agents: ['parent_orchestrator'],
    output: [FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT]
  }] : [];
  const requiredArtifacts = ['team-roster.json', 'work-order-ledger.json', 'effort-decision.json', 'team-dashboard-state.json', 'team-analysis.md', ...(fromChatImgRequired ? [FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT] : []), 'team-consensus.md', ...teamRuntimeRequiredArtifacts(), 'team-review.md', 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'team-live.md', 'team-transcript.jsonl', 'team-dashboard.json', '.sneakoscope/wiki/context-pack.json', 'context7-evidence.jsonl'];
  return {
    schema_version: 1,
    mission_id: id,
    mode: 'team',
    prompt,
    agent_session_count: agentSessions,
    default_agent_session_count: MIN_TEAM_REVIEWER_LANES,
    role_counts: roleCounts,
    session_policy: `Use at most ${agentSessions} subagent sessions at a time; parent orchestrator is not counted.`,
    review_policy: teamReviewPolicy(),
    review_gate: evaluateTeamReviewPolicyGate({ roleCounts, agentSessions, roster }),
    bundle_size: roster.bundle_size,
    roster,
    goal_continuation: ambientGoalContinuation(),
    team_model: {
      phases: ['parallel_analysis_scouts', 'triwiki_stage_refresh', 'debate_team', 'triwiki_stage_refresh', 'runtime_task_graph', 'development_team', 'triwiki_stage_refresh', 'review', 'session_cleanup'],
      analysis_team: `Read-only parallel scouting with exactly ${roster.bundle_size} analysis_scout_N agents. Each scout owns one investigation slice, records source paths/evidence, and returns TriWiki-ready findings before debate or implementation starts.`,
      debate_team: `Read-only role debate with exactly ${roster.bundle_size} participants composed from user, planner, reviewer, and executor voices applying compact Hyperplan-derived adversarial lenses.`,
      development_team: `Fresh parallel development bundle with exactly ${roster.bundle_size} executor_N developers implementing disjoint slices; validation_team reviews afterward.`,
      review_team: `Validation runs at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA lanes before integration or final.`
    },
    team_runtime: teamRuntimePlanMetadata(),
    persona_axioms: [
      'Final users are intentionally low-context, impatient, self-interested, stubborn, and hostile to inconvenience.',
      'Executors are capable developers and must receive disjoint write ownership.',
      'Reviewers are strict, skeptical, and block unsupported correctness, DB safety, test, or evidence claims.',
      MIN_TEAM_REVIEW_POLICY_TEXT,
      'Analysis scouts run before debate, then the debate team closes before a fresh development team starts parallel implementation.'
    ],
    reasoning: teamReasoningPolicy(prompt, roster),
    codex_config_required: {
      service_tier: 'fast',
      features: { multi_agent: true, hooks: true, remote_control: true, fast_mode: true, fast_mode_ui: true, codex_git_commit: true, computer_use: true, browser_use: true, browser_use_external: true, image_generation: true, in_app_browser: true, guardian_approval: true, tool_suggest: true, apps: true, plugins: true },
      agents: { max_threads: 6, max_depth: 1 },
      custom_agents_dir: '.codex/agents'
    },
    context_tracking: triwikiContextTracking(),
    phases: [
      {
        id: 'team_roster_confirmation',
        goal: 'Materialize Team roster from default SKS counts or explicit user counts, write team-roster.json, and surface role counts before any implementation.',
        agents: ['parent_orchestrator'],
        output: 'team-roster.json'
      },
      {
        id: 'parallel_analysis_scouting',
        goal: fromChatImgRequired
          ? `Read relevant TriWiki context first. From-Chat-IMG is active: extract visible chat text in reading order, enumerate every customer request, account for every screenshot image region and separate attachment, prepare evidence for ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, update ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT} as work proceeds, store temporary session context in ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}, and plan scoped QA-LOOP evidence in ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}; then read-only analysis scouts split repo, docs, tests, API, DB risk, UX friction, and implementation-surface investigation in parallel before debate.`
          : 'Read relevant TriWiki context first. From-Chat-IMG is inactive, so do not assume ordinary image prompts are chat captures; then read-only analysis scouts split repo, docs, tests, API, DB risk, UX friction, and implementation-surface investigation in parallel before debate.',
        agents: roster.analysis_team.map((agent) => agent.id),
        max_parallel_subagents: agentSessions,
        write_policy: 'read-only',
        output: 'team-analysis.md'
      },
      ...fromChatImgCoveragePhase,
      {
        id: 'triwiki_refresh',
        goal: 'Parent orchestrator refreshes and validates TriWiki from scout findings before assigning debate work.',
        agents: ['parent_orchestrator'],
        commands: ['sks wiki refresh', 'sks wiki validate .sneakoscope/wiki/context-pack.json'],
        output: '.sneakoscope/wiki/context-pack.json'
      },
      {
        id: 'planning_debate',
        goal: 'Debate team reads the current TriWiki pack, maps user inconvenience, code risk, constraints, DB safety, tests, and viable approaches, applies compact Hyperplan-derived lenses, and hydrates low-trust claims from source immediately.',
        agents: roster.debate_team.map((agent) => agent.id),
        max_parallel_subagents: agentSessions,
        write_policy: 'read-only'
      },
      {
        id: 'consensus',
        goal: 'Parent orchestrator synthesizes one agreed objective, rejected alternatives, acceptance criteria, and parallel implementation slices, then refreshes/validates TriWiki before implementation handoff.',
        agents: ['parent_orchestrator'],
        output: 'agreed-objective.md'
      },
      {
        id: 'runtime_task_graph_compile',
        goal: `Compile the agreed Team plan into ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, and ${TEAM_DECOMPOSITION_ARTIFACT}; remap symbolic plan nodes to concrete task ids, allocate role/path/domain worker lanes, and write ${TEAM_INBOX_DIR} before executor work starts.`,
        agents: ['parent_orchestrator'],
        output: [TEAM_GRAPH_ARTIFACT, TEAM_RUNTIME_TASKS_ARTIFACT, TEAM_DECOMPOSITION_ARTIFACT, TEAM_INBOX_DIR]
      },
      {
        id: 'close_planning_agents',
        goal: 'Close or stop the debate team after findings and consensus are captured so implementation starts with a fresh development bundle.',
        agents: ['parent_orchestrator']
      },
      {
        id: 'parallel_implementation',
        goal: 'Fresh executor developers read relevant TriWiki plus current source, take disjoint write sets, implement in parallel without reverting each other, and trigger refresh after implementation changes or blockers.',
        agents: roster.development_team.map((agent) => agent.id),
        max_parallel_subagents: agentSessions,
        write_policy: 'workspace-write with explicit ownership'
      },
      {
        id: 'review_and_integrate',
        goal: `Strict reviewers read/validate current TriWiki context, run at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes, check correctness, DB safety, tests, and evidence; user personas validate practical inconvenience; parent integrates final result and refreshes after review findings.`,
        agents: roster.validation_team.map((agent) => agent.id).concat(['parent_orchestrator']),
        min_reviewer_lanes: MIN_TEAM_REVIEWER_LANES
      },
      {
        id: 'session_cleanup',
        goal: 'Close or account for all Team subagent sessions, finalize live transcript state, and write team-session-cleanup.json before reflection or final.',
        agents: ['parent_orchestrator'],
        output: TEAM_SESSION_CLEANUP_ARTIFACT
      }
    ],
    invariants: [
      'The parent thread remains the orchestrator and owns final integration.',
      'Team roster confirmation is mandatory before implementation: default SKS counts are materialized when the user did not specify counts, explicit counts are honored, and team-gate.json must include team_roster_confirmed=true with team-roster.json present.',
      `When and only when From-Chat-IMG/$From-Chat-IMG is explicit, treat client requests as chat-history screenshots plus separate attachments: extract visible text in reading order, use Codex Computer Use visual inspection to match screenshot image regions to attachments with confidence notes, and turn that evidence into a complete modification work order before editing. ${CODEX_COMPUTER_USE_ONLY_POLICY}`,
      `For From-Chat-IMG, forensic intake is stop-gated: ${FROM_CHAT_IMG_WORK_ORDER_ARTIFACT}, ${FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT}, and ${FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT} must exist and pass schema validation before implementation is treated as complete.`,
      `For From-Chat-IMG, request coverage is stop-gated: ${FROM_CHAT_IMG_COVERAGE_ARTIFACT} must show all_chat_requirements_listed=true, all_requirements_mapped_to_work_order=true, all_screenshot_regions_accounted=true, all_attachments_accounted=true, image_analysis_complete=true, verbatim_customer_requests_preserved=true, checklist_updated=true, temp_triwiki_recorded=true, scoped_qa_loop_completed=true, and unresolved_items=[] before Team completion.`,
      `For From-Chat-IMG, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT} must contain Customer Requests, Image Analysis, Work Items, QA Loop, and Verification sections, with every checkbox checked as each item is completed.`,
      `For From-Chat-IMG, ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} stores temporary TriWiki-backed claims with expires_after_sessions no greater than ${FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS}; retention may remove it after enough newer sessions.`,
      `For From-Chat-IMG, ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT} must prove QA-LOOP ran after implementation over the exact customer-request work-order range, covered every work-order item, completed post-fix verification, and has zero unresolved findings.`,
      'Every useful subagent message, result, handoff, review finding, and integration decision is mirrored to team-live.md and team-transcript.jsonl.',
      'Analysis scouts, debate team, and development team are separate bundles; scouts finish before debate and debate closes before implementation workers start.',
      'Analysis scouts are read-only and maximize the available session budget for independent investigation before any code edit.',
      'The parent and agents use relevant TriWiki before every stage, hydrate low-trust claims from source during the stage, and refresh/validate TriWiki after scouting, debate, consensus, implementation, and review changes.',
      `After consensus and before executor work, compile the Team plan into ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, and ${TEAM_DECOMPOSITION_ARTIFACT}; symbolic node ids are remapped to concrete task ids before worker inboxes are written.`,
      `Worker inbox files under ${TEAM_INBOX_DIR} must use concrete task ids, include role/path/domain/lane/allocation hints, and be generated only after runtime task readiness is checked.`,
      'executor:N creates exactly N debate participants and then a separate N-person executor development team.',
      'Final user personas should not be overly smart or cooperative; they represent stubborn, inconvenience-averse real users.',
      'Planning agents do not edit files.',
      'Implementation workers receive disjoint ownership scopes.',
      'Workers are told they are not alone in the codebase and must not revert others edits.',
      MIN_TEAM_REVIEW_POLICY_TEXT,
      'Team completion requires session cleanup evidence with zero outstanding subagent sessions before reflection.',
      'Context tracking uses the latest coordinate+voxel TriWiki pack as the SSOT throughout the whole pipeline; coordinate-only legacy packs are invalid, and team handoffs/final claims must preserve id, hash, source path, and RGBA/trig coordinate anchors.',
      'SKS hooks, DB safety rules, no-question run rules, and H-Proof gates remain active.',
      'Destructive database operations remain forbidden.'
    ],
    live_visibility: {
      markdown: 'team-live.md',
      transcript: 'team-transcript.jsonl',
      dashboard: 'team-dashboard.json',
      tmux: 'sks team opens a tmux workspace with one live multi-line lane per visible Team agent budget when tmux is available.',
      commands: [
        'sks team status <mission-id>',
        'sks team log <mission-id>',
        'sks team tail <mission-id>',
        'sks team open-tmux <mission-id>',
        'sks team watch <mission-id>',
        'sks team lane <mission-id> --agent <name> --follow',
        'sks team event <mission-id> --agent <name> --phase <phase> --message "..."',
        'sks team message <mission-id> --from <agent> --to <agent|all> --message "..."',
        'sks team cleanup-tmux <mission-id>'
      ]
    },
    required_artifacts: requiredArtifacts,
    prompt_command: fromChatImgRequired ? '$From-Chat-IMG' : '$Team'
  };
}

export function teamWorkflowMarkdown(plan) {
  const ctx = plan.context_tracking || triwikiContextTracking();
  return `# SKS Team Mission

Mission: ${plan.mission_id}

Prompt:
${plan.prompt}

## Codex App Prompt

\`\`\`text
${plan.prompt_command || '$Team'} ${plan.prompt}

Use dynamic per-agent reasoning in Fast service tier: simple bounded lanes may use low, tool-heavy runtime lanes medium, and knowledge/safety/release lanes high or xhigh. Return to the default/user-selected profile after completion. Use at most ${plan.agent_session_count || MIN_TEAM_REVIEWER_LANES} subagent sessions at a time; the parent orchestrator is not counted. ${plan.review_policy?.text || MIN_TEAM_REVIEW_POLICY_TEXT}

Before each stage, read the relevant latest coordinate+voxel TriWiki context pack and hydrate low-trust claims from source. Coordinate-only legacy packs are invalid; refresh and validate before using TriWiki for pipeline decisions. First run exactly ${plan.roster.bundle_size} read-only analysis_scout_N agents in parallel. Split repo, docs, tests, API, DB risk, UX friction, and implementation-surface investigation into independent slices, then capture source-backed findings in team-analysis.md. Refresh and validate TriWiki before debate. Then run the debate team with exactly ${plan.roster.bundle_size} participants using the refreshed pack. Use the concrete roster below: final-user voices are stubborn and inconvenience-averse, executor voices are capable developers, reviewers are strict, and planners force consensus. Synthesize one agreed objective with acceptance criteria and disjoint implementation slices, then refresh and validate TriWiki again. Compile the Team runtime graph into ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, ${TEAM_DECOMPOSITION_ARTIFACT}, and ${TEAM_INBOX_DIR} so symbolic plan nodes become concrete runtime task ids before worker handoff. Close the debate team. Then form a fresh development team with exactly ${plan.roster.bundle_size} executor_N developers implementing slices in parallel with non-overlapping ownership. Refresh TriWiki after implementation changes or blockers. Review with at least ${plan.review_policy?.minimum_reviewer_lanes || MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes, validate TriWiki again, integrate results in the parent thread, close or account for all Team sessions in team-session-cleanup.json, run verification, and report evidence.
\`\`\`

## Session Budget

- Default: ${plan.default_agent_session_count || MIN_TEAM_REVIEWER_LANES} subagent sessions.
- This mission: ${plan.agent_session_count || MIN_TEAM_REVIEWER_LANES} subagent sessions.
- Bundle size: ${plan.roster.bundle_size}
- Role counts: ${formatRoleCounts(plan.role_counts)}
- The parent orchestrator is not counted.
- Minimum review: ${plan.review_policy?.minimum_reviewer_lanes || MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes before integration or final.
- Use the full available session budget for analysis when independent slices exist; use fewer agents only when the work cannot be split cleanly.
- Runtime graph: write ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, ${TEAM_DECOMPOSITION_ARTIFACT}, and ${TEAM_INBOX_DIR}; worker handoff starts from concrete runtime task ids and scope-aware inboxes.
- Goal continuation: ${plan.goal_continuation?.enabled ? 'ambient Codex native /goal overlay is available without replacing Team gates.' : 'not enabled.'}
- Before reflection/final, close or account for all Team subagent sessions and write ${TEAM_SESSION_CLEANUP_ARTIFACT}.
${plan.required_artifacts?.includes(FROM_CHAT_IMG_COVERAGE_ARTIFACT) ? `- From-Chat-IMG coverage: write ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, and ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} before implementation; after implementation write ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}; do not pass team-gate.json until every visible customer request, screenshot image region, and attachment is mapped, every checklist box is checked, scoped QA-LOOP covers every work item with zero unresolved findings, and unresolved_items is empty.` : ''}

## Context Tracking

- SSOT: ${ctx.ssot}
- Pack: ${ctx.default_pack}
- Refresh: \`${ctx.pack_command}\`
- Validate: \`${ctx.validate_command}\`
- Rule: use only the latest coordinate+voxel TriWiki pack before every stage, hydrate low-trust claims during the stage, refresh after findings/artifact changes, validate before handoffs/final claims, reject coordinate-only legacy packs, and keep id, hash, source path, and RGBA/trig coordinate anchors hydratable.

## Analysis Scouts

${plan.roster.analysis_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

Scout rules:
- Read-only only.
- Each scout owns one independent investigation slice.
- Return source paths, risks, claims, and suggested implementation slices in TriWiki-ready form.
- Parent updates team-analysis.md, runs \`${ctx.refresh_command || ctx.pack_command}\` or \`${ctx.pack_command}\`, then runs \`${ctx.validate_command}\` before debate/development.

## Debate Team

${plan.roster.debate_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Development Team

${plan.roster.development_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Validation Team

${plan.roster.validation_team.map((agent) => `- ${agent.id}: ${agent.persona} [reasoning: ${formatAgentReasoning(agent)}]`).join('\n')}

## Live Visibility

- Keep team-live.md readable for the user inside Codex App.
- Mirror every useful subagent status, debate result, handoff, review finding, and integration decision to team-transcript.jsonl.
- Use \`sks team event ${plan.mission_id} --agent <name> --phase <phase> --message "..."\` when recording a live event from the parent thread.
- The user can inspect the flow with \`sks team open-tmux ${plan.mission_id}\`, \`sks team log ${plan.mission_id}\`, \`sks team tail ${plan.mission_id}\`, \`sks team watch ${plan.mission_id}\`, or \`sks team lane ${plan.mission_id} --agent analysis_scout_1 --follow\`.

## Phases

${plan.phases.map((phase, idx) => `${idx + 1}. ${phase.id}: ${phase.goal}`).join('\n')}

## Invariants

${plan.invariants.map((x) => `- ${x}`).join('\n')}
`;
}

async function teamCommand(sub, args) {
  const root = await sksRoot();
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest';
  const id = await resolveMissionId(root, missionArg);
  if (!id) {
    console.error(`Usage: sks team ${sub} [mission-id|latest]`);
    process.exitCode = 1;
    return;
  }
  const { dir } = await loadMission(root, id);
  if (sub === 'open-tmux' || sub === 'attach-tmux') {
    const plan = await readJson(path.join(dir, 'team-plan.json'), null);
    if (!plan) {
      console.error(`Team plan missing for ${id}; cannot open tmux Team view.`);
      process.exitCode = 2;
      return;
    }
    const tmux = await launchTmuxTeamView({
      root,
      missionId: id,
      plan,
      promptFile: path.join(dir, 'team-workflow.md'),
      json: flag(args, '--json'),
      attach: sub === 'attach-tmux' || !flag(args, '--no-attach'),
      args
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(tmux, null, 2));
    if (!tmux.ready) {
      const reasons = [tmux.opened?.stderr, ...(tmux.blockers || [])].filter(Boolean);
      console.error(`tmux Team view blocked for ${id}: ${reasons.join('; ') || 'tmux creation failed'}`);
      if (tmux.attach_command) console.error(`Attach after repair: ${tmux.attach_command}`);
      process.exitCode = 2;
      return;
    }
    console.log(`tmux: opened ${tmux.opened_lane_count || tmux.lanes?.length || 0} Team lane(s) in ${tmux.session}`);
    if (tmux.preflight_cleanup?.closed_lane_count) console.log(`tmux cleanup preflight: closed ${tmux.preflight_cleanup.closed_lane_count} stale Team pane(s)`);
    if (tmux.split_ui?.mode) console.log(`tmux UI: ${tmux.split_ui.mode} (${tmux.split_ui.layout})`);
    if (tmux.split_ui?.current_session) console.log('tmux cockpit: reconciled inside the current SKS tmux window');
    console.log(`Attach: ${tmux.attach_command}`);
    console.log(`Watch: sks team watch ${id}`);
    return;
  }
  if (sub === 'event') {
    const message = readFlagValue(args, '--message', '');
    if (!message) {
      console.error('Usage: sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."');
      process.exitCode = 1;
      return;
    }
    const phase = readFlagValue(args, '--phase', 'general');
    const plan = await readJson(path.join(dir, 'team-plan.json'), null).catch(() => null);
    const record = await appendTeamEvent(dir, {
      agent: readFlagValue(args, '--agent', 'parent_orchestrator'),
      phase,
      type: readFlagValue(args, '--type', 'status'),
      artifact: readFlagValue(args, '--artifact', ''),
      message
    });
    const cockpit = plan
      ? await reconcileTmuxTeamCockpit({
        root,
        missionId: id,
        plan,
        promptFile: path.join(dir, 'team-workflow.md'),
        close: /^session_cleanup$|^team_cleanup$|^cleanup$/i.test(String(phase || '')),
        plannedFallback: false
      }).catch((err) => ({ ok: false, skipped: true, reason: err.message || 'tmux cockpit reconcile failed' }))
      : null;
    const tmuxCleanup = /^session_cleanup$|^team_cleanup$|^cleanup$/i.test(String(phase || ''))
      ? await requestTeamSessionCleanup(dir, {
        missionId: id,
        agent: readFlagValue(args, '--agent', 'parent_orchestrator'),
        reason: message,
        finalMessage: 'Team cleanup event received. Follow loops stop and managed tmux Team panes are closed when reachable.'
      }).then(() => cleanupTmuxTeamView({ root, missionId: id, closeSession: flag(args, '--close-session') || flag(args, '--close') })).catch((err) => ({ ok: false, reason: err.message || 'tmux cleanup failed' }))
      : null;
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2));
    console.log(`${record.ts} [${record.phase}] ${record.agent}: ${record.message}`);
    if (cockpit?.ok && (cockpit.opened_lane_count || cockpit.closed_lane_count)) {
      console.log(`tmux cockpit: +${cockpit.opened_lane_count || 0} -${cockpit.closed_lane_count || 0} managed pane(s) in ${cockpit.session}`);
    }
    if (tmuxCleanup) {
      if (tmuxCleanup.ok) console.log(`tmux cleanup: marked complete (${tmuxCleanup.reason || 'record updated'})`);
      else console.log(`tmux cleanup: skipped (${tmuxCleanup.reason || 'not available'})`);
    }
    return;
  }
  if (sub === 'message') {
    const message = readFlagValue(args, '--message', '');
    if (!message) {
      console.error('Usage: sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."');
      process.exitCode = 1;
      return;
    }
    const from = readFlagValue(args, '--from', readFlagValue(args, '--agent', 'parent_orchestrator'));
    const to = readFlagValue(args, '--to', 'all');
    const record = await appendTeamEvent(dir, {
      agent: from,
      to,
      phase: readFlagValue(args, '--phase', 'communication'),
      type: 'message',
      message
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(record, null, 2));
    console.log(`${record.ts} [${record.phase}] ${record.agent} -> ${record.to}: ${record.message}`);
    return;
  }
  if (sub === 'cleanup-tmux') {
    const control = await requestTeamSessionCleanup(dir, {
      missionId: id,
      agent: readFlagValue(args, '--agent', 'parent_orchestrator'),
      reason: readFlagValue(args, '--reason', 'Team session ended; clean up live follow panes.'),
      finalMessage: 'Team session ended. Lane/watch follow loops will stop after showing this cleanup summary; managed tmux Team panes are closed when reachable.'
    });
    await appendTeamEvent(dir, {
      agent: readFlagValue(args, '--agent', 'parent_orchestrator'),
      phase: 'session_cleanup',
      type: 'cleanup',
      message: control.cleanup_reason || 'Team session cleanup requested.'
    });
    const cleanup = await cleanupTmuxTeamView({ root, missionId: id, closeSession: flag(args, '--close-session') || flag(args, '--close') });
    cleanup.control = control;
    if (flag(args, '--json')) return console.log(JSON.stringify(cleanup, null, 2));
    if (!cleanup.ok) {
      console.error(`tmux cleanup skipped: ${cleanup.reason || 'not available'}`);
      process.exitCode = cleanup.skipped ? 0 : 2;
      return;
    }
    if (cleanup.killed_session) console.log(`tmux cleanup: killed session ${cleanup.session}`);
    else console.log(`tmux cleanup: marked complete (${cleanup.reason || 'record updated'})`);
    if (cleanup.sweep_cleanup?.closed_lane_count) console.log(`tmux sweep: closed ${cleanup.sweep_cleanup.closed_lane_count} stale recorded Team pane(s)`);
    console.log(renderTeamCleanupSummary(control));
    return;
  }
  if (sub === 'status') {
    const dashboard = await readTeamDashboard(dir);
    if (flag(args, '--json')) return console.log(JSON.stringify(dashboard || {}, null, 2));
    if (!dashboard) {
      console.error(`Team dashboard missing for ${id}.`);
      process.exitCode = 2;
      return;
    }
    console.log(`Team mission: ${id}`);
    console.log(`Updated: ${dashboard.updated_at || 'unknown'}`);
    console.log(`Agent sessions: ${dashboard.agent_session_count || MIN_TEAM_REVIEWER_LANES}`);
    if (dashboard.role_counts) console.log(`Role counts: ${formatRoleCounts(dashboard.role_counts)}`);
    for (const entry of dashboard.latest_messages || []) console.log(`${entry.ts} [${entry.phase}] ${entry.agent}: ${entry.message}`);
    return;
  }
  if (sub === 'dashboard') {
    await writeTeamDashboardState(dir, { missionId: id });
    const state = await readJson(path.join(dir, ARTIFACT_FILES.team_dashboard_state), {});
    if (flag(args, '--json')) return console.log(JSON.stringify(state, null, 2));
    console.log(renderTeamDashboardState(state));
    return;
  }
  if (sub === 'log') return console.log(await readTeamLive(dir));
  if (sub === 'lane') {
    const agent = readFlagValue(args, '--agent', 'parent_orchestrator');
    const phase = readFlagValue(args, '--phase', '');
    const lines = Number(readFlagValue(args, '--lines', '12'));
    const shouldStopLaneFollow = async () => {
      if (teamCleanupRequested(await readTeamControl(dir))) return true;
      const dashboard = await readTeamDashboard(dir).catch(() => null);
      return isTerminalTeamAgentStatus(dashboard?.agents?.[agent]?.status || '');
    };
    const printLane = async () => {
      const text = await renderTeamAgentLane(dir, { missionId: id, agent, phase, lines });
      if (flag(args, '--json')) {
        console.log(JSON.stringify({ mission_id: id, agent, phase, lane: text }, null, 2));
      } else {
        if (flag(args, '--follow') && process.stdout.isTTY) console.clear();
        console.log(text);
      }
      return text;
    };
    let last = await printLane();
    if (flag(args, '--follow') && !(await shouldStopLaneFollow())) {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const next = await renderTeamAgentLane(dir, { missionId: id, agent, phase, lines });
        if (next !== last) {
          if (process.stdout.isTTY) console.clear();
          else console.log('\n--- team lane update ---\n');
          console.log(next);
          last = next;
        }
        if (await shouldStopLaneFollow()) return;
      }
    }
    return;
  }
  if (sub === 'tail' || sub === 'watch') {
    const lines = readFlagValue(args, '--lines', '20');
    const printTail = async () => {
      if (sub === 'watch' && !flag(args, '--raw')) {
        if (flag(args, '--follow') && process.stdout.isTTY) console.clear();
        console.log(await renderTeamWatch(dir, { missionId: id, lines: Number(lines) }));
        return;
      }
      for (const line of await readTeamTranscriptTail(dir, Number(lines))) console.log(line);
    };
    await printTail();
    if (sub === 'watch' && flag(args, '--follow') && !teamCleanupRequested(await readTeamControl(dir))) {
      let last = flag(args, '--raw')
        ? (await readTeamTranscriptTail(dir, Number(lines))).join('\n')
        : await renderTeamWatch(dir, { missionId: id, lines: Number(lines) });
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const next = flag(args, '--raw')
          ? (await readTeamTranscriptTail(dir, Number(lines))).join('\n')
          : await renderTeamWatch(dir, { missionId: id, lines: Number(lines) });
        if (next !== last) {
          if (process.stdout.isTTY) console.clear();
          else console.log('\n--- team watch update ---\n');
          console.log(next);
          last = next;
        }
        if (teamCleanupRequested(await readTeamControl(dir))) return;
      }
    }
    return;
  }
}
