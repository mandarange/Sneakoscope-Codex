import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot, readJson, writeJsonAtomic, writeTextAtomic, appendJsonlBounded, nowIso, exists, ensureDir, tmpdir, packageRoot, dirSize, formatBytes, which, runProcess, PACKAGE_VERSION, sksRoot, globalSksRoot, findProjectRoot } from '../core/fsx.mjs';
import { initProject, installSkills, normalizeInstallScope, sksCommandPrefix } from '../core/init.mjs';
import { getCodexInfo, runCodexExec } from '../core/codex-adapter.mjs';
import { createMission, loadMission, findLatestMission, missionDir, setCurrent, stateFile } from '../core/mission.mjs';
import { buildQuestionSchema, writeQuestions } from '../core/questions.mjs';
import { sealContract, validateAnswers } from '../core/decision-contract.mjs';
import { buildQaLoopQuestionSchema, buildQaLoopPrompt, defaultQaGate, evaluateQaGate, isQaReportFilename, qaStatus, writeMockQaResult, writeQaLoopArtifacts } from '../core/qa-loop.mjs';
import { containsUserQuestion, noQuestionContinuationReason } from '../core/no-question-guard.mjs';
import { evaluateDoneGate, defaultDoneGate } from '../core/hproof.mjs';
import { emitHook } from '../core/hooks-runtime.mjs';
import { storageReport, enforceRetention, pruneWikiArtifacts } from '../core/retention.mjs';
import { classifySql, classifyCommand, checkDbOperation, handleMadSksUserConfirmation } from '../core/db-safety.mjs';
import { checkHarnessModification, harnessGuardStatus, isHarnessSourceProject } from '../core/harness-guard.mjs';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.mjs';
import { context7Docs, context7Resolve, context7Text, context7Tools } from '../core/context7-client.mjs';
import { installVersionGitHook, runVersionPreCommit, versioningStatus } from '../core/version-manager.mjs';
import { rustInfo } from '../core/rust-accelerator.mjs';
import { renderCartridge, validateCartridge, driftCartridge, snapshotCartridge } from '../core/gx-renderer.mjs';
import { defaultEvaluationScenario, runEvaluationBenchmark } from '../core/evaluation.mjs';
import { buildResearchPrompt, evaluateResearchGate, writeMockResearchResult, writeResearchPlan } from '../core/research.mjs';
import { contextCapsule } from '../core/triwiki-attention.mjs';
import { rgbaKey, rgbaToWikiCoord, validateWikiCoordinateIndex } from '../core/wiki-coordinate.mjs';
import { ALLOWED_REASONING_EFFORTS, CODEX_COMPUTER_USE_EVIDENCE_SOURCE, CODEX_COMPUTER_USE_ONLY_POLICY, COMMAND_CATALOG, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, RECOMMENDED_SKILLS, ROUTES, USAGE_TOPICS, context7ConfigToml, hasContext7ConfigText, hasFromChatImgSignal, looksLikeAnswerOnlyRequest, noUnrequestedFallbackCodePolicyText, reflectionRequiredForRoute, reasoningInstruction, routePrompt, routeReasoning, routeRequiresSubagents, stackCurrentDocsPolicy, triwikiContextTracking } from '../core/routes.mjs';
import { context7Evidence, evaluateStop, recordContext7Evidence, recordSubagentEvidence } from '../core/pipeline.mjs';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, validateTeamRuntimeArtifacts, writeTeamRuntimeArtifacts } from '../core/team-dag.mjs';
import { appendTeamEvent, initTeamLive, parseTeamSpecText, readTeamDashboard, readTeamLive, readTeamTranscriptTail, renderTeamAgentLane } from '../core/team-live.mjs';
import { ARTIFACT_FILES, validateDogfoodReport, validateEffortDecision, validateFromChatImgVisualMap, validateSkillCandidate, validateSkillInjectionDecision, validateTeamDashboardState, validateWorkOrderLedger } from '../core/artifact-schemas.mjs';
import { selectEffort, writeEffortDecision } from '../core/effort-orchestrator.mjs';
import { createWorkOrderLedger } from '../core/work-order-ledger.mjs';
import { buildFromChatImgVisualMap } from '../core/from-chat-img-forensics.mjs';
import { classifyDogfoodFinding, createDogfoodReport, writeDogfoodReport } from '../core/dogfood-loop.mjs';
import { createSkillCandidate, decideSkillInjection, writeSkillCandidate, writeSkillForgeReport, writeSkillInjectionDecision } from '../core/skill-forge.mjs';
import { classifyToolError, harnessGrowthReport } from '../core/evaluation.mjs';
import { runWorkflowPerfBench, validateWorkflowPerfReport } from '../core/perf-bench.mjs';
import { proofFieldFixture, validateProofFieldReport } from '../core/proof-field.mjs';
import { recordMistake, writeMistakeMemoryReport } from '../core/mistake-memory.mjs';
import { buildPromptContext } from '../core/prompt-context-builder.mjs';
import { renderTeamDashboardState, writeTeamDashboardState } from '../core/team-dashboard-renderer.mjs';
import { GOAL_WORKFLOW_ARTIFACT } from '../core/goal-workflow.mjs';
import { CODEX_APP_DOCS_URL, codexAppIntegrationStatus, formatCodexAppStatus } from '../core/codex-app.mjs';
import { buildWarpLaunchConfigYaml, buildWarpLaunchPlan, buildWarpOpenArgs, isWarpShellSession, runWarpLaunchConfigSyntaxCheck, warpOpenLaunchDecision, warpReadiness, warpStatusKind, defaultWarpWorkspaceName, formatWarpBanner, launchWarpTeamView, launchWarpUi, platformWarpInstallHint, runWarpStatus, sanitizeWarpWorkspaceName, teamLaneStyle, writeWarpLaunchConfig } from '../core/warp-ui.mjs';
import { autoReviewProfileName, autoReviewStatus, autoReviewSummary, enableAutoReview, disableAutoReview, enableMadHighProfile, madHighProfileName } from '../core/auto-review.mjs';
import { buildTeamPlan, codeStructureCommand, dbCommand, defaultBeta, defaultVGraph, evalCommand, gcCommand, goalCommand, gxCommand, harnessCommand, hproofCommand, memoryCommand, migrateWikiContextPack, parseTeamCreateArgs, perfCommand, profileCommand, projectWikiClaims, proofFieldCommand, qaLoopCommand, quickstartCommand, researchCommand, statsCommand, team, teamWorkflowMarkdown, validateArtifactsCommand, wikiCommand, wikiVoxelRowCount, writeWikiContextPack } from './maintenance-commands.mjs';

const flag = (args, name) => args.includes(name);
const promptOf = (args) => args.filter((x) => !String(x).startsWith('--')).join(' ').trim();
const REFLECTION_ARTIFACT = 'reflection.md';
const REFLECTION_GATE = 'reflection-gate.json';
const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';

function installScopeFromArgs(args = [], fallback = 'global') {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const i = args.indexOf('--install-scope');
  return normalizeInstallScope(i >= 0 && args[i + 1] ? args[i + 1] : fallback);
}

export async function main(args) {
  if (isMadHighLaunch(args)) return madHighCommand(args);
  if (isAutoReviewFlag(args[0])) return autoReviewCommand('start', args.slice(1));
  const [cmd, sub, ...rest] = args;
  const tail = sub === undefined ? [] : [sub, ...rest];
  if (!cmd) return help();
  if (cmd === '--help' || cmd === '-h') return help();
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') return version();
  if (cmd === 'postinstall') return postinstall();
  if (cmd === 'wizard' || cmd === 'ui') return wizard(tail);
  if (cmd === 'warp') return !sub || String(sub).startsWith('--') ? warpCommand('check', tail) : warpCommand(sub, rest);
  if (cmd === 'auto-review' || cmd === 'autoreview') return autoReviewCommand(sub, rest);
  if (cmd === 'update-check') return updateCheck(tail);
  if (cmd === 'help') return help(tail);
  if (cmd === 'commands') return commands(tail);
  if (cmd === 'usage') return usage(tail);
  if (cmd === 'root') return rootCommand(tail);
  if (cmd === 'quickstart') return quickstartCommand();
  if (cmd === 'codex-app') return codexAppHelp(tail);
  if (cmd === 'bootstrap') return bootstrap(tail);
  if (cmd === 'deps') return deps(sub, rest);
  if (cmd === 'dollar-commands' || cmd === 'dollars' || cmd === '$') return dollarCommands(tail);
  if (String(cmd).toLowerCase() === 'dfix') return dfixHelp();
  if (cmd === 'qa-loop') return qaLoopCommand(sub, rest);
  if (cmd === 'context7') return context7(sub, rest);
  if (cmd === 'pipeline') return pipeline(sub, rest);
  if (cmd === 'guard') return guard(sub, rest);
  if (cmd === 'conflicts') return conflicts(sub, rest);
  if (cmd === 'versioning') return versioning(sub, rest);
  if (cmd === 'reasoning') return reasoningCommand(tail);
  if (cmd === 'aliases') return aliases();
  if (cmd === 'setup') return setup(tail);
  if (cmd === 'fix-path') return fixPath(tail);
  if (cmd === 'doctor') return doctor(tail);
  if (cmd === 'init') return init(tail);
  if (cmd === 'selftest') return selftest(tail);
  if (cmd === 'goal') return goalCommand(sub, rest);
  if (cmd === 'research') return researchCommand(sub, rest);
  if (cmd === 'hook') return emitHook(sub);
  if (cmd === 'profile') return profileCommand(sub, rest);
  if (cmd === 'hproof') return hproofCommand(sub, rest);
  if (cmd === 'validate-artifacts') return validateArtifactsCommand(tail);
  if (cmd === 'perf') return perfCommand(sub, rest);
  if (cmd === 'proof-field') return proofFieldCommand(sub, rest);
  if (cmd === 'code-structure') return codeStructureCommand(sub, rest);
  if (cmd === 'memory') return memoryCommand(sub, rest);
  if (cmd === 'gx') return gxCommand(sub, rest);
  if (cmd === 'team') return team(tail);
  if (cmd === 'db') return dbCommand(sub, rest);
  if (cmd === 'eval') return evalCommand(sub, rest);
  if (cmd === 'harness') return harnessCommand(sub, rest);
  if (cmd === 'wiki') return wikiCommand(sub, rest);
  if (cmd === 'gc') return gcCommand(tail);
  if (cmd === 'stats') return statsCommand(tail);
  console.error(`Unknown command: ${cmd}`);
  process.exitCode = 1;
}

function help(args = []) {
  const topic = args[0];
  if (topic) return usage([topic]);
  console.log(`ㅅㅋㅅ
Sneakoscope Codex

Usage:
  sks help [topic]
  sks version
  sks update-check [--json]
  sks wizard
  sks commands [--json]
  sks usage [${USAGE_TOPICS}]
  sks root [--json]
  sks quickstart
  sks bootstrap [--install-scope global|project] [--local-only] [--json]
  sks deps check|install [warp|codex|context7|all] [--yes] [--json]
  sks codex-app
  sks --mad [--high]
  sks auto-review status|enable|start [--high]
  sks --Auto-review [--high]
  sks warp open [--workspace name]
  sks warp status [--once]
  sks dollar-commands [--json]
  sks dfix
  sks qa-loop prepare "target"
  sks qa-loop answer <mission-id|latest> <answers.json>
  sks qa-loop run <mission-id|latest> [--mock] [--max-cycles N]
  sks qa-loop status <mission-id|latest>
  sks context7 check|setup|tools|resolve|docs|evidence ...
  sks pipeline status|resume [--json]
  sks pipeline answer <mission-id|latest> <answers.json>
  sks guard check [--json]
  sks conflicts check|prompt [--json]
  sks versioning status|bump|pre-commit [--json]
  sks reasoning ["prompt"] [--json]
  sks aliases
  sks setup [--bootstrap] [--install-scope global|project] [--local-only] [--force] [--json]
  sks fix-path [--install-scope global|project] [--json]
  sks doctor [--fix] [--local-only] [--json] [--install-scope global|project]
  sks init [--install-scope global|project] [--local-only]
  sks selftest [--mock]
  sks goal create "task"
  sks goal pause|resume|clear <mission-id|latest>
  sks goal status <mission-id|latest>
  sks team "task" [executor:5 reviewer:2 user:1] [--json]
  sks team log|tail|watch|lane|status|dashboard [mission-id|latest]
  sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."
  sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."
  sks team cleanup-warp [mission-id|latest]
  sks research prepare "topic" [--depth frontier]
  sks research run <mission-id|latest> [--mock] [--max-cycles N]
  sks research status <mission-id|latest>
  sks db policy
  sks db scan [--migrations] [--json]
  sks db mcp-config --project-ref <ref>
  sks db check --sql "DROP TABLE users"
  sks db check --command "supabase db reset"
  sks hproof check [mission-id|latest]
  sks validate-artifacts [mission-id|latest] [--json]
  sks eval run [--json] [--out report.json]
  sks eval compare --baseline old.json --candidate new.json [--json]
  sks perf run|workflow [--json] [--intent "task"] [--changed file1,file2]
  sks proof-field scan [--json] [--intent "task"]
  sks harness fixture [--json]
  sks code-structure scan [--json]
  sks wiki coords --rgba 12,34,56,255
  sks wiki pack [--json] [--role worker|verifier] [--max-anchors N]
  sks wiki refresh [--json] [--role worker|verifier] [--max-anchors N] [--prune] [--dry-run]
  sks wiki prune [--json] [--dry-run]
  sks wiki validate [context-pack.json]
  sks gx init [name]
  sks gx render [name] [--format svg|html|all]
  sks gx validate [name]
  sks gx drift [name]
  sks gx snapshot [name]
  sks profile show
  sks profile set <model>
  sks gc [--dry-run] [--json]
  sks memory [--dry-run] [--json]
  sks stats [--json]

Codex App prompt commands:
${formatDollarCommandsCompact('  ')}

Discovery:
  sks commands       Full command list with descriptions
  sks usage goal     Workflow examples for one topic
  sks dollar-commands Codex App $ commands: ${dollarCommandNames()}
`);
}

function version() {
  console.log(`sneakoscope ${PACKAGE_VERSION}`);
}

function shouldShowWizard() {
  return Boolean(input.isTTY && output.isTTY && process.env.SKS_NO_WIZARD !== '1' && process.env.CI !== 'true');
}

function isAutoReviewFlag(value) {
  return /^--?auto[-_]?review$/i.test(String(value || ''));
}

function isMadHighLaunch(args = []) {
  return /^--(?:mad|MAD|mad-sks)$/i.test(String(args[0] || ''));
}

async function postinstall() {
  const installRoot = path.resolve(process.env.INIT_CWD || process.cwd());
  const conflictScan = await scanHarnessConflicts(installRoot);
  if (conflictScan.hard_block) {
    await postinstallHarnessConflictNotice(conflictScan);
    return;
  }
  console.log('\nSKS installed.');
  const shim = await ensureSksCommandDuringInstall();
  if (shim.status === 'present') console.log(`SKS command: available (${shim.command}).`);
  else if (shim.status === 'created') console.log(`SKS command: shim created at ${shim.command}.`);
  else if (shim.status === 'created_not_on_path') console.log(`SKS command: shim created at ${shim.command}. Add ${path.dirname(shim.command)} to PATH, or run npx -y -p sneakoscope sks.`);
  else if (shim.status === 'skipped') console.log(`SKS command: skipped (${shim.reason}).`);
  else console.log(`SKS command: shim unavailable. Use npx -y -p sneakoscope sks. ${shim.error || ''}`.trim());
  const context7Install = await ensureGlobalContext7DuringInstall();
  if (context7Install.status === 'present') console.log('Context7 MCP: already configured for Codex.');
  else if (context7Install.status === 'installed') console.log('Context7 MCP: configured for Codex.');
  else if (context7Install.status === 'codex_missing') console.log('Context7 MCP: Codex CLI missing. Install @openai/codex or set SKS_CODEX_BIN, then run `sks context7 setup --scope global` or `sks setup` in a project.');
  else if (context7Install.status === 'skipped') console.log(`Context7 MCP: skipped (${context7Install.reason}).`);
  else if (context7Install.status === 'failed') console.log(`Context7 MCP: auto setup failed. Run \`sks context7 setup --scope global\` or \`sks setup\`. ${context7Install.error || ''}`.trim());
  const globalSkills = await ensureGlobalCodexSkillsDuringInstall();
  if (globalSkills.status === 'installed') console.log(`Codex App global $ skills: installed in ${globalSkills.root} (${globalSkills.installed_count} skills).`);
  else if (globalSkills.status === 'partial') console.log(`Codex App global $ skills: partial in ${globalSkills.root}; missing ${globalSkills.missing_skills.join(', ')}. Run \`sks doctor --fix\`.`);
  else if (globalSkills.status === 'skipped') console.log(`Codex App global $ skills: skipped (${globalSkills.reason}).`);
  else if (globalSkills.status === 'failed') console.log(`Codex App global $ skills: auto setup failed. Run \`sks doctor --fix\`. ${globalSkills.error || ''}`.trim());
  if (process.env.SKS_POSTINSTALL_BOOTSTRAP === '1' || await shouldOfferPostinstallBootstrap(installRoot)) {
    const answer = (await askPostinstallQuestion('Run SKS bootstrap for this project now? [Y/n] ')).trim();
    const runNow = process.env.SKS_POSTINSTALL_BOOTSTRAP === '1'
      || answer === ''
      || /^(y|yes|예|네|응)$/i.test(answer);
    if (runNow) {
      await bootstrap(['--from-postinstall']);
      return;
    }
  }
  console.log('\nNext:');
  console.log('  sks bootstrap');
  console.log('\nThis initializes the current project, installs SKS Codex App skills, verifies Codex App/Context7 readiness, and checks warp/runtime dependencies.');
  console.log('Dependency repair: sks deps check; sks deps install warp');
  console.log('Open runtime after readiness is green: sks\n');
}

async function postinstallHarnessConflictNotice(conflictScan) {
  console.log('\nSneakoscope Codex package installed, but SKS setup is blocked.');
  console.log(formatHarnessConflictReport(conflictScan, { includePrompt: false }));
  console.log('\nWhat this means: npm can finish installing the package, but `sks setup` and `sks doctor --fix` will refuse to activate SKS until the conflicting harness is removed with human approval.');
  console.log('No files were removed by postinstall.');
  console.log('Cleanup requires a human-approved Codex App session. Recommended model: GPT-5.5, reasoning: high.');
  if (shouldAskPostinstallQuestion()) {
    const answer = await askPostinstallQuestion('Show the cleanup prompt now? [y/N] ');
    if (/^(y|yes|예|네|응)$/i.test(answer.trim())) {
      console.log('\nCleanup prompt:\n');
      console.log(llmHarnessCleanupPrompt(conflictScan));
    } else {
      console.log('Cleanup prompt skipped. You can print it later with: sks conflicts prompt');
    }
  } else {
    console.log('Print the cleanup prompt later with: sks conflicts prompt');
  }
  console.log('After approved cleanup, rerun: sks setup && sks doctor --fix && sks selftest --mock\n');
}

function shouldAskPostinstallQuestion() {
  if (process.env.SKS_POSTINSTALL_PROMPT === '1') return true;
  return Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true' && process.env.SKS_POSTINSTALL_NO_PROMPT !== '1');
}

async function shouldOfferPostinstallBootstrap(root) {
  if (process.env.SKS_POSTINSTALL_NO_BOOTSTRAP === '1') return false;
  return shouldAskPostinstallQuestion() && await isProjectSetupCandidate(path.resolve(root || process.cwd()));
}

async function askPostinstallQuestion(question) {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function ensureSksCommandDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_SHIM === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_SHIM=1' };
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? '';
  const existing = await findCommandOnPath('sks', pathEnv);
  if (isStableSksBin(existing)) return { status: 'present', command: existing };
  const nodeBin = opts.nodeBin || process.execPath;
  const target = opts.target || path.join(packageRoot(), 'bin', 'sks.mjs');
  const dirs = candidateShimDirs(pathEnv, opts.home || process.env.HOME);
  const script = process.platform === 'win32'
    ? `@echo off\r\n"${nodeBin}" "${target}" %*\r\n`
    : `#!/bin/sh\nexec "${nodeBin}" "${target}" "$@"\n`;
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  let createdFallback = null;
  let lastError = '';
  for (const entry of dirs) {
    const dest = path.join(entry.dir, `sks${suffix}`);
    try {
      await ensureDir(entry.dir);
      await writeTextAtomic(dest, script);
      if (process.platform !== 'win32') await fsp.chmod(dest, 0o755).catch(() => {});
      if (entry.onPath) return { status: 'created', command: dest };
      createdFallback ||= dest;
    } catch (err) {
      lastError = err.message;
    }
  }
  if (createdFallback) return { status: 'created_not_on_path', command: createdFallback };
  return { status: 'failed', error: lastError };
}

function candidateShimDirs(pathEnv, home) {
  const seen = new Set();
  const out = [];
  for (const raw of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    const dir = path.resolve(raw);
    if (seen.has(dir) || isTransientNpmBinPath(dir)) continue;
    seen.add(dir);
    out.push({ dir, onPath: true });
  }
  for (const raw of [home && path.join(home, '.local', 'bin'), home && path.join(home, 'bin')].filter(Boolean)) {
    const dir = path.resolve(raw);
    if (seen.has(dir)) continue;
    seen.add(dir);
    out.push({ dir, onPath: false });
  }
  return out;
}

async function findCommandOnPath(name, pathEnv) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${name}${suffix}`);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

async function ensureGlobalContext7DuringInstall() {
  if (process.env.SKS_SKIP_POSTINSTALL_CONTEXT7 === '1') return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_CONTEXT7=1' };
  const codex = await getCodexInfo().catch(() => ({}));
  if (!codex.bin) return { status: 'codex_missing' };
  const list = await runProcess(codex.bin, ['mcp', 'list'], { timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (list.code === 0 && /context7/i.test(`${list.stdout}\n${list.stderr}`)) return { status: 'present' };
  const add = await runProcess(codex.bin, ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'], { timeoutMs: 30000, maxOutputBytes: 64 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (add.code === 0) return { status: 'installed' };
  return { status: 'failed', error: `${add.stderr || add.stdout || 'codex mcp add failed'}`.trim() };
}

async function ensureGlobalCodexSkillsDuringInstall(opts = {}) {
  if (process.env.SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS === '1' && !opts.force) return { status: 'skipped', reason: 'SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS=1' };
  const home = opts.home || process.env.HOME || os.homedir();
  if (!home) return { status: 'skipped', reason: 'home directory unavailable' };
  const root = globalCodexSkillsRoot(home);
  try {
    const install = await installSkills(home);
    const skills = await checkRequiredSkills(home, root);
    return { status: skills.ok ? 'installed' : 'partial', root, installed_count: install.installed_skills.length, removed_aliases: install.removed_agent_skill_aliases, missing_skills: skills.missing };
  } catch (err) {
    return { status: 'failed', root, error: err.message };
  }
}

async function ensureRelatedCliTools(args = []) {
  const skip = flag(args, '--skip-cli-tools') || process.env.SKS_SKIP_CLI_TOOLS === '1';
  const codex = await ensureCodexCliTool({ skip });
  const warp = await warpReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  return {
    codex,
    warp: {
      ok: Boolean(warp.ok),
      app: warp.app || null,
      cli: warp.cli || null,
      version: warp.version || null,
      launch_config_dir: warp.launch_config_dir || null,
      uri_scheme: warp.uri_scheme || null,
      install_hint: warp.ok ? null : platformWarpInstallHint(),
      error: warp.error || null
    }
  };
}

async function ensureCodexCliTool({ skip = false } = {}) {
  if (skip) return { status: 'skipped', reason: 'SKS_SKIP_CLI_TOOLS=1 or --skip-cli-tools' };
  const before = await getCodexInfo().catch(() => ({}));
  if (before.bin) return { status: 'present', bin: before.bin, version: before.version || null };
  const npmBin = await which('npm');
  if (!npmBin) return { status: 'failed', error: 'npm not found on PATH; install Codex CLI manually with npm i -g @openai/codex@latest.' };
  const install = await runProcess(npmBin, ['i', '-g', '@openai/codex@latest'], {
    timeoutMs: 120000,
    maxOutputBytes: 128 * 1024
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) {
    return { status: 'failed', error: `${install.stderr || install.stdout || 'npm i -g @openai/codex@latest failed'}`.trim() };
  }
  const after = await getCodexInfo().catch(() => ({}));
  return {
    status: after.bin ? 'installed' : 'installed_not_on_path',
    bin: after.bin || null,
    version: after.version || null,
    hint: after.bin ? null : 'npm completed, but codex is not on PATH. Restart the shell or set SKS_CODEX_BIN.'
  };
}

async function isProjectSetupCandidate(root) {
  for (const marker of ['package.json', '.git', '.codex', '.agents', 'AGENTS.md']) {
    if (await exists(path.join(root, marker))) return true;
  }
  return false;
}

async function wizard(args = []) {
  if (!shouldShowWizard() && !flag(args, '--force')) return help();
  const rl = readline.createInterface({ input, output });
  try {
    console.log('ㅅㅋㅅ Setup UI\n');
    const currentPackage = await effectivePackageVersion();
    console.log(`Current package: ${currentPackage}`);
    const latest = await npmPackageVersion('sneakoscope');
    if (latest.version) {
      const needsUpdate = compareVersions(latest.version, currentPackage) > 0;
      console.log(`Latest on npm:   ${latest.version}${needsUpdate ? ' (update available)' : ''}`);
      if (needsUpdate) {
        const update = await askChoice(rl, 'Update SKS before setup?', ['yes', 'no'], 'yes');
        if (update === 'yes') {
          console.log('\nRun this update command, then rerun `sks`:');
          console.log('  npm i -g sneakoscope\n');
          return;
        }
        console.log('Skipping update for this setup run.\n');
      }
    } else if (latest.error) {
      console.log(`Latest on npm:   unknown (${latest.error})`);
    }

    const scope = await askChoice(rl, 'Install scope for this project?', ['global', 'project', 'commands', 'quit'], 'global');
    if (scope === 'quit') return;
    if (scope === 'commands') {
      quickstart();
      return;
    }
    if (scope === 'project') {
      console.log('\nProject-only setup needs the package installed in this project:');
      console.log('  npm i -D sneakoscope');
      const proceed = await askChoice(rl, 'Continue with project setup after that dependency exists?', ['yes', 'no'], 'no');
      if (proceed !== 'yes') return;
    }

    const runSetup = await askChoice(rl, `Run sks bootstrap with ${scope} scope now?`, ['yes', 'no'], 'yes');
    if (runSetup === 'yes') await bootstrap(['--install-scope', scope]);
    const runDoctor = await askChoice(rl, 'Run sks doctor --fix now?', ['yes', 'no'], 'yes');
    if (runDoctor === 'yes') await doctor(['--fix', '--install-scope', scope]);
    const runSelftest = await askChoice(rl, 'Run sks selftest --mock now?', ['yes', 'no'], 'yes');
    if (runSelftest === 'yes') await selftest(['--mock']);
    console.log('\nSetup UI complete. Useful next commands:');
    console.log('  sks commands');
    console.log('  sks dollar-commands');
    console.log('  sks codex-app');
  } finally {
    rl.close();
  }
}

async function askChoice(rl, question, choices, fallback) {
  const suffix = choices.map((c) => c === fallback ? c.toUpperCase() : c).join('/');
  const raw = (await rl.question(`${question} [${suffix}] `)).trim().toLowerCase();
  const value = raw || fallback;
  const hit = choices.find((c) => c.toLowerCase() === value || c[0].toLowerCase() === value);
  return hit || fallback;
}

async function updateCheck(args = []) {
  const latest = await npmPackageVersion('sneakoscope');
  const currentPackage = await effectivePackageVersion();
  const result = {
    package: 'sneakoscope',
    current: currentPackage,
    runtime_current: PACKAGE_VERSION,
    latest: latest.version,
    update_available: latest.version ? compareVersions(latest.version, currentPackage) > 0 : false,
    error: latest.error || null
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('ㅅㅋㅅ Update Check');
  console.log(`Current: ${result.current}`);
  console.log(`Latest:  ${result.latest || 'unknown'}`);
  console.log(`Update:  ${result.update_available ? 'available' : 'not needed'}`);
  if (result.error) console.log(`Error:   ${result.error}`);
  if (result.update_available) console.log('Run:     npm i -g sneakoscope');
}

const DOLLAR_DEFAULT_PIPELINE_TEXT = 'Default pipeline: questions -> $Answer, small design/content -> $DFix, Computer Use UI/browser speed work -> $Computer-Use, code -> $Team. Use $From-Chat-IMG only for chat screenshot plus original attachments. Use $MAD-SKS only as an explicit scoped DB authorization modifier that can be combined with another $ route. No route may invent unrequested fallback implementation code.';

function commands(args = []) {
  if (flag(args, '--json')) return console.log(JSON.stringify({ aliases: ['sks', 'sneakoscope'], dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES, commands: COMMAND_CATALOG }, null, 2));
  console.log('ㅅㅋㅅ Commands\n');
  console.log('Aliases: sks, sneakoscope\n');
  const width = Math.max(...COMMAND_CATALOG.map((c) => c.usage.length));
  for (const c of COMMAND_CATALOG) console.log(`${c.usage.padEnd(width)}  ${c.description}`);
  console.log('\nCodex App $ Commands\n');
  console.log('Use these inside Codex App or another agent prompt. They are prompt routes, not terminal commands.\n');
  console.log(formatDollarCommandsDetailed());
  console.log(`\nCanonical Codex App picker skills: ${DOLLAR_COMMAND_ALIASES.map((x) => x.app_skill).join(', ')}`);
}

async function rootCommand(args = []) {
  const project = await findProjectRoot();
  const global = globalSksRoot();
  const active = await sksRoot();
  const result = {
    cwd: process.cwd(),
    mode: project ? 'project' : 'global',
    active_root: active,
    project_root: project,
    global_root: global,
    using_global_root: !project
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('SKS Root\n');
  console.log(`Mode:        ${result.mode}`);
  console.log(`Active root: ${active}`);
  console.log(`Project:     ${project || 'none'}`);
  console.log(`Global root: ${global}`);
  if (!project) console.log('\nNo project marker was found here, so SKS will use the per-user global runtime root. Run `sks bootstrap` to initialize the current directory as a project.');
}

function dollarCommands(args = []) {
  if (flag(args, '--json')) return console.log(JSON.stringify({ dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES }, null, 2));
  console.log('ㅅㅋㅅ $ Commands\n');
  console.log('Use these inside Codex App or another agent prompt. Shells treat $ as variable syntax, so these are prompt commands, not terminal commands.\n');
  console.log(formatDollarCommandsDetailed());
  console.log(`\nCanonical Codex App picker skills: ${DOLLAR_COMMAND_ALIASES.map((x) => x.app_skill).join(', ')}`);
  console.log(`\n${DOLLAR_DEFAULT_PIPELINE_TEXT}`);
}

function formatDollarCommandsDetailed(indent = '') {
  const width = Math.max(...DOLLAR_COMMANDS.map((c) => c.command.length));
  return DOLLAR_COMMANDS.map((c) => `${indent}${c.command.padEnd(width)}  ${c.route}: ${c.description}`).join('\n');
}

function formatDollarCommandsCompact(indent = '') {
  const width = Math.max(...DOLLAR_COMMANDS.map((c) => c.command.length));
  return DOLLAR_COMMANDS.map((c) => `${indent}${c.command.padEnd(width)}  ${c.route}`).join('\n');
}

function dollarCommandNames() {
  return DOLLAR_COMMANDS.map((c) => c.command).join(', ');
}

function dfixHelp() {
  console.log(`SKS DFix Mode

Prompt command:
  $DFix <small design/content request>

Examples:
  $DFix 글자 색 파란색으로 바꿔줘
  $DFix 내용을 영어로 바꿔줘
  $DFix Change the CTA label to "Start"

Purpose:
  Fast design/content fixes only. DFix bypasses the general SKS prompt pipeline and uses an ultralight, no-record task list.

Rules:
  List the exact micro-edits, inspect only needed files, apply only those edits.
  Do not run mission state, ambiguity gates, TriWiki/TriFix/reflection/state recording, Context7 routing, subagents, Goal, Research, eval, or broad redesign.
  Run only cheap verification when useful.
  Start the final answer with "DFix 완료 요약:" and include one "DFix 솔직모드:" line for verified, not verified, and remaining issues.
`);
}

async function context7(sub = 'check', args = []) {
  const action = sub || 'check';
  const setupScope = action === 'setup' ? readOption(args, '--scope', flag(args, '--global') ? 'global' : 'project') : null;
  const root = action === 'setup' && setupScope === 'project' ? await projectRoot() : await sksRoot();
  if (action === 'check') {
    const result = await checkContext7(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 MCP\n');
    console.log(`Project config: ${result.project.ok ? 'ok' : 'missing'} ${result.project.path}`);
    console.log(`Global config:  ${result.global.ok ? 'ok' : 'missing'} ${result.global.path}`);
    console.log(`Codex mcp list: ${result.codex_mcp_list.ok ? 'ok' : result.codex_mcp_list.checked ? 'missing' : 'not checked'}`);
    console.log(`Ready:          ${result.ok ? 'yes' : 'no'}`);
    if (!result.ok) console.log('\nRun: sks context7 setup --scope project');
    return;
  }
  if (action === 'tools') {
    const result = await context7Tools({ timeoutMs: readNumberOption(args, '--timeout-ms', 30000) });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 Local MCP Tools\n');
    console.log(`Server: ${result.server.info?.name || 'context7'} ${result.server.info?.version || ''}`.trim());
    console.log(`Command: ${result.server.command} ${result.server.args.join(' ')}`);
    console.log(`Tools:  ${result.tool_names.join(', ') || 'none'}`);
    if (!result.tool_names.includes('resolve-library-id') || !result.tool_names.some((name) => name === 'query-docs' || name === 'get-library-docs')) {
      process.exitCode = 1;
      console.log('\nContext7 local MCP is missing the required resolve/docs tools.');
    }
    return;
  }
  if (action === 'resolve') {
    const positional = positionalArgs(args);
    const libraryName = positional.join(' ').trim();
    if (!libraryName) throw new Error('Usage: sks context7 resolve <library-name> [--query "..."] [--json]');
    const result = await context7Resolve(libraryName, {
      query: readOption(args, '--query', libraryName),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 Resolve\n');
    console.log(`Library: ${libraryName}`);
    console.log(`ID:      ${result.library_id || 'not resolved'}`);
    console.log(`Server:  ${result.server.info?.name || 'context7'} ${result.server.info?.version || ''}`.trim());
    const text = context7Text(result.result).split(/\n/).slice(0, 24).join('\n').trim();
    if (text) console.log(`\n${text}`);
    if (!result.ok || !result.library_id) process.exitCode = 1;
    return;
  }
  if (action === 'docs') {
    const positional = positionalArgs(args);
    const libraryNameOrId = positional.join(' ').trim();
    if (!libraryNameOrId) throw new Error('Usage: sks context7 docs <library-name|/org/project> [--query "..."] [--topic "..."] [--tokens N] [--json]');
    const result = await context7Docs(libraryNameOrId, {
      query: readOption(args, '--query', readOption(args, '--topic', libraryNameOrId)),
      topic: readOption(args, '--topic', libraryNameOrId),
      tokens: readNumberOption(args, '--tokens', 2000),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    printContext7DocsResult(result, { title: 'SKS Context7 Docs' });
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'evidence') {
    const positional = positionalArgs(args);
    const missionArg = positional.shift();
    const libraryNameOrId = positional.join(' ').trim();
    if (!missionArg || !libraryNameOrId) throw new Error('Usage: sks context7 evidence <mission-id|latest> <library-name|/org/project> [--query "..."] [--topic "..."] [--tokens N] [--json]');
    const missionId = await resolveMissionId(root, missionArg);
    if (!missionId) throw new Error('No mission found for Context7 evidence.');
    const result = await context7Docs(libraryNameOrId, {
      query: readOption(args, '--query', readOption(args, '--topic', libraryNameOrId)),
      topic: readOption(args, '--topic', libraryNameOrId),
      tokens: readNumberOption(args, '--tokens', 2000),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    const state = { ...(await readJson(stateFile(root), {})), mission_id: missionId };
    await recordContext7Evidence(root, state, { tool_name: 'resolve-library-id', library: libraryNameOrId, library_id: result.library_id, source: result.resolve ? 'sks context7 evidence' : 'sks context7 evidence explicit-library-id' });
    if (result.docs_tool) {
      await recordContext7Evidence(root, state, { tool_name: result.docs_tool, library_id: result.library_id, source: 'sks context7 evidence' });
    }
    const evidence = await context7Evidence(root, state);
    const out = { ...result, mission_id: missionId, evidence };
    if (flag(args, '--json')) return console.log(JSON.stringify(out, null, 2));
    printContext7DocsResult(result, { title: 'SKS Context7 Evidence' });
    console.log(`\nMission:  ${missionId}`);
    console.log(`Evidence: ${evidence.ok ? 'ok' : 'missing'} resolve=${evidence.resolve ? 'yes' : 'no'} docs=${evidence.docs ? 'yes' : 'no'} events=${evidence.count}`);
    if (!result.ok || !evidence.ok) process.exitCode = 1;
    return;
  }
  if (action === 'setup') {
    const scope = setupScope;
    const transport = readOption(args, '--transport', flag(args, '--remote') ? 'remote' : 'local');
    if (!['project', 'global'].includes(scope)) throw new Error('Invalid Context7 scope. Use project or global.');
    if (!['local', 'remote'].includes(transport)) throw new Error('Invalid Context7 transport. Use local or remote.');
    if (scope === 'project') {
      const changed = await ensureProjectContext7Config(root, transport);
      const result = await checkContext7(root);
      if (flag(args, '--json')) return console.log(JSON.stringify({ changed, ...result }, null, 2));
      console.log(`Context7 project MCP ${changed ? 'configured' : 'already configured'} in .codex/config.toml`);
      console.log(`Ready: ${result.ok ? 'yes' : 'no'}`);
      return;
    }
    const codex = await getCodexInfo();
    if (!codex.bin) throw new Error('Codex CLI missing. Install separately: npm i -g @openai/codex, or set SKS_CODEX_BIN.');
    const cmdArgs = transport === 'remote'
      ? ['mcp', 'add', 'context7', '--url', 'https://mcp.context7.com/mcp']
      : ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'];
    const result = await runProcess(codex.bin, cmdArgs, { timeoutMs: 30000, maxOutputBytes: 64 * 1024 });
    if (flag(args, '--json')) return console.log(JSON.stringify({ command: `${codex.bin} ${cmdArgs.join(' ')}`, result }, null, 2));
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'codex mcp add failed');
    console.log('Context7 global MCP configured.');
    return;
  }
  throw new Error(`Unknown context7 command: ${action}`);
}

function printContext7DocsResult(result, opts = {}) {
  console.log(`${opts.title || 'SKS Context7 Docs'}\n`);
  console.log(`Library ID: ${result.library_id || 'not resolved'}`);
  console.log(`Docs tool:  ${result.docs_tool || 'missing'}`);
  console.log(`Server:     ${result.server?.info?.name || 'context7'} ${result.server?.info?.version || ''}`.trim());
  const text = context7Text(result.docs).split(/\n/).slice(0, 48).join('\n').trim();
  if (text) console.log(`\n${text}`);
  if (result.error) console.log(`\nError: ${result.error}`);
}

async function pipeline(sub = 'status', args = []) {
  const root = await sksRoot();
  const action = sub || 'status';
  if (action === 'answer') return pipelineAnswer(root, args);
  const state = await readJson(stateFile(root), {});
  const evidence = await context7Evidence(root, state);
  const stop = await evaluateStop(root, state, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  const result = {
    root,
    state,
    context7: evidence,
    stop_gate: state.stop_gate || null,
    next_action: stop?.reason || 'No active blocking route gate detected.'
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  if (action !== 'status' && action !== 'resume') throw new Error(`Unknown pipeline command: ${action}`);
  console.log('SKS Pipeline\n');
  console.log(`Mode:      ${state.mode || 'IDLE'}`);
  console.log(`Route:     ${state.route_command || state.route || 'none'}`);
  console.log(`Phase:     ${state.phase || 'IDLE'}`);
  console.log(`Mission:   ${state.mission_id || 'none'}`);
  console.log(`Reasoning: ${state.reasoning_effort || 'medium'}${state.reasoning_profile ? ` (${state.reasoning_profile})` : ''}${state.reasoning_temporary ? ' temporary' : ''}`);
  console.log(`Stop gate: ${state.stop_gate || 'none'}`);
  console.log(`Context7:  ${state.context7_required ? (evidence.ok ? 'ok' : 'required-missing') : 'optional'} (${evidence.count || 0} event(s))`);
  console.log(`Next:      ${result.next_action}`);
}

async function pipelineAnswer(root, args = []) {
  const [missionArg, answerFile] = args;
  const id = await resolveMissionId(root, missionArg);
  if (!id || !answerFile) throw new Error('Usage: sks pipeline answer <mission-id|latest> <answers.json>');
  const { dir, mission } = await loadMission(root, id);
  const answers = await readJson(path.resolve(answerFile));
  await writeJsonAtomic(path.join(dir, 'answers.json'), answers);
  const result = await sealContract(dir, mission);
  if (!result.ok) {
    console.error('Answer validation failed. SKS ambiguity gate remains locked.');
    console.error(JSON.stringify(result.validation, null, 2));
    process.exitCode = 2;
    return;
  }
  const routeContext = await readJson(path.join(dir, 'route-context.json'), {});
  const route = ROUTES.find((candidate) => candidate.id === routeContext.route || candidate.command === routeContext.command)
    || routePrompt(routeContext.command || routeContext.route || '$SKS');
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'pipeline.clarification.contract_sealed', route: route?.id || routeContext.route, hash: result.contract.sealed_hash });
  const materialized = await materializeAfterPipelineAnswer(root, id, dir, mission, route, routeContext, result.contract);
  if (route?.id === 'QALoop') await writeQaLoopArtifacts(dir, mission, result.contract);
  await setCurrent(root, {
    mission_id: id,
    route: route?.id || routeContext.route || 'SKS',
    route_command: route?.command || routeContext.command || '$SKS',
    mode: route?.mode || routeContext.mode || 'SKS',
    phase: materialized.phase || `${route?.mode || routeContext.mode || 'SKS'}_CLARIFICATION_CONTRACT_SEALED`,
    context7_required: Boolean(routeContext.context7_required),
    context7_verified: false,
    subagents_required: route ? routeRequiresSubagents(route, routeContext.task || mission.prompt || '') : false,
    subagents_verified: false,
    reflection_required: route ? reflectionRequiredForRoute(route) : false,
    visible_progress_required: true,
    context_tracking: 'triwiki',
    required_skills: route?.requiredSkills || [],
    stop_gate: route?.stopGate || routeContext.original_stop_gate || 'honest_mode',
    clarification_required: false,
    clarification_passed: true,
    ambiguity_gate_required: true,
    ambiguity_gate_passed: true,
    implementation_allowed: true,
    reasoning_effort: route ? routeReasoning(route, routeContext.task || mission.prompt || '').effort : 'medium',
    reasoning_profile: route ? routeReasoning(route, routeContext.task || mission.prompt || '').profile : 'sks-task-medium',
    reasoning_temporary: true,
    prompt: materialized.prompt || routeContext.task || mission.prompt || '',
    ...materialized.state
  });
  if (flag(args, '--json')) return console.log(JSON.stringify({ ok: true, mission_id: id, route: route?.id || routeContext.route, hash: result.contract.sealed_hash, validation: result.validation }, null, 2));
  console.log(`SKS ambiguity gate passed for ${id}`);
  console.log(`Route: ${route?.command || routeContext.command || '$SKS'}`);
  console.log(`Hash: ${result.contract.sealed_hash}`);
  console.log('Next: continue the original route lifecycle using decision-contract.json.');
}

async function materializeAfterPipelineAnswer(root, id, dir, mission, route, routeContext = {}, contract = {}) {
  const madSksState = await materializeMadSksAuthorization(dir, id, route, routeContext, contract);
  if (route?.id === 'MadSKS') {
    await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), {
      schema_version: 1,
      passed: false,
      mad_sks_permission_active: true,
      permissions_deactivated: false,
      supabase_mcp_schema_cleanup_allowed: true,
      direct_execute_sql_allowed: true,
      catastrophic_safety_guard_active: true,
      contract_hash: contract.sealed_hash || null
    });
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
      ts: nowIso(),
      type: 'mad_sks.scoped_permission_opened',
      route: route.id,
      catastrophic_safety_guard_active: true
    });
    return {
      phase: 'MADSKS_SCOPED_PERMISSION_ACTIVE',
      prompt: routeContext.task || mission.prompt || '',
      state: {
        mad_sks_active: true,
        mad_sks_modifier: true,
        mad_sks_gate_file: 'mad-sks-gate.json',
        mad_sks_gate_ready: true,
        supabase_mcp_schema_cleanup_allowed: true,
        direct_execute_sql_allowed: true,
        catastrophic_safety_guard_active: true
      }
    };
  }
  if (route?.id !== 'Team') return Object.keys(madSksState).length ? { state: madSksState } : {};
  const spec = parseTeamSpecText(routeContext.task || mission.prompt || '');
  const prompt = spec.prompt || routeContext.task || mission.prompt || '';
  const fromChatImgRequired = hasFromChatImgSignal(prompt);
  const plan = buildTeamPlan(id, prompt, {
    agentSessions: spec.agentSessions,
    roleCounts: spec.roleCounts,
    roster: spec.roster
  });
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
  await writeJsonAtomic(path.join(dir, 'team-roster.json'), { schema_version: 1, mission_id: id, role_counts: spec.roleCounts, agent_sessions: spec.agentSessions, bundle_size: spec.roster.bundle_size, roster: spec.roster, confirmed: true, source: 'default_or_prompt_team_spec' });
  await writeTextAtomic(path.join(dir, 'team-workflow.md'), teamWorkflowMarkdown(plan));
  await initTeamLive(id, dir, prompt, {
    agentSessions: spec.agentSessions,
    roleCounts: spec.roleCounts,
    roster: spec.roster
  });
  const runtime = await writeTeamRuntimeArtifacts(dir, plan, { contractHash: contract.sealed_hash || null });
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), {
    passed: false,
    team_roster_confirmed: true,
    analysis_artifact: false,
    triwiki_refreshed: false,
    triwiki_validated: false,
    consensus_artifact: false,
    ...runtime.gate_fields,
    implementation_team_fresh: false,
    review_artifact: false,
    integration_evidence: false,
    session_cleanup: false,
    context7_evidence: false,
    ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}),
    contract_hash: contract.sealed_hash || null
  });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'team.materialized_after_ambiguity_gate',
    route: route.id,
    bundle_size: spec.roster.bundle_size,
    agent_sessions: spec.agentSessions
  });
  return {
    phase: 'TEAM_PARALLEL_ANALYSIS_SCOUTING',
    prompt,
    state: {
      agent_sessions: spec.agentSessions,
      role_counts: spec.roleCounts,
      team_roster_confirmed: true,
      team_plan_ready: true,
      team_graph_ready: runtime.ok,
      team_live_ready: true,
      from_chat_img_required: fromChatImgRequired,
      ...madSksState
    }
  };
}

async function materializeMadSksAuthorization(dir, id, route, routeContext = {}, contract = {}) {
  if (!routeContext.mad_sks_authorization || route?.id === 'MadSKS') return {};
  const gateFile = route?.stopGate || 'done-gate.json';
  const artifact = {
    schema_version: 1,
    mission_id: id,
    route: route?.command || route?.id || null,
    status: 'active',
    active_only_for_current_route: true,
    deactivates_when_gate_passed: gateFile,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    catastrophic_safety_guard_active: true,
    contract_hash: contract.sealed_hash || null
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-authorization.json'), artifact);
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'mad_sks.modifier_authorization_opened',
    route: route?.id || null,
    gate: gateFile,
    catastrophic_safety_guard_active: true
  });
  return {
    mad_sks_active: true,
    mad_sks_modifier: true,
    mad_sks_gate_file: gateFile,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    catastrophic_safety_guard_active: true
  };
}

async function guard(sub = 'check', args = []) {
  const root = await projectRoot();
  const action = sub || 'check';
  if (action !== 'check' && action !== 'status') throw new Error(`Unknown guard command: ${action}`);
  const status = await harnessGuardStatus(root);
  if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
  console.log('SKS Harness Guard\n');
  console.log(`Status:    ${status.ok ? 'ok' : 'blocked'}`);
  console.log(`Locked:    ${status.locked ? 'yes' : 'no'}`);
  console.log(`Exception: ${status.source_exception ? 'Sneakoscope engine source repo' : 'none'}`);
  console.log(`Policy:    ${status.policy_path}${status.policy_exists ? '' : ' (missing)'}`);
  console.log(`Checked:   ${status.fingerprints_checked} fingerprint(s)`);
  if (status.missing.length) console.log(`Missing:   ${status.missing.join(', ')}`);
  if (status.changed.length) console.log(`Changed:   ${status.changed.join(', ')}`);
}

async function conflicts(sub = 'check', args = []) {
  const root = await projectRoot();
  const action = sub || 'check';
  if (action !== 'check' && action !== 'prompt') throw new Error(`Unknown conflicts command: ${action}`);
  const scan = await scanHarnessConflicts(root);
  const result = { ...scan, cleanup_prompt: scan.hard_block ? llmHarnessCleanupPrompt(scan) : null };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  if (action === 'prompt') return console.log(llmHarnessCleanupPrompt(scan));
  console.log('SKS Harness Conflict Check\n');
  console.log(`Status:    ${scan.hard_block ? 'blocked' : 'ok'}`);
  console.log(`Conflicts: ${scan.conflicts.length}`);
  if (scan.conflicts.length) console.log(formatHarnessConflictReport(scan));
}

async function versioning(sub = 'status', args = []) {
  const root = await projectRoot();
  const action = sub || 'status';
  if (action === 'status' || action === 'check') {
    const status = await versioningStatus(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log('SKS Project Versioning\n');
    console.log(`Enabled:   ${status.enabled ? 'yes' : 'no'}${status.reason ? ` (${status.reason})` : ''}`);
    console.log(`Version:   ${status.package_version || 'none'}`);
    console.log(`Bump:      ${status.bump || 'patch'}`);
    console.log(`Hook:      ${status.hook_installed ? 'installed' : 'missing'}${status.hook_path ? ` ${status.hook_path}` : ''}`);
    console.log(`Last seen: ${status.last_version || 'none'}`);
    if (!status.ok) console.log('Run: sks doctor --fix');
    return;
  }
  if (action === 'hook' || action === 'install-hook') {
    const res = await installVersionGitHook(root, await globalSksCommand());
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    console.log(res.installed ? `Version hook installed: ${res.hook_path}` : `Version hook skipped: ${res.reason}`);
    return;
  }
  if (action === 'bump') {
    const res = await runVersionPreCommit(root, { force: true });
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    if (!res.ok) {
      console.error(`Version bump failed: ${res.reason || 'unknown'}`);
      process.exitCode = 2;
      return;
    }
    console.log(res.changed ? `Project version bumped: ${res.previous_version} -> ${res.version}` : `Project version already advanced: ${res.version}`);
    console.log(`Staged: ${res.staged_files?.join(', ') || 'none'}`);
    return;
  }
  if (action === 'pre-commit') {
    const res = await runVersionPreCommit(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    if (!res.ok) {
      console.error(`SKS versioning failed: ${res.reason || 'unknown'}`);
      process.exitCode = 2;
      return;
    }
    if (res.skipped) return;
    console.log(res.changed ? `SKS versioning: ${res.previous_version} -> ${res.version}` : `SKS versioning: ${res.version} already unique`);
    return;
  }
  console.error('Usage: sks versioning status|bump|pre-commit [--json]');
  process.exitCode = 1;
}

async function reasoningCommand(args = []) {
  const prompt = promptOf(args);
  const route = routePrompt(prompt || '$SKS');
  const info = routeReasoning(route, prompt);
  const result = { route: route?.command || '$SKS', effort: info.effort, profile: info.profile, reason: info.reason, temporary: true, instruction: reasoningInstruction(info) };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('SKS Reasoning Route\n');
  console.log(`Route:      ${result.route}`);
  console.log(`Effort:     ${result.effort}`);
  console.log(`Profile:    ${result.profile}`);
  console.log(`Reason:     ${result.reason}`);
  console.log('Lifecycle:  temporary; return to default/user-selected profile after the route gate passes');
}

async function checkContext7(root) {
  const projectPath = path.join(root, '.codex', 'config.toml');
  const globalPath = path.join(process.env.HOME || '', '.codex', 'config.toml');
  const projectText = await safeReadText(projectPath);
  const globalText = await safeReadText(globalPath);
  const codex = await getCodexInfo().catch(() => ({}));
  let list = { checked: false, ok: false, stdout: '', stderr: '' };
  if (codex.bin) {
    const out = await runProcess(codex.bin, ['mcp', 'list'], { timeoutMs: 8000, maxOutputBytes: 32 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
    list = { checked: true, ok: out.code === 0 && /context7/i.test(`${out.stdout}\n${out.stderr}`), stdout: out.stdout || '', stderr: out.stderr || '' };
  }
  const result = {
    project: { path: projectPath, ok: hasContext7ConfigText(projectText) },
    global: { path: globalPath, ok: hasContext7ConfigText(globalText) },
    codex_mcp_list: list
  };
  result.ok = result.project.ok || result.codex_mcp_list.ok || (result.global.ok && !list.checked);
  return result;
}

async function ensureProjectContext7Config(root, transport = 'local') {
  const configPath = path.join(root, '.codex', 'config.toml');
  await ensureDir(path.dirname(configPath));
  const current = await safeReadText(configPath);
  const block = context7ConfigToml(transport).trim();
  const existingBlock = /(^|\n)\[mcp_servers\.context7\]\n[\s\S]*?(?=\n\[[^\]]+\]|\s*$)/;
  if (existingBlock.test(current)) {
    const next = current.replace(existingBlock, `$1${block}\n`);
    if (next === current) return false;
    await writeTextAtomic(configPath, next.endsWith('\n') ? next : `${next}\n`);
    return true;
  }
  if (hasContext7ConfigText(current)) return false;
  await writeTextAtomic(configPath, `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`);
  return true;
}

function readOption(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function readNumberOption(args, name, fallback) {
  const raw = readOption(args, name, null);
  if (raw === null || raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function warpCommand(sub = 'start', args = []) {
  const action = sub || 'start';
  if (action === 'status' || action === 'banner') {
    if (flag(args, '--json')) {
      const status = await codexAppIntegrationStatus();
      return console.log(JSON.stringify(status, null, 2));
    }
    await runWarpStatus(action === 'banner' ? ['--once', ...args] : args);
    return;
  }
  if (action === 'check') {
    const root = await sksRoot();
    const plan = await buildWarpLaunchPlan({ root, session: readOption(args, '--session', null) });
    if (flag(args, '--json')) return console.log(JSON.stringify(plan, null, 2));
    console.log(formatWarpBanner(plan.app));
    console.log('');
    console.log(`warp:      ${plan.warp.ok ? 'ok' : 'missing'} ${plan.warp.version || ''}`.trim());
    console.log(`Workspace: ${plan.workspace}`);
    console.log(`Project:   ${plan.root}`);
    console.log(`Ready:     ${plan.ready ? 'yes' : 'no'}`);
    if (!plan.ready) {
      console.log('\nBlockers:');
      for (const blocker of Array.from(new Set(plan.blockers))) console.log(`- ${blocker}`);
      process.exitCode = 1;
    }
    return;
  }
  if (['start', 'attach', 'connect', 'open'].includes(action)) {
    const result = await launchWarpUi(args);
    if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error('Usage: sks warp open|start|check|status|banner [--workspace name]');
  process.exitCode = 1;
}

async function madHighCommand(args = []) {
  const cleanArgs = args.filter((arg) => !['--mad', '--MAD', '--mad-sks', '--high', '--no-auto-install-warp'].includes(arg));
  if (flag(args, '--json')) {
    const profile = await enableMadHighProfile();
    return console.log(JSON.stringify(profile, null, 2));
  }
  const update = await maybePromptSksUpdateForMad(args);
  if (update.status === 'updated') {
    console.log(`SKS updated from ${PACKAGE_VERSION} to ${update.latest}. Rerun: sks --mad`);
    return;
  }
  if (update.status === 'failed') {
    console.error(`SKS update failed: ${update.error}`);
    process.exitCode = 1;
    return;
  }
  const deps = await ensureMadLaunchDependencies(args);
  if (!deps.ready) {
    console.error('SKS MAD launch blocked by missing dependencies.');
    for (const action of deps.actions) printDepsInstallAction(action);
    process.exitCode = 1;
    return;
  }
  const profile = await enableMadHighProfile();
  console.log(`SKS MAD auto-review profile ready: ${madHighProfileName()}`);
  console.log('Scope: explicit warp launch only; full access uses Codex auto_review approvals when approval prompts are raised.');
  const workspace = readOption(cleanArgs, '--workspace', readOption(cleanArgs, '--session', `sks-mad-${defaultWarpWorkspaceName(process.cwd())}`));
  return launchWarpUi([...cleanArgs, '--workspace', workspace], {
    codexArgs: ['--profile', profile.profile_name],
    autoInstallWarp: !flag(args, '--no-auto-install-warp'),
    conciseBlockers: true
  });
}

async function maybePromptSksUpdateForMad(args = []) {
  if (flag(args, '--json') || flag(args, '--skip-update-check') || process.env.SKS_SKIP_UPDATE_CHECK === '1') return { status: 'skipped' };
  const latest = await npmPackageVersion('sneakoscope');
  const currentPackage = await effectivePackageVersion();
  if (!latest.version || compareVersions(latest.version, currentPackage) <= 0) return { status: 'current', latest: latest.version || null, error: latest.error || null };
  const command = 'npm i -g sneakoscope@latest';
  if (flag(args, '--yes') || flag(args, '-y')) return installSksLatest(command, latest.version);
  if (!canAskYesNo()) {
    console.log(`SKS update available: ${currentPackage} -> ${latest.version}. Run: ${command}`);
    return { status: 'available', latest: latest.version, command };
  }
  const answer = (await askPostinstallQuestion(`SKS ${currentPackage} -> ${latest.version} update before MAD launch? [Y/n] `)).trim();
  const yes = answer === '' || /^(y|yes|예|네|응)$/i.test(answer);
  if (!yes) return { status: 'skipped_by_user', latest: latest.version, command };
  return installSksLatest(command, latest.version);
}

async function installSksLatest(command, latestVersion) {
  const npm = await which('npm').catch(() => null);
  if (!npm) return { status: 'failed', latest: latestVersion, command, error: 'npm not found on PATH' };
  const install = await runProcess(npm, ['i', '-g', 'sneakoscope@latest'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { status: 'failed', latest: latestVersion, command, error: `${install.stderr || install.stdout || command + ' failed'}`.trim() };
  return { status: 'updated', latest: latestVersion, command };
}

async function ensureMadLaunchDependencies(args = []) {
  const actions = [];
  if (!flag(args, '--skip-cli-tools')) {
    const codex = await getCodexInfo().catch(() => ({}));
    if (!codex.bin) actions.push(await installCodexDependency(args, { prompt: 'Codex CLI missing. Install latest Codex CLI with npm i -g @openai/codex@latest?' }));
  }
  if (!flag(args, '--no-auto-install-warp')) {
    const warp = await warpReadiness().catch(() => ({ ok: false }));
    if (!warp.ok) actions.push(await installWarpDependency(args));
  }
  const status = await depsStatus(await sksRoot());
  return { ready: Boolean(status.codex_cli.ok && status.warp.ok), actions, status };
}

async function deps(sub = 'check', args = []) {
  const action = sub || 'check';
  if (action === 'check' || action === 'status') {
    const root = await sksRoot();
    const status = await depsStatus(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    printDepsStatus(status);
    if (!status.ready) process.exitCode = 1;
    return;
  }
  if (action === 'install') return depsInstall(args);
  console.error('Usage: sks deps check|install [warp|codex|context7|all] [--yes] [--json]');
  process.exitCode = 1;
}

async function depsStatus(root = null, opts = {}) {
  root ||= await sksRoot();
  const npmBin = await which('npm').catch(() => null);
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const app = opts.codexApp || await codexAppIntegrationStatus({ codex });
  const context7 = opts.context7 || await checkContext7(root);
  const warp = opts.warp || await warpReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  const brew = process.platform === 'darwin' ? await which('brew').catch(() => null) : null;
  const globalBin = await discoverGlobalSksCommand();
  const npmPrefix = npmBin ? await runProcess(npmBin, ['prefix', '-g'], { timeoutMs: 8000, maxOutputBytes: 4096 }).catch(() => null) : null;
  const pathText = process.env.PATH || '';
  const npmPrefixDir = npmPrefix?.code === 0 ? npmPrefix.stdout.trim().split(/\r?\n/).pop() : null;
  const npmBinDir = npmPrefixDir ? (process.platform === 'win32' ? npmPrefixDir : path.join(npmPrefixDir, 'bin')) : null;
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  const homebrewNeeded = process.platform === 'darwin' && !warp.ok;
  return {
    root,
    ready: Boolean(nodeOk && npmBin && globalBin && codex.bin && context7.ok && warp.ok),
    node: { ok: nodeOk, version: process.version },
    npm: { ok: Boolean(npmBin), bin: npmBin, global_bin_dir: npmBinDir, global_bin_on_path: npmBinDir ? pathText.split(path.delimiter).includes(npmBinDir) : null },
    sneakoscope: { ok: Boolean(globalBin), bin: globalBin },
    codex_cli: { ok: Boolean(codex.bin), bin: codex.bin || null, version: codex.version || null },
    codex_app: app,
    context7,
    browser_use: { ok: app.mcp.has_browser_use, cache: app.plugins.browser_use_cache },
    computer_use: { ok: app.mcp.has_computer_use, cache: app.plugins.computer_use_cache },
    warp: { ok: Boolean(warp.ok), app: warp.app || null, cli: warp.cli || null, version: warp.version || null, launch_config_dir: warp.launch_config_dir || null, uri_scheme: warp.uri_scheme || null, install_hint: warp.ok ? null : platformWarpInstallHint(), error: warp.error || null },
    homebrew: process.platform === 'darwin' ? { ok: Boolean(brew), bin: brew, required_for_warp_install: homebrewNeeded } : { ok: null, bin: null, required_for_warp_install: false },
    next_actions: depsNextActions({ npmBin, globalBin, codex, app, context7, warp, brew, nodeOk })
  };
}

function depsNextActions({ npmBin, globalBin, codex, app, context7, warp, brew, nodeOk }) {
  const out = [];
  if (!nodeOk) out.push('Install Node.js 20.11+.');
  if (!npmBin) out.push('Install npm or use a Node.js distribution that includes npm.');
  if (!globalBin) out.push('Run: npm i -g sneakoscope');
  if (!codex.bin) out.push('Run: sks deps install codex');
  if (!context7.ok) out.push('Run: sks deps install context7');
  if (!app.ok) out.push('Run: sks codex-app check');
  if (!warp.ok) out.push(process.platform === 'darwin' && !brew ? 'Install Warp from https://www.warp.dev/download, or install Homebrew then run: sks deps install warp' : 'Run: sks deps install warp');
  return out;
}

function printDepsStatus(status) {
  console.log('SKS Dependencies\n');
  console.log(`Node:        ${status.node.ok ? 'ok' : 'missing'} ${status.node.version}`);
  console.log(`npm:         ${status.npm.ok ? 'ok' : 'missing'} ${status.npm.bin || ''}`.trimEnd());
  console.log(`npm bin PATH:${status.npm.global_bin_on_path === null ? ' unknown' : status.npm.global_bin_on_path ? ' ok' : ' missing'} ${status.npm.global_bin_dir || ''}`.trimEnd());
  console.log(`SKS bin:     ${status.sneakoscope.ok ? 'ok' : 'missing'} ${status.sneakoscope.bin || ''}`.trimEnd());
  console.log(`Codex CLI:   ${status.codex_cli.ok ? 'ok' : 'missing'} ${status.codex_cli.version || status.codex_cli.bin || ''}`.trimEnd());
  console.log(`Codex App:   ${status.codex_app.app.installed ? 'ok' : 'missing'}`);
  console.log(`Context7:    ${status.context7.ok ? 'ok' : 'missing'}`);
  console.log(`Browser Use: ${status.browser_use.ok ? 'ok' : 'missing'}`);
  console.log(`Computer Use:${status.computer_use.ok ? ' ok' : ' missing'}`);
  console.log(`warp:        ${warpStatusKind(status.warp)} ${status.warp.version || status.warp.error || ''}`.trimEnd());
  if (process.platform === 'darwin') console.log(`Homebrew:    ${status.homebrew.ok ? 'ok' : 'missing'} ${status.homebrew.bin || ''}`.trimEnd());
  console.log(`Ready:       ${status.ready ? 'true' : 'false'}`);
  if (status.next_actions.length) {
    console.log('\nNext:');
    for (const action of status.next_actions) console.log(`  ${action}`);
  }
}

async function depsInstall(args = []) {
  const root = await sksRoot();
  const target = positionalArgs(args)[0] || 'all';
  const wants = target === 'all' ? ['codex', 'context7', 'warp'] : [target];
  const actions = [];
  if (wants.includes('codex')) actions.push(await installCodexDependency(args));
  if (wants.includes('context7')) actions.push(await installContext7Dependency(root));
  if (wants.includes('warp')) actions.push(await installWarpDependency(args));
  const status = await depsStatus(root);
  const result = { target, actions, status };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  for (const action of actions) printDepsInstallAction(action);
  console.log('');
  printDepsStatus(status);
  if (!status.ready) process.exitCode = 1;
}

async function installCodexDependency(args = [], opts = {}) {
  const before = await getCodexInfo().catch(() => ({}));
  if (before.bin) return { target: 'codex', status: 'present', bin: before.bin, version: before.version || null };
  const command = 'npm i -g @openai/codex@latest';
  if (!await confirmInstall(opts.prompt || `Install Codex CLI with ${command}?`, args)) return { target: 'codex', status: 'needs_approval', command };
  return { target: 'codex', ...(await ensureCodexCliTool()) };
}

async function installContext7Dependency(root) {
  const before = await checkContext7(root);
  if (before.ok) return { target: 'context7', status: 'present' };
  const changed = await ensureProjectContext7Config(root);
  return { target: 'context7', status: changed ? 'project_configured' : 'already_configured', command: 'sks context7 check' };
}

async function installWarpDependency(args = []) {
  const before = await warpReadiness().catch(() => ({ ok: false }));
  if (before.ok) return { target: 'warp', status: 'present', version: before.version || null, app: before.app || null, cli: before.cli || null };
  const command = process.platform === 'darwin' ? 'brew install --cask warp' : platformWarpInstallHint();
  if (flag(args, '--dry-run')) return { target: 'warp', status: 'dry_run', command };
  return { target: 'warp', status: 'manual_required', command, error: before.error || 'Warp app not found' };
}

async function confirmInstall(question, args = []) {
  if (flag(args, '--yes') || flag(args, '-y')) return true;
  if (!canAskYesNo()) return false;
  return /^(y|yes|예|네|응)$/i.test((await askPostinstallQuestion(`${question} [y/N] `)).trim());
}

function canAskYesNo() {
  return Boolean(input.isTTY && output.isTTY && process.env.CI !== 'true');
}

function printDepsInstallAction(action) {
  if (!action) return;
  console.log(`${action.target}: ${action.status}${action.version ? ` ${action.version}` : ''}`);
  if (action.command) console.log(`  command: ${action.command}`);
  if (action.error) console.log(`  error: ${action.error}`);
}

async function autoReviewCommand(sub = 'status', args = []) {
  const action = sub || 'status';
  const high = flag(args, '--high') || action === '--high';
  const cleanArgs = args.filter((arg) => arg !== '--high');
  if (action === 'status' || action === 'check') {
    const status = await autoReviewStatus();
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log(autoReviewSummary(status));
    return;
  }
  if (action === 'disable') {
    const status = await disableAutoReview();
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log(autoReviewSummary(status));
    return;
  }
  if (action === 'enable') {
    const status = await enableAutoReview({ high });
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log(autoReviewSummary(status));
    console.log(`\nProfile ready: ${status.profile_name}`);
    console.log(`Launch: codex --profile ${status.profile_name}`);
    return;
  }
  if (['start', 'open', 'attach', '--high'].includes(action)) {
    const profile = autoReviewProfileName({ high });
    const status = await enableAutoReview({ high });
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log(`SKS Auto-Review enabled: ${profile}`);
    const sessionArg = readOption(cleanArgs, '--session', null);
    const session = sessionArg || sanitizeWarpWorkspaceName(`${profile}-${defaultWarpWorkspaceName(process.cwd())}`);
    return launchWarpUi([...cleanArgs, '--session', session], { codexArgs: ['--profile', profile] });
  }
  console.error('Usage: sks auto-review status|enable|disable|start [--high] [--json]');
  console.error('Alias: sks --Auto-review [--high]');
  process.exitCode = 1;
}

async function codexAppHelp(args = []) {
  const action = args[0] || 'help';
  if (action === 'check' || action === 'status') {
    const status = await codexAppIntegrationStatus();
    const skills = await codexAppSkillReadiness();
    const readiness = { ...status, ok: status.ok && skills.ok, runtime_ok: status.ok, skills };
    if (flag(args, '--json')) return console.log(JSON.stringify(readiness, null, 2));
    console.log(formatCodexAppStatus(status, { includeRaw: flag(args, '--verbose') }));
    console.log('');
    console.log(`Project $ skills: ${skills.project.ok ? 'ok' : `missing ${skills.project.missing.length}`} ${skills.project.root}`);
    console.log(`Global $ skills:  ${skills.global.ok ? 'ok' : `missing ${skills.global.missing.length}`} ${skills.global.root}`);
    if (!skills.ok) console.log('Run: sks bootstrap, or sks doctor --fix');
    if (!readiness.ok) process.exitCode = 1;
    return;
  }
  if (action === 'open') {
    const status = await codexAppIntegrationStatus();
    if (status.app.installed && process.platform === 'darwin') await runProcess('open', ['-a', 'Codex'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch(() => null);
    else if (process.platform === 'darwin') await runProcess('open', [CODEX_APP_DOCS_URL], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch(() => null);
    console.log(formatCodexAppStatus(status));
    return;
  }
  const status = await codexAppIntegrationStatus();
  const skills = await codexAppSkillReadiness();
  console.log([
    'ㅅㅋㅅ Codex App', '',
    formatCodexAppStatus(status), '',
    `Skills: project=${skills.project.ok ? 'ok' : `missing ${skills.project.missing.length}`} global=${skills.global.ok ? 'ok' : `missing ${skills.global.missing.length}`}`, '',
    'Setup:', '  sks bootstrap', '  sks deps check', '  sks codex-app check', '  sks warp check', '',
    'Generated files:', '  .codex/config.toml', '  .codex/hooks.json', '  .agents/skills/', '  .codex/agents/', '  .codex/SNEAKOSCOPE.md', '  AGENTS.md', '',
    'Git ignore:', '  default setup writes .gitignore entries for .sneakoscope/, .codex/, .agents/, AGENTS.md', '  --local-only writes those patterns to .git/info/exclude instead', '',
    'Prompt routes:', formatDollarCommandsCompact('  ')
  ].join('\n'));
}

function aliases() {
  console.log(`ㅅㅋㅅ Aliases

Binary aliases:
  sks
  sneakoscope

Command aliases:
  sks memory    -> sks gc
  sks --help    -> sks help
  sks -h        -> sks help

Codex App prompt commands:
${formatDollarCommandsCompact('  ')}

Examples:
  sks setup
  sneakoscope setup
  sks commands
  sneakoscope commands
`);
}

function usage(args = []) {
  const topic = String(args[0] || 'overview').toLowerCase();
  const blocks = {
    overview: ['ㅅㅋㅅ Usage', '', 'Discover:', '  sks commands', '  sks quickstart', '  sks root', '  sks bootstrap', '  sks deps check', '  sks codex-app check', '  sks warp check', '  sks dollar-commands', '', `Topics: ${USAGE_TOPICS}`],
    install: ['Install', '', '  npm i -g sneakoscope', '  sks root', '  sks', '', 'Project bootstrap:', '  sks bootstrap', '', 'Fallback:', '  npx -y -p sneakoscope sks root', '', 'Project:', '  npm i -D sneakoscope', '  npx sks setup --install-scope project'],
    bootstrap: ['Bootstrap', '', '  sks bootstrap', '  sks setup --bootstrap', '', 'Creates project SKS files, Codex App skills/hooks/config, state/guard files, then checks Codex App, Context7, and warp.'],
    root: ['Root', '', '  sks root [--json]', '', 'Inside a project, SKS uses that project root. Outside any project marker, runtime commands use the per-user global SKS root instead of writing .sneakoscope into the current random folder.'],
    deps: ['Dependencies', '', '  sks deps check [--json]', '  sks deps install [warp|codex|context7|all] [--yes]', '', 'warp on macOS uses Homebrew only after approval.'],
    warp: ['warp', '', '  sks warp open', '  sks warp check', '  sks warp status --once', '  sks deps install warp', '', 'Warp launch is explicit. Running bare `sks` prints help and never opens Warp by itself.'],
    team: ['Team', '', '  sks team "task" executor:5 reviewer:2 user:1', '  sks team watch latest', '  sks team lane latest --agent analysis_scout_1 --follow', '  sks team message latest --from analysis_scout_1 --to executor_1 --message "handoff note"', '  sks team cleanup-warp latest', '', '$Team runs questions -> contract -> scouts -> TriWiki attention -> debate -> runtime graph/inbox -> fresh executors -> review -> cleanup -> reflection -> Honest.'],
    'qa-loop': ['QA-LOOP', '', '  sks qa-loop prepare "QA this app"', '  sks qa-loop answer <MISSION_ID> answers.json', '  sks qa-loop run <MISSION_ID> --max-cycles 8', '', 'Report: YYYY-MM-DD-v<version>-qa-report.md'],
    goal: ['Goal', '', '  sks goal create "task"', '  sks goal status latest', '  sks goal pause latest', '  sks goal resume latest', '  sks goal clear latest'],
    'codex-app': ['Codex App', '', '  sks bootstrap', '  sks codex-app check', '  sks dollar-commands', '  cat .codex/SNEAKOSCOPE.md'],
    dollar: ['Dollar Commands', '', formatDollarCommandsCompact('  '), '', 'Terminal: sks dollar-commands [--json]'],
    wiki: ['TriWiki', '', '  sks wiki pack', '  sks wiki refresh [--prune]', '  sks wiki sweep latest --json', '  sks wiki validate .sneakoscope/wiki/context-pack.json', '  sks wiki prune --dry-run --json', '', 'Packs include attention.use_first and attention.hydrate_first for compact recall plus source hydration. Sweep records intentional forgetting and promotion candidates.'],
    harness: ['Harness Growth', '', '  sks harness fixture --json', '  sks harness review --json', '', 'Runs deterministic fixtures for deliberate forgetting, skill cards, harness experiments, tool error taxonomy, permission profiles, MultiAgentV2, and Warp cockpit views.'],
    'code-structure': ['Code Structure', '', '  sks code-structure scan', '  sks code-structure scan --json', '', 'Flags handwritten source files above 1000/2000/3000-line thresholds and records split-review exceptions.'],
    gx: ['GX', '', '  sks gx init architecture-atlas', '  sks gx render architecture-atlas --format all', '  sks gx validate architecture-atlas']
  };
  const catalog = COMMAND_CATALOG.find((c) => c.name === topic);
  const fallback = catalog ? [catalog.name, '', `Usage: ${catalog.usage}`, catalog.description, '', 'Run sks commands for the full catalog.'] : blocks.overview;
  console.log((blocks[topic] || fallback).join('\n'));
}

async function bootstrap(args = []) {
  const root = await projectRoot();
  const conflicts = await scanHarnessConflicts(root);
  if (conflicts.hard_block) return blockForHarnessConflicts(conflicts, args);
  const installScope = installScopeFromArgs(args);
  const localOnly = flag(args, '--local-only');
  const globalCommand = await globalSksCommand();
  const initRes = await initProject(root, { force: flag(args, '--force'), installScope, globalCommand, localOnly, repair: true });
  const wikiMigration = await migrateWikiContextPack(root);
  const globalSkills = localOnly
    ? { status: 'skipped', reason: '--local-only', root: globalCodexSkillsRoot() }
    : await ensureGlobalCodexSkillsDuringInstall({ force: flag(args, '--force') });
  const cliTools = await ensureRelatedCliTools(args);
  const context7Status = await checkContext7(root);
  const appRuntime = await codexAppIntegrationStatus({ codex: await getCodexInfo().catch(() => ({})) });
  const deps = await depsStatus(root, { context7: context7Status, codexApp: appRuntime, warp: cliTools.warp });
  const install = await installStatus(root, installScope, { globalCommand });
  const versioningInfo = await versioningStatus(root);
  const skills = await checkRequiredSkills(root);
  const guard = await harnessGuardStatus(root);
  const files = await codexAppFilesStatus(root, skills, versioningInfo);
  const ready = Boolean(!conflicts.hard_block && install.ok && files.ok && skills.ok && guard.ok && context7Status.ok && appRuntime.ok && deps.warp.ok);
  const result = {
    root,
    ready,
    project_setup: { ok: files.ok, files, created: initRes.created },
    triwiki: { migrated: wikiMigration },
    install,
    cli_tools: cliTools,
    codex_app: appRuntime,
    global_skills: globalSkills,
    context7: context7Status,
    warp: deps.warp,
    harness_guard: guard,
    deps,
    next: ready ? ['sks', '$Team implement ...', '$QA-LOOP run ...'] : deps.next_actions
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('SKS Ready\n');
  console.log(`Project setup: ${files.ok ? 'ok' : 'missing'}`);
  console.log(`Codex App:     ${appRuntime.ok ? 'ok' : 'needs setup'}`);
  console.log(`Skills:        ${skills.ok ? 'ok' : `missing ${skills.missing.length}`}`);
  console.log(`Hooks:         ${files.hooks.ok ? 'ok' : 'missing'}`);
  console.log(`Harness guard: ${guard.ok ? 'ok' : 'blocked'}`);
  console.log(`Context7:      ${context7Status.ok ? 'ok' : 'missing'}`);
  console.log(`warp:          ${deps.warp.ok ? 'ok' : 'missing'}${deps.warp.version ? ` ${deps.warp.version}` : ''}`);
  console.log(`ready:         ${ready ? 'true' : 'false'}`);
  if (!ready) {
    console.log('\nNext:');
    const actions = Array.from(new Set([
      ...deps.next_actions,
      ...(!install.ok ? [install.scope === 'project' ? 'npm i -D sneakoscope' : 'npm i -g sneakoscope'] : []),
      ...(!files.ok || !skills.ok || !guard.ok ? ['sks doctor --fix'] : [])
    ]));
    for (const action of actions) console.log(`  ${action}`);
    if (!flag(args, '--from-postinstall')) process.exitCode = 1;
    return;
  }
  console.log('\nNext:');
  console.log('  sks');
  console.log('  $Team implement ...');
  console.log('  $QA-LOOP run ...');
}

async function codexAppFilesStatus(root, skills = null, versioningInfo = null) {
  skills ||= await checkRequiredSkills(root);
  versioningInfo ||= await versioningStatus(root);
  const status = {
    config: { ok: await exists(path.join(root, '.codex', 'config.toml')) },
    hooks: { ok: await exists(path.join(root, '.codex', 'hooks.json')) },
    skills,
    agents: { ok: await exists(path.join(root, '.codex', 'agents')) },
    quick_reference: { ok: await exists(path.join(root, '.codex', 'SNEAKOSCOPE.md')) },
    agents_rules: { ok: await exists(path.join(root, 'AGENTS.md')) },
    versioning: versioningInfo
  };
  status.ok = status.config.ok && status.hooks.ok && status.skills.ok && status.agents.ok && status.quick_reference.ok && status.agents_rules.ok;
  return status;
}

async function setup(args) {
  if (flag(args, '--bootstrap')) return bootstrap(args.filter((arg) => arg !== '--bootstrap'));
  const root = await projectRoot();
  const conflicts = await scanHarnessConflicts(root);
  if (conflicts.hard_block) return blockForHarnessConflicts(conflicts, args);
  const installScope = installScopeFromArgs(args);
  const localOnly = flag(args, '--local-only');
  const cliTools = await ensureRelatedCliTools(args);
  const globalCommand = await globalSksCommand();
  const res = await initProject(root, { force: flag(args, '--force'), installScope, globalCommand, localOnly });
  const wikiMigration = await migrateWikiContextPack(root);
  const globalSkills = localOnly
    ? { status: 'skipped', reason: '--local-only', root: globalCodexSkillsRoot() }
    : await ensureGlobalCodexSkillsDuringInstall({ force: flag(args, '--force') });
  const install = await installStatus(root, installScope, { globalCommand });
  const versioningInfo = await versioningStatus(root);
  const appRuntime = await codexAppIntegrationStatus();
  const hooksPath = path.join(root, '.codex', 'hooks.json');
  const result = {
    root,
    cli_tools: cliTools,
    install,
    hooks: hooksPath,
    codex_app: {
      config: path.join(root, '.codex', 'config.toml'),
      hooks: hooksPath,
      skills: path.join(root, '.agents', 'skills'),
      global_skills: globalSkills.root,
      agents: path.join(root, '.codex', 'agents'),
      quick_reference: path.join(root, '.codex', 'SNEAKOSCOPE.md'),
      agents_rules: path.join(root, 'AGENTS.md')
    },
    codex_app_runtime: appRuntime,
    global_skills: globalSkills,
    triwiki: { migrated: wikiMigration },
    created: res.created,
    versioning: versioningInfo,
    local_only: localOnly,
    next: ['sks context7 check', 'sks selftest --mock', 'sks doctor', 'sks commands']
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('ㅅㅋㅅ Setup\n');
  console.log(`Project:   ${root}`);
  console.log(`Install:   ${install.ok ? 'ok' : 'missing'} ${install.scope} (${install.command_prefix})`);
  console.log(`CLI tools: Codex ${formatCodexCliToolStatus(cliTools.codex)}; warp ${warpStatusKind(cliTools.warp)} ${cliTools.warp.version || cliTools.warp.error || ''}`.trimEnd());
  console.log(`Hooks:     ${path.relative(root, hooksPath)}`);
  console.log(`Version:   ${versioningInfo.enabled ? (versioningInfo.hook_installed ? 'auto-bump enabled' : 'auto-bump hook missing') : 'not enabled'}${versioningInfo.package_version ? ` (${versioningInfo.package_version})` : ''}`);
  if (localOnly) console.log('Git:       local-only (.git/info/exclude; user AGENTS preserved, SKS managed block refreshed)');
  else console.log('Git:       .gitignore ignores SKS generated files');
  console.log(`Codex App: .codex/config.toml, .codex/hooks.json, .agents/skills, .codex/agents, .codex/SNEAKOSCOPE.md`);
  console.log(`Global $:  ${globalSkills.status === 'installed' ? 'ok' : globalSkills.status} ${globalSkills.root || ''}`.trimEnd());
  console.log(`App tools: ${appRuntime.ok ? 'ok' : 'needs setup'} Codex App=${appRuntime.app.installed ? 'ok' : 'missing'} Browser Use=${appRuntime.mcp.has_browser_use ? 'ok' : 'missing'} Computer Use=${appRuntime.mcp.has_computer_use ? 'ok' : 'missing'}`);
  console.log(`Prompt:    intent-first routing, $Answer fact-check route, $DFix ultralight design/content route, Context7 gate`);
  console.log(`Skills:    .agents/skills`);
  console.log(`Next:      sks context7 check; sks selftest --mock; sks commands; sks dollar-commands`);
  if (cliTools.codex.status === 'failed') console.log(`\nCodex CLI install failed. Run manually: npm i -g @openai/codex. ${cliTools.codex.error || ''}`.trim());
  if (cliTools.codex.status === 'installed_not_on_path') console.log(`\nCodex CLI installed but not on PATH. ${cliTools.codex.hint}`);
  if (!cliTools.warp.ok) console.log(`\nwarp ${warpStatusKind(cliTools.warp)}. Install: ${cliTools.warp.install_hint}`);
  if (!install.ok && install.scope === 'global') console.log('\nGlobal command missing. Run: npm i -g sneakoscope');
  if (!install.ok && install.scope === 'project') console.log('\nProject package missing. Run: npm i -D sneakoscope');
  if (!appRuntime.ok) console.log('\nCodex App and first-party Codex Computer Use are required for SKS QA/visual evidence; Browser Use is not a UI verification substitute. Run: sks codex-app check');
}

function formatCodexCliToolStatus(status = {}) {
  if (status.status === 'present') return `ok ${status.version || status.bin || ''}`.trim();
  if (status.status === 'installed') return `installed ${status.version || status.bin || ''}`.trim();
  if (status.status === 'installed_not_on_path') return 'installed, not on PATH';
  if (status.status === 'skipped') return `skipped (${status.reason})`;
  if (status.status === 'failed') return 'install failed';
  return status.status || 'unknown';
}

async function fixPath(args) {
  const root = await projectRoot();
  const conflicts = await scanHarnessConflicts(root);
  if (conflicts.hard_block) return blockForHarnessConflicts(conflicts, args);
  const manifest = await readJson(path.join(root, '.sneakoscope', 'manifest.json'), null);
  const installScope = args.includes('--install-scope') || flag(args, '--project') || flag(args, '--global')
    ? installScopeFromArgs(args)
    : normalizeInstallScope(manifest?.installation?.scope || 'global');
  const globalCommand = await globalSksCommand();
  await initProject(root, { installScope, globalCommand, localOnly: flag(args, '--local-only') || Boolean(manifest?.git?.local_only) });
  const install = await installStatus(root, installScope, { globalCommand });
  const result = {
    root,
    install_scope: installScope,
    hook_command_prefix: sksCommandPrefix(installScope, { globalCommand }),
    hooks: path.join(root, '.codex', 'hooks.json'),
    install
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('SKS hook path refreshed\n');
  console.log(`Project:   ${root}`);
  console.log(`Install:   ${install.ok ? 'ok' : 'missing'} ${install.scope} (${install.command_prefix})`);
  console.log(`Hooks:     .codex/hooks.json`);
  if (!install.ok && install.scope === 'global') console.log('\nGlobal command missing. Run: npm i -g sneakoscope');
  if (!install.ok && install.scope === 'project') console.log('\nProject package missing. Run: npm i -D sneakoscope');
}

async function doctor(args) {
  const root = await sksRoot();
  const requestedScope = args.includes('--install-scope') || flag(args, '--project') || flag(args, '--global')
    ? installScopeFromArgs(args)
    : null;
  let conflictScan = await scanHarnessConflicts(root);
  let repairApplied = false;
  let globalSkillsRepair = null;
  if (flag(args, '--fix') && !conflictScan.hard_block) {
    const fixScope = requestedScope || 'global';
    const existingManifest = await readJson(path.join(root, '.sneakoscope', 'manifest.json'), null);
    await initProject(root, { installScope: fixScope, globalCommand: await globalSksCommand(), localOnly: flag(args, '--local-only') || Boolean(existingManifest?.git?.local_only), force: true, repair: true });
    if (!flag(args, '--local-only')) globalSkillsRepair = await ensureGlobalCodexSkillsDuringInstall({ force: true });
    repairApplied = true;
    conflictScan = await scanHarnessConflicts(root);
  }
  const codex = await getCodexInfo();
  const rust = await rustInfo();
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  const storage = await storageReport(root);
  const pkgBytes = await dirSize(packageRoot()).catch(() => 0);
  const manifest = await readJson(path.join(root, '.sneakoscope', 'manifest.json'), null);
  const installScope = requestedScope || normalizeInstallScope(manifest?.installation?.scope || 'global');
  const install = await installStatus(root, installScope);
  const dbPolicyExists = await exists(path.join(root, '.sneakoscope', 'db-safety.json'));
  const dbScan = await scanDbSafety(root).catch((err) => ({ ok: false, findings: [{ id: 'db_safety_scan_failed', severity: 'high', reason: err.message }] }));
  const context7Status = await checkContext7(root);
  const appRuntime = await codexAppIntegrationStatus({ codex });
  const warpStatus = await warpReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  const skillStatus = await checkRequiredSkills(root);
  const globalSkillStatus = await checkRequiredSkills(null, globalCodexSkillsRoot());
  const guardStatus = await harnessGuardStatus(root);
  const versioningInfo = await versioningStatus(root);
  const codexApp = await codexAppFilesStatus(root, skillStatus, versioningInfo);
  codexApp.global_skills = globalSkillStatus;
  const result = {
    node: { ok: nodeOk, version: process.version }, root, codex, rust,
    install,
    repair: { applied: repairApplied, global_skills: globalSkillsRepair, blocked_by_other_harness: flag(args, '--fix') && conflictScan.hard_block },
    harness_conflicts: {
      ok: conflictScan.ok,
      hard_block: conflictScan.hard_block,
      requires_human_approval: conflictScan.requires_human_approval,
      conflicts: conflictScan.conflicts,
      cleanup_prompt: conflictScan.hard_block ? llmHarnessCleanupPrompt(conflictScan) : null
    },
    sneakoscope: { ok: await exists(path.join(root, '.sneakoscope')) },
    context7: context7Status,
    codex_app_runtime: appRuntime,
    runtime: { warp: { ok: Boolean(warpStatus.ok), app: warpStatus.app || null, cli: warpStatus.cli || null, version: warpStatus.version || null, launch_config_dir: warpStatus.launch_config_dir || null, uri_scheme: warpStatus.uri_scheme || null, install_hint: warpStatus.ok ? null : platformWarpInstallHint(), error: warpStatus.error || null } },
    harness_guard: guardStatus,
    versioning: versioningInfo,
    db_guard: { ok: dbPolicyExists && dbScan.ok, policy: dbPolicyExists ? await loadDbSafetyPolicy(root) : null, scan: dbScan },
    hooks: { ok: await exists(path.join(root, '.codex', 'hooks.json')) },
    skills: skillStatus,
    global_skills: globalSkillStatus,
    codex_app: {
      ...codexApp
    },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) }, storage
  };
  result.ready = !result.harness_conflicts.hard_block && nodeOk && Boolean(codex.bin) && install.ok && result.sneakoscope.ok && result.context7.ok && appRuntime.ok && result.runtime.warp.ok && result.harness_guard.ok && result.versioning.ok && result.db_guard.ok && result.codex_app.ok && result.skills.ok && result.global_skills.ok;
  if (result.harness_conflicts.hard_block) process.exitCode = 1;
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('ㅅㅋㅅ Doctor\n');
  console.log(`Node:      ${nodeOk ? 'ok' : 'fail'} ${process.version}`);
  console.log(`Project:   ${root}`);
  console.log(`Codex:     ${codex.bin ? 'ok' : 'missing'} ${codex.version || ''}`);
  console.log(`Install:   ${install.ok ? 'ok' : 'missing'} ${install.scope} (${install.command_prefix})`);
  console.log(`Conflicts: ${result.harness_conflicts.hard_block ? 'blocked' : 'ok'} ${result.harness_conflicts.conflicts.length} finding(s)`);
  if (repairApplied) console.log('Repair:    regenerated SKS managed files from the installed package template');
  if (globalSkillsRepair) console.log(`Global $ repair: ${globalSkillsRepair.status} ${globalSkillsRepair.root || ''}`.trimEnd());
  if (flag(args, '--fix') && result.harness_conflicts.hard_block) console.log('Repair:    skipped because another Codex harness needs human-approved removal first');
  console.log(`Rust acc.: ${rust.available ? rust.version : 'optional-missing'}`);
  console.log(`State:     ${result.sneakoscope.ok ? 'ok' : 'missing .sneakoscope'}`);
  console.log(`Context7:  ${result.context7.ok ? 'ok' : 'missing MCP config'} project=${result.context7.project.ok ? 'ok' : 'missing'} global=${result.context7.global.ok ? 'ok' : 'missing'}`);
  console.log(`App tools: ${appRuntime.ok ? 'ok' : 'needs setup'} Codex App=${appRuntime.app.installed ? 'ok' : 'missing'} Browser Use=${appRuntime.mcp.has_browser_use ? 'ok' : 'missing'} Computer Use=${appRuntime.mcp.has_computer_use ? 'ok' : 'missing'}`);
  console.log(`warp:      ${warpStatusKind(result.runtime.warp)} ${result.runtime.warp.version || result.runtime.warp.error || ''}`.trimEnd());
  console.log(`Guard:     ${result.harness_guard.ok ? 'ok' : 'blocked'}${result.harness_guard.source_exception ? ' source-exception' : ''}`);
  console.log(`Version:   ${result.versioning.ok ? 'ok' : 'missing'}${result.versioning.enabled ? ` ${result.versioning.package_version || ''}` : ` ${result.versioning.reason || 'disabled'}`}`);
  console.log(`DB Guard:  ${result.db_guard.ok ? 'ok' : 'blocked'} ${dbScan.findings?.length || 0} finding(s)`);
  console.log(`Hooks:     ${result.hooks.ok ? 'ok' : 'missing .codex/hooks.json'}`);
  console.log(`Codex App: ${result.codex_app.ok ? 'ok' : 'missing app files'} .codex/config.toml .codex/hooks.json .agents/skills .codex/agents .codex/SNEAKOSCOPE.md`);
  console.log(`Skills:    ${result.skills.ok ? 'ok' : `missing ${result.skills.missing.length} skill(s)`}`);
  console.log(`Global $:  ${result.global_skills.ok ? 'ok' : `missing ${result.global_skills.missing.length} skill(s)`} ${result.global_skills.root}`);
  console.log(`Package:   ${result.package.human}`);
  console.log(`Storage:   ${storage.total_human || '0 B'}`);
  console.log(`Ready:     ${result.ready ? 'yes' : 'no'}`);
  if (!codex.bin) console.log('\nCodex CLI missing. Install separately: npm i -g @openai/codex, or set SKS_CODEX_BIN.');
  if (!install.ok && install.scope === 'global') console.log('SKS global command missing. Install: npm i -g sneakoscope');
  if (!install.ok && install.scope === 'project') console.log('SKS project package missing. Install in this project: npm i -D sneakoscope');
  if (result.harness_conflicts.hard_block) console.log(`\n${formatHarnessConflictReport(conflictScan)}`);
  if (!result.context7.ok) console.log('Context7 MCP missing. Run: sks context7 setup --scope project');
  if (!appRuntime.ok) console.log('Codex App or first-party MCP/plugin tools missing. Run: sks codex-app check');
  if (!result.runtime.warp.ok) console.log('Warp missing. Run: sks deps install warp');
  if (!result.harness_guard.ok) console.log('Harness guard failed. Run: sks setup from a real terminal, then sks guard check.');
  if (!result.versioning.ok) console.log('Versioning hook missing. Run: sks versioning hook, or sks doctor --fix.');
  if (!result.skills.ok) console.log(`Missing skills: ${result.skills.missing.join(', ')}. Run: sks setup`);
  if (!result.global_skills.ok) console.log(`Missing global $ skills: ${result.global_skills.missing.join(', ')}. Run: npm i -g sneakoscope, or sks setup from a non-local-only run.`);
  const blocked = [];
  if (!result.runtime.warp.ok) blocked.push(['Warp is missing', 'sks deps install warp']);
  if (!appRuntime.ok) blocked.push(['Codex App or first-party MCP/plugin tools need setup', 'sks codex-app check']);
  if (blocked.length) {
    console.log('\nBlocked:');
    for (const [reason] of blocked) console.log(`- ${reason}`);
    console.log('\nRun:');
    for (const [, command] of blocked) console.log(`  ${command}`);
  }
  if (!result.ready && !flag(args, '--fix')) console.log('Run: sks doctor --fix');
}

async function checkRequiredSkills(root, skillRoot = path.join(root, '.agents', 'skills')) {
  const expected = Array.from(new Set([
    ...DOLLAR_SKILL_NAMES,
    ...RECOMMENDED_SKILLS
  ])).sort();
  const missing = [];
  for (const name of expected) {
    if (!(await exists(path.join(skillRoot, name, 'SKILL.md')))) missing.push(name);
  }
  return { ok: missing.length === 0, root: skillRoot, expected, missing };
}

async function codexAppSkillReadiness(root = null) {
  root ||= await sksRoot();
  const project = await checkRequiredSkills(root);
  const global = await checkRequiredSkills(null, globalCodexSkillsRoot());
  return { ok: project.ok || global.ok, project, global };
}

function globalCodexSkillsRoot(home = process.env.HOME || os.homedir()) {
  return path.join(home, '.agents', 'skills');
}

async function init(args) {
  const root = await projectRoot();
  const conflicts = await scanHarnessConflicts(root);
  if (conflicts.hard_block) return blockForHarnessConflicts(conflicts, args);
  const installScope = installScopeFromArgs(args);
  const localOnly = flag(args, '--local-only');
  const globalCommand = await globalSksCommand();
  const res = await initProject(root, { force: flag(args, '--force'), installScope, globalCommand, localOnly });
  console.log(`Initialized ㅅㅋㅅ in ${root}`);
  console.log(`Install scope: ${installScope} (${sksCommandPrefix(installScope, { globalCommand })})`);
  if (localOnly) console.log('Git mode: local-only (.git/info/exclude)');
  else console.log('Git mode: shared .gitignore');
  for (const x of res.created) console.log(`- ${x}`);
}

function blockForHarnessConflicts(scan, args = []) {
  const result = { ready: false, install_blocked: true, harness_conflicts: scan, cleanup_prompt: llmHarnessCleanupPrompt(scan) };
  process.exitCode = 1;
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.error(formatHarnessConflictReport(scan));
  console.error('\nSKS setup cannot continue while another Codex harness is present.');
}

async function globalSksCommand() {
  return await discoverGlobalSksCommand() || 'sks';
}

async function installStatus(root, scope, opts = {}) {
  const discoveredGlobalBin = await discoverGlobalSksCommand();
  const configuredGlobalBin = await configuredSksBin(opts.globalCommand);
  const globalBin = configuredGlobalBin || discoveredGlobalBin;
  const commandPrefix = sksCommandPrefix(scope, { globalCommand: globalBin || undefined });
  const projectBin = path.join(root, 'node_modules', 'sneakoscope', 'bin', 'sks.mjs');
  const projectBinExists = await exists(projectBin);
  return {
    scope,
    default_scope: 'global',
    command_prefix: commandPrefix,
    global_bin: globalBin,
    project_bin: projectBin,
    ok: scope === 'project' ? projectBinExists : Boolean(globalBin)
  };
}

async function discoverGlobalSksCommand() {
  const configured = await configuredSksBin(process.env.SKS_BIN);
  if (configured) return configured;
  for (const name of ['sks', 'sneakoscope']) {
    const found = await which(name).catch(() => null);
    if (isStableSksBin(found)) return found;
  }
  return await npmGlobalSksBin();
}

async function configuredSksBin(candidate) {
  if (!candidate || candidate === 'sks') return null;
  return isStableSksBin(candidate) && await exists(candidate) ? candidate : null;
}

function isStableSksBin(candidate) {
  return Boolean(candidate) && !isTransientNpmBinPath(candidate);
}

function isTransientNpmBinPath(candidate) {
  const normalized = String(candidate || '').split(path.sep).join('/');
  return normalized.includes('/_npx/')
    || normalized.includes('/_cacache/tmp/')
    || /\/npm-cache\/_npx\//.test(normalized)
    || (/\/node_modules\/\.bin\/sks$/.test(normalized) && normalized.includes('/.npm-cache/'));
}

async function npmGlobalSksBin() {
  const npm = await which('npm').catch(() => null);
  if (!npm) return null;
  const result = await runProcess(npm, ['prefix', '-g'], { timeoutMs: 10000, maxOutputBytes: 4096 });
  if (result.code !== 0) return null;
  const prefix = result.stdout.trim().split(/\r?\n/).pop();
  if (!prefix) return null;
  const binDir = process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const name of ['sks', 'sneakoscope']) {
    for (const suffix of suffixes) {
      const candidate = path.join(binDir, `${name}${suffix}`);
      if (isStableSksBin(candidate) && await exists(candidate)) return candidate;
    }
  }
  return null;
}

async function npmPackageVersion(name) {
  const envName = `SKS_NPM_VIEW_${String(name || '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_VERSION`;
  if (process.env[envName]) return { version: process.env[envName] };
  const npm = await which('npm').catch(() => null);
  if (!npm) return { error: 'npm not found' };
  const result = await runProcess(npm, ['view', name, 'version'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (result.code !== 0) return { error: `${result.stderr || result.stdout || 'npm view failed'}`.trim() };
  return { version: result.stdout.trim().split(/\s+/).pop() };
}

async function effectivePackageVersion() {
  const pkg = await readJson(path.join(packageRoot(), 'package.json'), {}).catch(() => ({}));
  return highestVersion([PACKAGE_VERSION, pkg.version]);
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

async function resolveMissionId(root, arg) { return (!arg || arg === 'latest') ? findLatestMission(root) : arg; }
function readMaxCycles(args, fallback) {
  const i = args.indexOf('--max-cycles');
  const raw = i >= 0 && args[i + 1] ? Number(args[i + 1]) : Number(fallback);
  if (!Number.isFinite(raw)) return Math.max(1, Number.parseInt(fallback, 10) || 1);
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

function positionalArgs(args = []) {
  const out = [];
  const valueFlags = new Set(['--format', '--iterations', '--out', '--baseline', '--candidate', '--install-scope', '--max-cycles', '--depth', '--scope', '--transport', '--query', '--topic', '--tokens', '--timeout-ms', '--sql', '--command', '--project-ref', '--agent', '--phase', '--message', '--role', '--max-anchors', '--lines']);
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

async function selftest() {
  const tmp = tmpdir();
  process.chdir(tmp);
  await initProject(tmp, {});
  if (readMaxCycles(['--max-cycles', 'Infinity'], 8) !== 8) throw new Error('selftest failed: non-finite max cycles not sanitized');
  if (readMaxCycles(['--max-cycles', '0'], 8) !== 1) throw new Error('selftest failed: zero max cycles not bounded');
  const loopMission = await createMission(tmp, { mode: 'team', prompt: 'compliance loop guard selftest' });
  const loopState = { mission_id: loopMission.id, mode: 'TEAM', route_command: '$Team', stop_gate: 'team-gate.json' };
  await writeJsonAtomic(path.join(loopMission.dir, 'team-gate.json'), { passed: false });
  for (let i = 0; i < 2; i++) {
    const stop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
    if (stop?.decision !== 'block') throw new Error('selftest failed: compliance loop guard blocked too early');
  }
  const trippedStop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
  if (trippedStop) throw new Error('selftest failed: compliance loop guard did not terminally trip');
  const loopBlocker = await readJson(path.join(loopMission.dir, 'hard-blocker.json'), null);
  if (loopBlocker?.reason !== 'compliance_loop_guard_tripped') throw new Error('selftest failed: compliance loop guard did not write hard blocker');
  await setCurrent(tmp, loopState);
  const dfixPromptHook = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'user-prompt-submit'], {
    cwd: tmp,
    input: JSON.stringify({ cwd: tmp, prompt: '$DFix Change the CTA label only' }),
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (dfixPromptHook.code !== 0) throw new Error(`selftest failed: DFix prompt hook exited ${dfixPromptHook.code}: ${dfixPromptHook.stderr}`);
  if (await exists(path.join(tmp, '.sneakoscope', 'state', 'light-route-stop.json'))) throw new Error('selftest failed: DFix prompt hook created persistent light-route state');
  const dfixStopHook = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'stop'], {
    cwd: tmp,
    input: JSON.stringify({ cwd: tmp, last_assistant_message: 'DFix 완료 요약: CTA 라벨만 변경했습니다.\nDFix 솔직모드: 검증=대상 파일 확인 통과, 미검증=없음, 남은 문제=없음.' }),
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (dfixStopHook.code !== 0) throw new Error(`selftest failed: DFix stop hook exited ${dfixStopHook.code}: ${dfixStopHook.stderr}`);
  const dfixStop = JSON.parse(dfixStopHook.stdout || '{}');
  if (dfixStop.decision === 'block' || dfixStop.continue === false) throw new Error(`selftest failed: DFix stop hook was blocked: ${dfixStopHook.stdout}`);
  if (!String(dfixStop.systemMessage || '').includes('DFix ultralight finalization accepted')) throw new Error('selftest failed: DFix stop hook did not use the ultralight finalization bypass');
  await writeJsonAtomic(path.join(loopMission.dir, 'team-roster.json'), { schema_version: 1, mission_id: loopMission.id, confirmed: true });
  await writeJsonAtomic(path.join(loopMission.dir, 'team-session-cleanup.json'), { schema_version: 1, passed: true, all_sessions_closed: true, outstanding_sessions: 0, live_transcript_finalized: true });
  await writeJsonAtomic(path.join(loopMission.dir, 'team-gate.json'), { passed: true, team_roster_confirmed: true, analysis_artifact: true, triwiki_refreshed: true, triwiki_validated: true, consensus_artifact: true, implementation_team_fresh: true, review_artifact: true, integration_evidence: true, session_cleanup: true });
  const afterGateFixStop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
  if (afterGateFixStop?.decision !== 'block' || !String(afterGateFixStop.reason || '').includes('reflection')) throw new Error('selftest failed: hard blocker masked later gate progress');
  const guardStatus = await harnessGuardStatus(tmp);
  if (!guardStatus.ok || !guardStatus.locked || guardStatus.source_exception) throw new Error('selftest failed: harness guard not locked in installed project');
  const repairTmp = tmpdir();
  await initProject(repairTmp, {});
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'team', 'SKILL.md'), 'tampered\n');
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'), '---\nname: agent-team\ndescription: Fallback Codex App picker alias for $Team.\n---\n');
  await ensureDir(path.join(repairTmp, '.agents', 'skills', 'custom-keep'));
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'custom-keep', 'SKILL.md'), '---\nname: custom-keep\ndescription: User custom skill, not generated by SKS.\n---\n');
  await writeTextAtomic(path.join(repairTmp, '.codex', 'skills', 'team', 'SKILL.md'), 'legacy mirror\n');
  await initProject(repairTmp, { force: true, repair: true });
  const repairedTeamSkill = await safeReadText(path.join(repairTmp, '.agents', 'skills', 'team', 'SKILL.md'));
  if (!repairedTeamSkill.includes('SKS Team orchestration') || repairedTeamSkill.includes('tampered')) throw new Error('selftest failed: doctor repair did not regenerate team skill');
  if (await exists(path.join(repairTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'))) throw new Error('selftest failed: doctor repair did not remove deprecated agent-team alias skill');
  if (!(await exists(path.join(repairTmp, '.agents', 'skills', 'custom-keep', 'SKILL.md')))) throw new Error('selftest failed: doctor repair removed a user-owned custom skill');
  if (await exists(path.join(repairTmp, '.codex', 'skills', 'team', 'SKILL.md'))) throw new Error('selftest failed: doctor repair did not remove legacy .codex/skills');
  const conflictTmp = tmpdir();
  await ensureDir(path.join(conflictTmp, '.omx'));
  const conflictScan = await scanHarnessConflicts(conflictTmp, { home: path.join(conflictTmp, 'home') });
  if (!conflictScan.hard_block || !formatHarnessConflictReport(conflictScan).includes('GPT-5.5')) throw new Error('selftest failed: OMX conflict did not block with cleanup prompt');
  const postinstallConflict = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: conflictTmp, env: { INIT_CWD: conflictTmp, HOME: path.join(conflictTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (postinstallConflict.code !== 0) throw new Error('selftest failed: postinstall conflict notice should not make npm install fail');
  const postinstallConflictOutput = String(`${postinstallConflict.stdout}\n${postinstallConflict.stderr}`);
  if (!postinstallConflictOutput.includes('SKS setup is blocked') || postinstallConflictOutput.includes('Cleanup prompt:')) throw new Error('selftest failed: postinstall conflict notice did not stay informational');
  const postinstallConflictPrompt = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: conflictTmp, input: 'y\n', env: { INIT_CWD: conflictTmp, HOME: path.join(conflictTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_POSTINSTALL_PROMPT: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (postinstallConflictPrompt.code !== 0 || !String(postinstallConflictPrompt.stdout || '').includes('Goal: completely remove the conflicting Codex harnesses')) throw new Error('selftest failed: interactive postinstall prompt did not print cleanup prompt');
  const postinstallSetupTmp = tmpdir();
  await writeJsonAtomic(path.join(postinstallSetupTmp, 'package.json'), { name: 'postinstall-setup-smoke', version: '0.0.0' });
  const postinstallSetup = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: postinstallSetupTmp, env: { INIT_CWD: postinstallSetupTmp, HOME: path.join(postinstallSetupTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (postinstallSetup.code !== 0) throw new Error(`selftest failed: postinstall setup exited ${postinstallSetup.code}: ${postinstallSetup.stderr}`);
  if (await exists(path.join(postinstallSetupTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'))) throw new Error('selftest failed: postinstall installed deprecated agent-team fallback skill');
  if (!String(postinstallSetup.stdout || '').includes('Next:') || !String(postinstallSetup.stdout || '').includes('sks bootstrap')) throw new Error('selftest failed: postinstall did not print bootstrap next step');
  if (await exists(path.join(postinstallSetupTmp, '.codex', 'hooks.json'))) throw new Error('selftest failed: postinstall mutated project before bootstrap approval');
  if (!String(postinstallSetup.stdout || '').includes('Codex App global $ skills: installed')) throw new Error('selftest failed: postinstall did not report automatic global Codex App skills');
  for (const { command } of DOLLAR_COMMANDS) {
    const skillName = command.slice(1).toLowerCase();
    if (!(await exists(path.join(postinstallSetupTmp, 'home', '.agents', 'skills', skillName, 'SKILL.md')))) throw new Error(`selftest failed: postinstall global ${command} skill not installed`);
  }
  const postinstallBootstrapTmp = tmpdir();
  await writeJsonAtomic(path.join(postinstallBootstrapTmp, 'package.json'), { name: 'postinstall-bootstrap-smoke', version: '0.0.0' });
  const postinstallBootstrap = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: postinstallBootstrapTmp, input: 'y\n', env: { INIT_CWD: postinstallBootstrapTmp, HOME: path.join(postinstallBootstrapTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1', SKS_SKIP_CLI_TOOLS: '1', SKS_POSTINSTALL_PROMPT: '1' }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  if (postinstallBootstrap.code !== 0 || !String(postinstallBootstrap.stdout || '').includes('SKS Ready')) throw new Error(`selftest failed: approved postinstall bootstrap did not run: ${postinstallBootstrap.stderr}`);
  for (const rel of ['.agents/skills/team/SKILL.md', '.codex/config.toml', '.codex/hooks.json', '.sneakoscope/harness-guard.json', '.codex/SNEAKOSCOPE.md', 'AGENTS.md', '.gitignore']) {
    if (!(await exists(path.join(postinstallBootstrapTmp, rel)))) throw new Error(`selftest failed: bootstrap did not create ${rel}`);
  }
  const postinstallBootstrapGitignore = await safeReadText(path.join(postinstallBootstrapTmp, '.gitignore'));
  if (!postinstallBootstrapGitignore.includes('.sneakoscope/') || !postinstallBootstrapGitignore.includes('.codex/') || !postinstallBootstrapGitignore.includes('.agents/') || !postinstallBootstrapGitignore.includes('AGENTS.md')) throw new Error('selftest failed: bootstrap did not ignore SKS generated files');
  const bootstrapJsonTmp = tmpdir();
  await writeJsonAtomic(path.join(bootstrapJsonTmp, 'package.json'), { name: 'bootstrap-json-smoke', version: '0.0.0' });
  const bootstrapJson = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'bootstrap', '--json'], { cwd: bootstrapJsonTmp, env: { HOME: path.join(bootstrapJsonTmp, 'home'), SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1', SKS_SKIP_CLI_TOOLS: '1' }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  const bootstrapResult = JSON.parse(bootstrapJson.stdout);
  if (!bootstrapResult.project_setup?.ok || typeof bootstrapResult.ready !== 'boolean') throw new Error('selftest failed: bootstrap json did not report project setup and ready boolean');
  const depsCheck = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'deps', 'check', '--json'], { cwd: bootstrapJsonTmp, env: { HOME: path.join(bootstrapJsonTmp, 'home') }, timeoutMs: 20000, maxOutputBytes: 256 * 1024 });
  const depsResult = JSON.parse(depsCheck.stdout);
  if (!depsResult.node?.ok || !('warp' in depsResult) || !('homebrew' in depsResult)) throw new Error('selftest failed: deps check json missing expected fields');
  const globalCwd = tmpdir();
  const globalRuntimeRoot = path.join(tmpdir(), 'sks-global-root');
  const globalRootProbe = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'root', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const globalRootResult = JSON.parse(globalRootProbe.stdout);
  if (globalRootResult.mode !== 'global' || globalRootResult.active_root !== globalRuntimeRoot || globalRootResult.project_root !== null) throw new Error('selftest failed: global root probe did not use SKS_GLOBAL_ROOT outside a project');
  const globalPipeline = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'pipeline', 'status', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const globalPipelineResult = JSON.parse(globalPipeline.stdout);
  if (globalPipelineResult.root !== globalRuntimeRoot) throw new Error('selftest failed: pipeline status did not use global runtime root outside a project');
  const globalTeam = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'team', 'global path smoke', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  const globalTeamResult = JSON.parse(globalTeam.stdout);
  if (!String(globalTeamResult.mission_dir || '').startsWith(path.join(globalRuntimeRoot, '.sneakoscope', 'missions')) || !(await exists(path.join(globalRuntimeRoot, '.sneakoscope', 'manifest.json')))) throw new Error('selftest failed: team mission did not materialize under global runtime root');
  if (await exists(path.join(globalCwd, '.sneakoscope'))) throw new Error('selftest failed: global runtime command polluted the caller cwd with .sneakoscope');
  const madProfilePath = path.join(tmp, 'mad-codex-config.toml');
  const madProfile = await enableMadHighProfile({ configPath: madProfilePath });
  const madProfileText = await safeReadText(madProfilePath);
  if (madProfile.profile_name !== 'sks-mad-high' || !madProfileText.includes('sandbox_mode = "danger-full-access"') || !madProfileText.includes('approval_policy = "on-request"') || !madProfileText.includes('approvals_reviewer = "auto_review"') || !madProfileText.includes('model_reasoning_effort = "high"') || !madProfileText.includes('unrequested fallback implementation code')) throw new Error('selftest failed: MAD high profile is not full-access auto-review high with fallback-code guard');
  if (!isMadHighLaunch(['--mad', '--high']) || isMadHighLaunch(['db', '--mad'])) throw new Error('selftest failed: MAD high launch flag parsing is not top-level only');
  const workspacePlan = { workspace: 'sks-mad-selftest', root: tmp, codexArgs: ['--profile', 'sks-mad-high'] };
  const warpLaunchYaml = buildWarpLaunchConfigYaml({ ...workspacePlan, command: 'codex', title: 'sks-mad-selftest' }, [{ cwd: tmp, command: 'codex --profile sks-mad-high', focused: true }]);
  const warpSyntax = runWarpLaunchConfigSyntaxCheck(warpLaunchYaml);
  if (!warpSyntax.ok || !warpLaunchYaml.includes('name: "sks-mad-selftest"') || !warpLaunchYaml.includes('commands:')) throw new Error('selftest failed: MAD Warp launch configuration was not generated with name and command');
  const warpOpenArgs = buildWarpOpenArgs(workspacePlan);
  if (!warpOpenArgs.includes('open') || !warpOpenArgs.some((arg) => String(arg).includes('warp://launch/sks-mad-selftest.yaml'))) throw new Error('selftest failed: MAD Warp launch URI is not stable by workspace name');
  if (!isWarpShellSession({ TERM_PROGRAM: 'WarpTerminal' })) throw new Error('selftest failed: Warp shell session env was not detected');
  const warpNestedDecision = warpOpenLaunchDecision({ env: { TERM_PROGRAM: 'WarpTerminal' } });
  if (warpNestedDecision.open || !warpNestedDecision.current_session) throw new Error('selftest failed: nested Warp launch was not redirected to current session');
  const oldWarpConfigDir = process.env.SKS_WARP_LAUNCH_CONFIG_DIR;
  process.env.SKS_WARP_LAUNCH_CONFIG_DIR = path.join(tmp, 'warp-launch-configs');
  const writtenWarpConfig = await writeWarpLaunchConfig({ ...workspacePlan, command: 'codex', title: 'sks-mad-selftest' }, [{ cwd: tmp, command: 'codex --profile sks-mad-high', focused: true }]);
  if (!(await exists(writtenWarpConfig.config_path)) || !writtenWarpConfig.record.launch_uri.includes('warp://launch/')) throw new Error('selftest failed: Warp launch configuration was not persisted for URI launch');
  const currentSessionLaunch = await launchWarpUi(['--workspace', 'sks-current-session-selftest'], {
    root: tmp,
    codex: { bin: 'printf', version: 'mock' },
    app: { ok: true, guidance: [] },
    warp: { ok: true, version: 'Warp.app' },
    env: { TERM_PROGRAM: 'WarpTerminal' },
    dryRunCurrentSession: true,
    quiet: true
  });
  if (!currentSessionLaunch.opened?.current_session || currentSessionLaunch.opened?.skipped) throw new Error('selftest failed: Warp shell launch did not stay in the current session');
  if (oldWarpConfigDir === undefined) delete process.env.SKS_WARP_LAUNCH_CONFIG_DIR;
  else process.env.SKS_WARP_LAUNCH_CONFIG_DIR = oldWarpConfigDir;
  if (warpStatusKind({ ok: false, bin: null }) !== 'missing') throw new Error('selftest failed: missing warp was not labeled missing');
  const guardBlocked = await checkHarnessModification(tmp, { tool_name: 'apply_patch', command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' });
  if (guardBlocked.action !== 'block') throw new Error('selftest failed: harness guard allowed skill tampering');
  const setupBlocked = await checkHarnessModification(tmp, { command: 'sks setup --force' });
  if (setupBlocked.action !== 'block') throw new Error('selftest failed: harness guard allowed setup maintenance command');
  const appEditAllowed = await checkHarnessModification(tmp, { tool_name: 'apply_patch', command: '*** Update File: src/app.js\n+ok\n' });
  if (appEditAllowed.action === 'block') throw new Error('selftest failed: harness guard blocked app source edit');
  const sourceEditAllowed = await checkHarnessModification(packageRoot(), { tool_name: 'apply_patch', command: '*** Update File: src/core/init.mjs\n+ok\n' });
  if (sourceEditAllowed.action === 'block' || !(await isHarnessSourceProject(packageRoot()))) throw new Error('selftest failed: harness source exception not honored');
  const defaultHooks = await readJson(path.join(tmp, '.codex', 'hooks.json'));
  if (defaultHooks.hooks.PreToolUse[0].hooks[0].command !== 'sks hook pre-tool') throw new Error('selftest failed: global install hook command changed');
  const sharedHooksTmp = tmpdir();
  await ensureDir(path.join(sharedHooksTmp, '.codex'));
  await writeJsonAtomic(path.join(sharedHooksTmp, '.codex', 'hooks.json'), {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node ./old/sks.mjs hook user-prompt-submit' }] },
        { hooks: [{ type: 'command', command: 'node ./user-hook.mjs' }] }
      ],
      Stop: [{ hooks: [{ type: 'command', command: 'node ./user-stop.mjs' }] }]
    },
    user_key: true
  });
  await initProject(sharedHooksTmp, {});
  const sharedHooks = await readJson(path.join(sharedHooksTmp, '.codex', 'hooks.json'));
  if (!sharedHooks.user_key) throw new Error('selftest failed: hooks merge dropped root metadata');
  if (!sharedHooks.hooks.UserPromptSubmit.some((entry) => entry.hooks?.some((hook) => hook.command === 'node ./user-hook.mjs'))) throw new Error('selftest failed: hooks merge dropped user hook');
  if (JSON.stringify(sharedHooks).includes('node ./old/sks.mjs hook user-prompt-submit')) throw new Error('selftest failed: hooks merge kept stale SKS hook');
  if (sharedHooks.hooks.UserPromptSubmit.filter((entry) => entry.hooks?.some((hook) => hook.command === 'sks hook user-prompt-submit')).length !== 1) throw new Error('selftest failed: hooks merge did not install exactly one SKS prompt hook');
  const absoluteHookTmp = tmpdir();
  await initProject(absoluteHookTmp, { globalCommand: '/usr/local/bin/sks' });
  const absoluteHooks = await readJson(path.join(absoluteHookTmp, '.codex', 'hooks.json'));
  if (absoluteHooks.hooks.PreToolUse[0].hooks[0].command !== '/usr/local/bin/sks hook pre-tool') throw new Error('selftest failed: absolute global hook command missing');
  const projectScopeTmp = tmpdir();
  await initProject(projectScopeTmp, { installScope: 'project' });
  const projectHooks = await readJson(path.join(projectScopeTmp, '.codex', 'hooks.json'));
  if (projectHooks.hooks.PreToolUse[0].hooks[0].command !== 'node ./node_modules/sneakoscope/bin/sks.mjs hook pre-tool') throw new Error('selftest failed: project install hook command missing');
  const sourceHookTmp = tmpdir();
  await writeJsonAtomic(path.join(sourceHookTmp, 'package.json'), { name: 'sneakoscope', version: '0.0.0' });
  await ensureDir(path.join(sourceHookTmp, 'bin'));
  await ensureDir(path.join(sourceHookTmp, 'src', 'core'));
  await writeTextAtomic(path.join(sourceHookTmp, 'bin', 'sks.mjs'), '#!/usr/bin/env node\n');
  await writeTextAtomic(path.join(sourceHookTmp, 'src', 'core', 'init.mjs'), '');
  await writeTextAtomic(path.join(sourceHookTmp, 'src', 'core', 'hooks-runtime.mjs'), '');
  await initProject(sourceHookTmp, { installScope: 'global', globalCommand: '/usr/local/bin/sks' });
  const sourceHooks = await readJson(path.join(sourceHookTmp, '.codex', 'hooks.json'));
  if (sourceHooks.hooks.PreToolUse[0].hooks[0].command !== 'node ./bin/sks.mjs hook pre-tool') throw new Error('selftest failed: source repo hook command should use local bin');
  const versionTmp = tmpdir();
  await runProcess('git', ['init'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await runProcess('git', ['config', 'user.email', 'sks-selftest@example.invalid'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await runProcess('git', ['config', 'user.name', 'SKS Selftest'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await writeJsonAtomic(path.join(versionTmp, 'package.json'), { name: 'sks-version-selftest', version: '0.1.0' });
  await writeJsonAtomic(path.join(versionTmp, 'package-lock.json'), { name: 'sks-version-selftest', version: '0.1.0', lockfileVersion: 3, packages: { '': { name: 'sks-version-selftest', version: '0.1.0' } } });
  await runProcess('git', ['add', 'package.json', 'package-lock.json'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await runProcess('git', ['commit', '--no-verify', '-m', 'initial'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await writeTextAtomic(path.join(versionTmp, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  await initProject(versionTmp, {});
  const versionStatus = await versioningStatus(versionTmp);
  if (!versionStatus.ok || !versionStatus.enabled || !versionStatus.hook_installed) throw new Error('selftest failed: versioning hook not installed');
  const versionHookText = await safeReadText(versionStatus.hook_path);
  if (!versionHookText.includes('versioning pre-commit')) throw new Error('selftest failed: versioning hook command missing');
  if (versionHookText.indexOf('versioning pre-commit') > versionHookText.indexOf('exit 0')) throw new Error('selftest failed: versioning hook was appended after an early exit');
  await writeTextAtomic(path.join(versionTmp, 'README.md'), 'version selftest\n');
  await runProcess('git', ['add', 'README.md'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const firstVersionBump = await runVersionPreCommit(versionTmp);
  if (!firstVersionBump.ok || firstVersionBump.version !== '0.1.1' || !firstVersionBump.changed) throw new Error('selftest failed: first version bump did not advance patch version');
  const bumpedPackage = await readJson(path.join(versionTmp, 'package.json'));
  const bumpedLock = await readJson(path.join(versionTmp, 'package-lock.json'));
  if (bumpedPackage.version !== '0.1.1' || bumpedLock.version !== '0.1.1' || bumpedLock.packages[''].version !== '0.1.1') throw new Error('selftest failed: package lock versions not synced');
  const firstCached = await runProcess('git', ['diff', '--cached', '--name-only'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (!firstCached.stdout.includes('package.json') || !firstCached.stdout.includes('package-lock.json')) throw new Error('selftest failed: version files not staged');
  await runProcess('git', ['commit', '--no-verify', '-m', 'first versioned commit'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await writeJsonAtomic(versionStatus.state_path, { schema_version: 1, last_version: '0.1.5', updated_at: nowIso(), pid: process.pid, changed: true });
  await writeTextAtomic(path.join(versionTmp, 'CHANGELOG.md'), 'collision selftest\n');
  await runProcess('git', ['add', 'CHANGELOG.md'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const collisionBump = await runVersionPreCommit(versionTmp);
  if (!collisionBump.ok || collisionBump.version !== '0.1.6') throw new Error('selftest failed: version collision state did not bump above last seen version');
  const localOnlyTmp = tmpdir();
  await ensureDir(path.join(localOnlyTmp, '.git'));
  await writeTextAtomic(path.join(localOnlyTmp, 'AGENTS.md'), 'existing local rules\n');
  await initProject(localOnlyTmp, { localOnly: true });
  const localExclude = await safeReadText(path.join(localOnlyTmp, '.git', 'info', 'exclude'));
  if (!localExclude.includes('.codex/') || !localExclude.includes('AGENTS.md')) throw new Error('selftest failed: local-only git excludes missing');
  if (await exists(path.join(localOnlyTmp, '.gitignore'))) throw new Error('selftest failed: local-only wrote shared .gitignore');
  const localAgents = await safeReadText(path.join(localOnlyTmp, 'AGENTS.md'));
  if (localAgents.trim() !== 'existing local rules') throw new Error('selftest failed: local-only modified existing AGENTS.md');
  const localManifest = await readJson(path.join(localOnlyTmp, '.sneakoscope', 'manifest.json'));
  if (!localManifest.git?.local_only) throw new Error('selftest failed: local-only manifest missing');
  const gitignoreTmp = tmpdir();
  await writeTextAtomic(path.join(gitignoreTmp, '.gitignore'), 'node_modules/\n.sneakoscope/\n');
  await initProject(gitignoreTmp, {});
  const gitignoreText = await safeReadText(path.join(gitignoreTmp, '.gitignore'));
  if (!gitignoreText.includes('node_modules/') || !gitignoreText.includes('# BEGIN Sneakoscope Codex generated files') || !gitignoreText.includes('.codex/') || !gitignoreText.includes('.agents/') || !gitignoreText.includes('AGENTS.md')) throw new Error('selftest failed: shared .gitignore did not preserve existing entries and add SKS patterns');
  await initProject(gitignoreTmp, {});
  const gitignoreTextSecond = await safeReadText(path.join(gitignoreTmp, '.gitignore'));
  if ((gitignoreTextSecond.match(/BEGIN Sneakoscope Codex generated files/g) || []).length !== 1) throw new Error('selftest failed: shared .gitignore managed block duplicated');
  const managedAgentsTmp = tmpdir();
  await ensureDir(path.join(managedAgentsTmp, '.git'));
  await writeTextAtomic(path.join(managedAgentsTmp, 'AGENTS.md'), '<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->\nold managed rules\n<!-- END Sneakoscope Codex GX MANAGED BLOCK -->\n');
  await initProject(managedAgentsTmp, { localOnly: true });
  const managedAgents = await safeReadText(path.join(managedAgentsTmp, 'AGENTS.md'));
  if (!managedAgents.includes('TriWiki is the context-tracking SSOT') || managedAgents.includes('old managed rules')) throw new Error('selftest failed: local-only did not refresh managed AGENTS.md block');
  if (!isTransientNpmBinPath('/tmp/.npm/_npx/abc/node_modules/.bin/sks')) throw new Error('selftest failed: npx bin path not recognized as transient');
  if (!isTransientNpmBinPath('/tmp/.npm-cache/_cacache/tmp/git-cloneabc/bin/sks.mjs')) throw new Error('selftest failed: npm cache git clone path not recognized as transient');
  if (isTransientNpmBinPath('/usr/local/bin/sks')) throw new Error('selftest failed: stable global bin marked transient');
  const oldPath = process.env.PATH;
  const oldSksBin = process.env.SKS_BIN;
  const fakeNpxBin = path.join(tmp, '.npm', '_npx', 'abc', 'node_modules', '.bin');
  await ensureDir(fakeNpxBin);
  await writeJsonAtomic(path.join(fakeNpxBin, 'sks'), { fake: true });
  try {
    process.env.PATH = fakeNpxBin;
    delete process.env.SKS_BIN;
    const discovered = await discoverGlobalSksCommand();
    if (isTransientNpmBinPath(discovered)) throw new Error('selftest failed: transient npx bin selected as global command');
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldSksBin === undefined) delete process.env.SKS_BIN;
    else process.env.SKS_BIN = oldSksBin;
  }
  const shimTmp = tmpdir();
  const shimDir = path.join(shimTmp, 'bin');
  const shimResult = await ensureSksCommandDuringInstall({ force: true, pathEnv: shimDir, home: shimTmp, target: path.join(packageRoot(), 'bin', 'sks.mjs'), nodeBin: process.execPath });
  if (shimResult.status !== 'created' || !(await exists(path.join(shimDir, process.platform === 'win32' ? 'sks.cmd' : 'sks')))) throw new Error('selftest failed: sks command shim not created');
  const globalSkillsTmp = tmpdir();
  const globalSkillsResult = await ensureGlobalCodexSkillsDuringInstall({ force: true, home: globalSkillsTmp });
  if (globalSkillsResult.status !== 'installed') throw new Error(`selftest failed: global Codex App skills not installed: ${globalSkillsResult.status}`);
  const globalSkillStatus = await checkRequiredSkills(globalSkillsTmp, path.join(globalSkillsTmp, '.agents', 'skills'));
  if (!globalSkillStatus.ok) throw new Error(`selftest failed: global Codex App skills missing: ${globalSkillStatus.missing.join(', ')}`);
  const codexSkillMirrorExists = await exists(path.join(tmp, '.codex', 'skills', 'research-discovery', 'SKILL.md'));
  if (codexSkillMirrorExists) throw new Error('selftest failed: generated .codex/skills mirror still installed');
  const codexAppSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'research-discovery', 'SKILL.md'));
  if (!codexAppSkillExists) throw new Error('selftest failed: Codex App skill not installed');
  for (const { command } of DOLLAR_COMMANDS) {
    const skillName = command.slice(1).toLowerCase();
    const dollarSkillExists = await exists(path.join(tmp, '.agents', 'skills', skillName, 'SKILL.md'));
    if (!dollarSkillExists) throw new Error(`selftest failed: ${command} skill not installed`);
  }
  const promptPipelineSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'prompt-pipeline', 'SKILL.md'));
  if (!promptPipelineSkillExists) throw new Error('selftest failed: prompt pipeline skill not installed');
  const promptPipelineText = await safeReadText(path.join(tmp, '.agents', 'skills', 'prompt-pipeline', 'SKILL.md'));
  if (!promptPipelineText.includes('TriWiki context-tracking SSOT')) throw new Error('selftest failed: prompt pipeline missing TriWiki context-tracking SSOT');
  if (!promptPipelineText.includes('before every route stage') || !promptPipelineText.includes('sks wiki refresh')) throw new Error('selftest failed: prompt pipeline missing per-stage TriWiki policy');
  if (!promptPipelineText.includes('design.md') || !promptPipelineText.includes('imagegen')) throw new Error('selftest failed: prompt pipeline missing design/image asset routing');
  if (!promptPipelineText.includes('From-Chat-IMG') || !promptPipelineText.includes('Do not assume ordinary image prompts are chat captures')) throw new Error('selftest failed: prompt pipeline missing explicit From-Chat-IMG gating');
  const fromChatImgSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'from-chat-img', 'SKILL.md'));
  if (!fromChatImgSkillText.includes('normal Team pipeline') || !fromChatImgSkillText.includes('Codex Computer Use visual inspection') || !fromChatImgSkillText.includes(CODEX_COMPUTER_USE_ONLY_POLICY) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest failed: from-chat-img skill missing Team/Computer Use-only inspection checklist guidance');
  if (fromChatImgSkillText.includes('Computer Use/browser visual inspection')) throw new Error('selftest failed: from-chat-img skill still allows browser visual inspection wording');
  const fromChatImgSkillMeta = await safeReadText(path.join(tmp, '.agents', 'skills', 'from-chat-img', 'agents', 'openai.yaml'));
  if (!fromChatImgSkillMeta.includes('model_reasoning_effort: xhigh')) throw new Error('selftest failed: from-chat-img skill metadata is not xhigh');
  for (const supportSkill of ['reasoning-router', 'pipeline-runner', 'context7-docs', 'seo-geo-optimizer', 'reflection', 'design-system-builder', 'design-ui-editor', 'imagegen']) {
    if (!(await exists(path.join(tmp, '.agents', 'skills', supportSkill, 'SKILL.md')))) throw new Error(`selftest failed: ${supportSkill} skill not installed`);
  }
  if (!(await exists(path.join(tmp, '.agents', 'skills', 'reasoning-router', 'agents', 'openai.yaml')))) throw new Error('selftest failed: skill metadata missing');
  const hookGuardPayload = JSON.stringify({ cwd: tmp, tool_name: 'apply_patch', command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' });
  const hookGuardResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'pre-tool'], { cwd: tmp, input: hookGuardPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const hookGuardJson = JSON.parse(hookGuardResult.stdout);
  if (hookGuardJson.decision !== 'block' || !String(hookGuardJson.reason || '').includes('harness guard')) throw new Error('selftest failed: hook did not block harness tampering');
  const camelHookGuardPayload = JSON.stringify({ cwd: tmp, toolName: 'apply_patch', toolInput: { command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' } });
  const camelHookGuardResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'pre-tool'], { cwd: tmp, input: camelHookGuardPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const camelHookGuardJson = JSON.parse(camelHookGuardResult.stdout);
  if (camelHookGuardJson.decision !== 'block') throw new Error('selftest failed: hook did not block camelCase Codex tool payload');
  if (new Set(DOLLAR_COMMANDS.map((c) => c.command)).size !== DOLLAR_COMMANDS.length) throw new Error('selftest failed: duplicate dollar commands');
  if (!DOLLAR_COMMAND_ALIASES.some((alias) => alias.canonical === '$QA-LOOP' && alias.app_skill === '$qa-loop')) throw new Error('selftest failed: $QA-LOOP picker skill missing');
  if (!DOLLAR_COMMAND_ALIASES.some((alias) => alias.canonical === '$Team' && alias.app_skill === '$from-chat-img')) throw new Error('selftest failed: $From-Chat-IMG picker skill missing');
  if (!DOLLAR_COMMANDS.some((entry) => entry.command === '$From-Chat-IMG')) throw new Error('selftest failed: $From-Chat-IMG missing from dollar command list');
  if (DOLLAR_COMMAND_ALIASES.some((alias) => ['$agent-team', '$qaloop', '$wiki-refresh', '$wikirefresh'].includes(alias.app_skill))) throw new Error('selftest failed: duplicate picker aliases still present');
  if (routePrompt('$agent-team run specialists')) throw new Error('selftest failed: deprecated $agent-team route still resolved');
  if (routePrompt('$QA-LOOP run UI E2E')?.id !== 'QALoop' || routePrompt('$QALoop deployed smoke')) throw new Error('selftest failed: QA-LOOP route is not standardized to $QA-LOOP');
  if (routePrompt('$WikiRefresh 갱신')) throw new Error('selftest failed: deprecated $WikiRefresh route still resolved');
  if (routePrompt('$MAD-SKS Supabase MCP main 작업')?.id !== 'MadSKS') throw new Error('selftest failed: $MAD-SKS route did not resolve');
  if (routePrompt('$MAD-SKS $Team Supabase MCP main 작업')?.id !== 'Team') throw new Error('selftest failed: $MAD-SKS did not compose with $Team');
  if (routePrompt('$DB Supabase 점검 $MAD-SKS')?.id !== 'DB') throw new Error('selftest failed: trailing $MAD-SKS changed primary route');
  if (routePrompt('위키 갱신해줘')?.id !== 'Wiki') throw new Error('selftest failed: wiki refresh text did not route to Wiki');
  const koreanReadmeInstallPrompt = '리드미에 Codex App에서도 $ 표기 쓰는 법을 알려줘야지. 설치단계에서 바로 보이게 해줘야지';
  if (routePrompt(koreanReadmeInstallPrompt)?.id !== 'Team') throw new Error('selftest failed: Korean README implementation prompt did not route to Team by default');
  if (looksLikeAnswerOnlyRequest(koreanReadmeInstallPrompt)) throw new Error('selftest failed: Korean README implementation prompt still looked answer-only');
  if (routePrompt('왜 팀 커맨드 없어졌어 병렬처리까지 제대로 작업해줘')?.id !== 'Team') throw new Error('selftest failed: Korean Team/parallel implementation prompt did not route to Team');
  if (routePrompt('$From-Chat-IMG 채팅내역 이미지와 첨부 원본 이미지로 수정 작업 지시서 작성')?.id !== 'Team') throw new Error('selftest failed: $From-Chat-IMG did not route to Team');
  if (routePrompt('From-Chat-IMG 채팅내역 이미지와 원본 첨부 이미지 분석해서 작업 지시서 만들어줘')?.id !== 'Team') throw new Error('selftest failed: bare From-Chat-IMG signal did not route to Team');
  if (routePrompt('채팅 이미지랑 첨부 이미지 분석 방식 설명해줘')?.id === 'Team') throw new Error('selftest failed: ordinary chat-image question activated Team without From-Chat-IMG');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$Team')) throw new Error('selftest failed: dollar-commands missing Team default routing guidance');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$From-Chat-IMG')) throw new Error('selftest failed: dollar-commands missing From-Chat-IMG guidance');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$MAD-SKS')) throw new Error('selftest failed: dollar-commands missing MAD-SKS scoped override guidance');
  if (!COMMAND_CATALOG.some((c) => c.name === 'context7') || !COMMAND_CATALOG.some((c) => c.name === 'pipeline') || !COMMAND_CATALOG.some((c) => c.name === 'qa-loop') || !COMMAND_CATALOG.some((c) => c.name === 'root')) throw new Error('selftest failed: context7/pipeline/qa-loop/root commands missing from catalog');
  const registryDollarCommands = DOLLAR_COMMANDS.map((c) => c.command);
  const manifest = await readJson(path.join(tmp, '.sneakoscope', 'manifest.json'));
  const policy = await readJson(path.join(tmp, '.sneakoscope', 'policy.json'));
  const manifestDollarCommands = manifest.prompt_pipeline?.dollar_commands || [];
  const policyDollarCommands = policy.prompt_pipeline?.dollar_commands || [];
  if (JSON.stringify(manifestDollarCommands) !== JSON.stringify(registryDollarCommands)) throw new Error('selftest failed: manifest dollar command drift');
  if (JSON.stringify(policyDollarCommands) !== JSON.stringify(registryDollarCommands)) throw new Error('selftest failed: policy dollar command drift');
  if (!manifest.harness_guard?.immutable_to_llm_edits || !policy.harness_guard?.immutable_to_llm_edits) throw new Error('selftest failed: harness guard missing from manifest/policy');
  if (manifest.llm_wiki?.ssot !== 'triwiki' || policy.llm_wiki?.ssot !== 'triwiki') throw new Error('selftest failed: TriWiki context tracking not recorded in manifest/policy');
  const codexAppQuickRefExists = await exists(path.join(tmp, '.codex', 'SNEAKOSCOPE.md'));
  if (!codexAppQuickRefExists) throw new Error('selftest failed: Codex App quick reference missing');
  const codexAppQuickRefText = await safeReadText(path.join(tmp, '.codex', 'SNEAKOSCOPE.md'));
  if (!codexAppQuickRefText.includes('dollar-commands')) throw new Error('selftest failed: Codex App quick reference missing dollar-command discovery');
  if (!codexAppQuickRefText.includes('Context Tracking') || !codexAppQuickRefText.includes('TriWiki')) throw new Error('selftest failed: Codex App quick reference missing TriWiki context tracking');
  if (!codexAppQuickRefText.includes('Before each route phase') || !codexAppQuickRefText.includes('every stage')) throw new Error('selftest failed: Codex App quick reference missing per-stage TriWiki policy');
  for (const { command } of DOLLAR_COMMANDS) {
    if (!codexAppQuickRefText.includes(command)) throw new Error(`selftest failed: Codex App quick reference missing ${command}`);
  }
  const hookGoalTmp = tmpdir();
  await initProject(hookGoalTmp, {});
  const hookBin = path.join(packageRoot(), 'bin', 'sks.mjs');
  const hookPayload = JSON.stringify({ cwd: hookGoalTmp, prompt: '$Goal 로그인 세션 만료 UX 개선 supabase db' });
  const hookResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalTmp, input: hookPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookResult.code !== 0) throw new Error(`selftest failed: $Goal hook exited ${hookResult.code}: ${hookResult.stderr}`);
  const hookJson = JSON.parse(hookResult.stdout);
  if ('statusMessage' in hookJson || 'additionalContext' in hookJson) throw new Error('selftest failed: hook emitted Codex schema-invalid top-level fields');
  const goalContext = hookJson.hookSpecificOutput?.additionalContext || '';
  if (!goalContext.includes('$Goal route prepared') || !goalContext.includes('/goal create')) throw new Error('selftest failed: $Goal hook did not prepare native goal bridge');
  if (hookJson.hookSpecificOutput?.hookEventName !== 'UserPromptSubmit') throw new Error('selftest failed: $Goal hook did not emit official UserPromptSubmit additionalContext');
  if (!String(hookJson.systemMessage || '').includes('Goal workflow bridge')) throw new Error('selftest failed: $Goal hook missing visible status message');
  const hookState = await readJson(stateFile(hookGoalTmp), {});
  if (hookState.phase !== 'GOAL_READY' || hookState.mode !== 'GOAL') throw new Error('selftest failed: $Goal hook did not set ready state');
  if (!(await exists(path.join(missionDir(hookGoalTmp, hookState.mission_id), GOAL_WORKFLOW_ARTIFACT)))) throw new Error('selftest failed: $Goal hook did not write goal workflow artifact');
  const hookGoalDelegationTmp = tmpdir();
  await initProject(hookGoalDelegationTmp, {});
  const hookGoalDelegationPayload = JSON.stringify({ cwd: hookGoalDelegationTmp, prompt: '$Goal 설치 화면 문제 근본적으로 구현 수정해줘' });
  const hookGoalDelegationResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalDelegationTmp, input: hookGoalDelegationPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookGoalDelegationResult.code !== 0) throw new Error(`selftest failed: $Goal implementation delegation hook exited ${hookGoalDelegationResult.code}: ${hookGoalDelegationResult.stderr}`);
  const hookGoalDelegationJson = JSON.parse(hookGoalDelegationResult.stdout);
  const hookGoalDelegationContext = hookGoalDelegationJson.hookSpecificOutput?.additionalContext || '';
  const hookGoalDelegationBridgeMatch = hookGoalDelegationContext.match(/Goal bridge mission: (M-[A-Za-z0-9-]+)/);
  if (!hookGoalDelegationBridgeMatch || !hookGoalDelegationContext.includes('Delegated execution route: $Team')) throw new Error('selftest failed: $Goal implementation prompt did not prepare a bridge plus Team delegation');
  if (!hookGoalDelegationContext.includes('MANDATORY ambiguity-removal gate activated') || !hookGoalDelegationContext.includes('Route: $Team')) throw new Error('selftest failed: $Goal implementation delegation did not prepare Team ambiguity gate');
  const hookGoalDelegationState = await readJson(stateFile(hookGoalDelegationTmp), {});
  if (hookGoalDelegationState.mode !== 'TEAM' || hookGoalDelegationState.phase !== 'TEAM_CLARIFICATION_AWAITING_ANSWERS' || hookGoalDelegationState.implementation_allowed !== false) throw new Error('selftest failed: $Goal implementation delegation did not leave Team gate current');
  if (!(await exists(path.join(missionDir(hookGoalDelegationTmp, hookGoalDelegationBridgeMatch[1]), GOAL_WORKFLOW_ARTIFACT)))) throw new Error('selftest failed: $Goal implementation delegation did not write bridge workflow artifact');
  const activeGoalMissionId = hookState.mission_id;
  const hookGoalOverlayPayload = JSON.stringify({ cwd: hookGoalTmp, prompt: '설치 화면 문제 근본적으로 구현 수정해줘' });
  const hookGoalOverlayResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalTmp, input: hookGoalOverlayPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookGoalOverlayResult.code !== 0) throw new Error(`selftest failed: active Goal overlay hook exited ${hookGoalOverlayResult.code}: ${hookGoalOverlayResult.stderr}`);
  const hookGoalOverlayJson = JSON.parse(hookGoalOverlayResult.stdout);
  const hookGoalOverlayContext = hookGoalOverlayJson.hookSpecificOutput?.additionalContext || '';
  if (!hookGoalOverlayContext.includes('MANDATORY ambiguity-removal gate activated') || !hookGoalOverlayContext.includes('Route: $Team')) throw new Error('selftest failed: active Goal hijacked a plain Korean implementation prompt instead of preparing Team');
  if (!hookGoalOverlayContext.includes(`Active Goal overlay: existing Goal mission ${activeGoalMissionId}`) || !hookGoalOverlayContext.includes('goal-workflow.json')) throw new Error('selftest failed: active Goal overlay context was not included with the new route');
  if (hookGoalOverlayContext.indexOf('MANDATORY ambiguity-removal gate activated') > hookGoalOverlayContext.indexOf('Active Goal overlay:')) throw new Error('selftest failed: active Goal overlay appeared before the newly prepared Team gate');
  const hookGoalOverlayState = await readJson(stateFile(hookGoalTmp), {});
  if (hookGoalOverlayState.mission_id === activeGoalMissionId || hookGoalOverlayState.mode !== 'TEAM' || hookGoalOverlayState.phase !== 'TEAM_CLARIFICATION_AWAITING_ANSWERS' || hookGoalOverlayState.implementation_allowed !== false) throw new Error('selftest failed: active Goal overlay did not leave a new Team ambiguity mission current');
  if (!(await exists(path.join(missionDir(hookGoalTmp, hookGoalOverlayState.mission_id), 'required-answers.schema.json')))) throw new Error('selftest failed: active Goal overlay Team mission did not write ambiguity schema');
  const hookUpdateCurrentTmp = tmpdir();
  await initProject(hookUpdateCurrentTmp, {});
  const hookUpdateCurrentPayload = JSON.stringify({ cwd: hookUpdateCurrentTmp, prompt: '상태 확인해줘' });
  const hookUpdateCurrentResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateCurrentTmp,
    input: hookUpdateCurrentPayload,
    env: { SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9', SKS_INSTALLED_SKS_VERSION: '9.9.9' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateCurrentResult.code !== 0) throw new Error(`selftest failed: current update hook exited ${hookUpdateCurrentResult.code}: ${hookUpdateCurrentResult.stderr}`);
  const hookUpdateCurrentJson = JSON.parse(hookUpdateCurrentResult.stdout);
  const hookUpdateCurrentContext = hookUpdateCurrentJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdateCurrentContext).includes('Update SKS now') || String(hookUpdateCurrentContext).includes('Skip update for this conversation')) throw new Error('selftest failed: hook prompted for update even though installed SKS is current');
  const hookUpdateCurrentState = await readJson(path.join(hookUpdateCurrentTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateCurrentState.pending_offer) throw new Error('selftest failed: current installed SKS left a pending update offer');
  if (hookUpdateCurrentState.current !== '9.9.9' || hookUpdateCurrentState.runtime_current !== PACKAGE_VERSION || hookUpdateCurrentState.installed_current !== '9.9.9') throw new Error('selftest failed: hook did not record effective installed SKS version');
  const hookUpdatePendingTmp = tmpdir();
  await initProject(hookUpdatePendingTmp, {});
  await writeJsonAtomic(path.join(hookUpdatePendingTmp, '.sneakoscope', 'state', 'update-check.json'), {
    current: PACKAGE_VERSION,
    latest: '9.9.9',
    pending_offer: { conversation_id: hookUpdatePendingTmp, latest: '9.9.9', offered_at: nowIso() }
  });
  const hookUpdatePendingPayload = JSON.stringify({ cwd: hookUpdatePendingTmp, prompt: 'Update SKS now' });
  const hookUpdatePendingResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdatePendingTmp,
    input: hookUpdatePendingPayload,
    env: { SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9', SKS_INSTALLED_SKS_VERSION: '9.9.9' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdatePendingResult.code !== 0) throw new Error(`selftest failed: stale pending update hook exited ${hookUpdatePendingResult.code}: ${hookUpdatePendingResult.stderr}`);
  const hookUpdatePendingJson = JSON.parse(hookUpdatePendingResult.stdout);
  const hookUpdatePendingContext = hookUpdatePendingJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdatePendingContext).includes('user accepted update') || String(hookUpdatePendingContext).includes('Before doing other work')) throw new Error('selftest failed: current installed SKS accepted a stale pending update offer');
  const hookUpdatePendingState = await readJson(path.join(hookUpdatePendingTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdatePendingState.pending_offer) throw new Error('selftest failed: stale pending update offer was not cleared after installed SKS became current');
  const hookUpdateSkippedTmp = tmpdir();
  await initProject(hookUpdateSkippedTmp, {});
  await writeJsonAtomic(path.join(hookUpdateSkippedTmp, '.sneakoscope', 'state', 'update-check.json'), {
    current: PACKAGE_VERSION,
    latest: '9.9.9',
    skipped: { conversation_id: hookUpdateSkippedTmp, latest: '9.9.9', skipped_at: nowIso() }
  });
  const hookUpdateSkippedPayload = JSON.stringify({ cwd: hookUpdateSkippedTmp, prompt: '상태 확인해줘' });
  const hookUpdateSkippedResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateSkippedTmp,
    input: hookUpdateSkippedPayload,
    env: { SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9', SKS_INSTALLED_SKS_VERSION: '9.9.9' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateSkippedResult.code !== 0) throw new Error(`selftest failed: stale skipped update hook exited ${hookUpdateSkippedResult.code}: ${hookUpdateSkippedResult.stderr}`);
  const hookUpdateSkippedJson = JSON.parse(hookUpdateSkippedResult.stdout);
  const hookUpdateSkippedContext = hookUpdateSkippedJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdateSkippedContext).includes('was skipped for this conversation')) throw new Error('selftest failed: current installed SKS kept stale skipped update context');
  const hookUpdateSkippedState = await readJson(path.join(hookUpdateSkippedTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateSkippedState.skipped) throw new Error('selftest failed: stale skipped update state was not cleared after installed SKS became current');
  const hookUpdateOldTmp = tmpdir();
  await initProject(hookUpdateOldTmp, {});
  const hookUpdateOldPayload = JSON.stringify({ cwd: hookUpdateOldTmp, prompt: '상태 확인해줘' });
  const hookUpdateOldResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateOldTmp,
    input: hookUpdateOldPayload,
    env: { SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9', SKS_INSTALLED_SKS_VERSION: '0.0.0' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateOldResult.code !== 0) throw new Error(`selftest failed: stale update hook exited ${hookUpdateOldResult.code}: ${hookUpdateOldResult.stderr}`);
  const hookUpdateOldJson = JSON.parse(hookUpdateOldResult.stdout);
  const hookUpdateOldContext = hookUpdateOldJson.hookSpecificOutput?.additionalContext || '';
  if (!String(hookUpdateOldContext).includes('Update SKS now') || !String(hookUpdateOldContext).includes('Skip update for this conversation')) throw new Error('selftest failed: hook did not prompt when installed SKS is stale');
  const hookUpdateOldState = await readJson(path.join(hookUpdateOldTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateOldState.pending_offer?.latest !== '9.9.9') throw new Error('selftest failed: stale installed SKS did not persist pending update offer');
  const hookKoreanSksTmp = tmpdir();
  await initProject(hookKoreanSksTmp, {});
  const hookKoreanSksPayload = JSON.stringify({ cwd: hookKoreanSksTmp, prompt: koreanReadmeInstallPrompt });
  const hookKoreanSksResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookKoreanSksTmp, input: hookKoreanSksPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookKoreanSksResult.code !== 0) throw new Error(`selftest failed: Korean SKS hook exited ${hookKoreanSksResult.code}: ${hookKoreanSksResult.stderr}`);
  const hookKoreanSksJson = JSON.parse(hookKoreanSksResult.stdout);
  const hookKoreanSksContext = hookKoreanSksJson.hookSpecificOutput?.additionalContext || '';
  if (!hookKoreanSksContext.includes('Ambiguity gate auto-sealed') || hookKoreanSksContext.includes('GOAL_PRECISE: 이번 작업의 최종 목표')) throw new Error('selftest failed: Korean prompt did not auto-infer');
  if (!hookKoreanSksContext.includes('Route: $Team')) throw new Error('selftest failed: Korean implementation prompt did not promote to Team route');
  if (hookKoreanSksContext.includes('SKS answer-only pipeline active')) throw new Error('selftest failed: Korean implementation prompt still used answer-only pipeline');
  const hookKoreanSksState = await readJson(stateFile(hookKoreanSksTmp), {});
  if (hookKoreanSksState.phase !== 'TEAM_CLARIFICATION_CONTRACT_SEALED' || hookKoreanSksState.implementation_allowed !== true || !hookKoreanSksState.ambiguity_gate_passed) throw new Error('selftest failed: Korean Team auto-seal');
  const hookTeamTmp = tmpdir();
  await initProject(hookTeamTmp, {});
  const hookTeamPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '$Team 버튼 UX 수정 executor:2 reviewer:1 user:1' });
  const hookTeamResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: hookTeamPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookTeamResult.code !== 0) throw new Error(`selftest failed: $Team hook exited ${hookTeamResult.code}: ${hookTeamResult.stderr}`);
  const hookTeamJson = JSON.parse(hookTeamResult.stdout);
  if (!hookTeamJson.hookSpecificOutput?.additionalContext?.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest failed: $Team hook did not force ambiguity gate before Team execution');
  if (!hookTeamJson.hookSpecificOutput?.additionalContext?.includes('VISIBLE RESPONSE CONTRACT') || !String(hookTeamJson.systemMessage || '').includes('clarification questions')) throw new Error('selftest failed: $Team ambiguity gate did not force visible question response');
  if (hookTeamJson.hookSpecificOutput?.additionalContext?.includes('GOAL_PRECISE: 이번 작업의 최종 목표')) throw new Error('selftest failed: static Team goal');
  if (!hookTeamJson.hookSpecificOutput?.additionalContext?.includes('UI_STATE_BEHAVIOR')) throw new Error('selftest failed: missing Team UI question');
  if (!hookTeamJson.hookSpecificOutput?.additionalContext?.includes('Codex plan-tool interaction')) throw new Error('selftest failed: $Team ambiguity gate did not inject plan-tool guidance');
  const hookTeamState = await readJson(stateFile(hookTeamTmp), {});
  if (hookTeamState.phase !== 'TEAM_CLARIFICATION_AWAITING_ANSWERS' || hookTeamState.implementation_allowed !== false) throw new Error('selftest failed: $Team hook did not lock execution behind ambiguity gate');
  if (await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'team-plan.json'))) throw new Error('selftest failed: Team plan was created before ambiguity gate passed');
  const hookTeamPendingResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: JSON.stringify({ cwd: hookTeamTmp, prompt: '$Team 새 작업으로 넘어가' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookTeamPendingResult.code !== 0) throw new Error(`selftest failed: pending clarification hook exited ${hookTeamPendingResult.code}: ${hookTeamPendingResult.stderr}`);
  const hookTeamPendingJson = JSON.parse(hookTeamPendingResult.stdout);
  const hookTeamPendingState = await readJson(stateFile(hookTeamTmp), {});
  const hookTeamPendingContext = hookTeamPendingJson.hookSpecificOutput?.additionalContext || '';
  if (hookTeamPendingState.mission_id !== hookTeamState.mission_id) throw new Error('selftest failed: pending clarification allowed a new route mission to replace the visible question sheet');
  if (!hookTeamPendingContext.includes('Required questions still pending') || !hookTeamPendingContext.includes('VISIBLE RESPONSE CONTRACT') || !hookTeamPendingContext.includes('UI_STATE_BEHAVIOR')) throw new Error('selftest failed: pending clarification did not re-expose the question sheet');
  if (hookTeamPendingContext.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest failed: pending clarification prepared a new ambiguity gate instead of reusing the active one');
  const hookTeamStopResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: hookTeamTmp, input: JSON.stringify({ cwd: hookTeamTmp, last_assistant_message: 'I need three decisions before implementation, but I will not paste the Required questions block.' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (hookTeamStopResult.code !== 0) throw new Error(`selftest failed: Team stop hook exited ${hookTeamStopResult.code}: ${hookTeamStopResult.stderr}`);
  const hookTeamStopJson = JSON.parse(hookTeamStopResult.stdout);
  if (hookTeamStopJson.decision !== 'block' || !String(hookTeamStopJson.reason || '').includes('mandatory ambiguity-removal')) throw new Error('selftest failed: Stop hook did not block missing Team ambiguity answers');
  if (!String(hookTeamStopJson.reason || '').includes('Required questions') || !String(hookTeamStopJson.reason || '').includes('UI_STATE_BEHAVIOR')) throw new Error('selftest failed: missing Team stop UI question');
  if (String(hookTeamStopJson.reason || '').includes('GOAL_PRECISE: 이번 작업의 최종 목표')) throw new Error('selftest failed: static Team stop goal');
  if (!String(hookTeamStopJson.reason || '').includes('sks pipeline answer')) throw new Error('selftest failed: Stop hook did not provide pipeline answer command');
  if (!String(hookTeamStopJson.reason || '').includes('Codex plan-tool interaction')) throw new Error('selftest failed: Stop hook did not reprint plan-tool guidance');
  if (!String(hookTeamStopJson.reason || '').includes('VISIBLE RESPONSE CONTRACT')) throw new Error('selftest failed: Stop hook did not force visible clarification response');
  const hookTeamSchema = await readJson(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'required-answers.schema.json'));
  const visibleQuestionsBlock = [
    'Required questions',
    ...hookTeamSchema.slots.map((slot, idx) => `${idx + 1}. ${slot.id}: ${slot.question}`),
    'Reply by slot id, then I will write answers.json and run sks pipeline answer latest answers.json.'
  ].join('\n');
  const visibleQuestionDecision = await evaluateStop(hookTeamTmp, hookTeamState, { last_assistant_message: visibleQuestionsBlock }, { noQuestion: false });
  if (!visibleQuestionDecision?.continue) throw new Error('selftest failed: visible Required questions block was not accepted by clarification stop gate');
  const nonGoalsSlot = hookTeamSchema.slots.find((s) => s.id === 'NON_GOALS');
  if (nonGoalsSlot && !nonGoalsSlot.allow_empty) throw new Error('selftest failed: NON_GOALS does not allow an empty array answer');
  if (!nonGoalsSlot && !Array.isArray(hookTeamSchema.inferred_answers?.NON_GOALS)) throw new Error('selftest failed: NON_GOALS was neither asked nor inferred');
  const hookTeamAnswers = {};
  for (const s of hookTeamSchema.slots) hookTeamAnswers[s.id] = s.options ? (s.type === 'array' ? [s.options[0]] : s.options[0]) : (s.type.includes('array') ? ['selftest'] : (s.id === 'DB_MAX_BLAST_RADIUS' ? 'no_live_dml' : 'selftest'));
  hookTeamAnswers.NON_GOALS = [];
  const hookTeamAnswersPath = path.join(hookTeamTmp, 'team-answers.json');
  await writeJsonAtomic(hookTeamAnswersPath, hookTeamAnswers);
  const pipelineAnswerResult = await runProcess(process.execPath, [hookBin, 'pipeline', 'answer', 'latest', hookTeamAnswersPath], { cwd: hookTeamTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (pipelineAnswerResult.code !== 0) throw new Error(`selftest failed: pipeline answer exited ${pipelineAnswerResult.code}: ${pipelineAnswerResult.stderr}`);
  const answeredTeamState = await readJson(stateFile(hookTeamTmp), {});
  if (answeredTeamState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || !answeredTeamState.ambiguity_gate_passed || answeredTeamState.implementation_allowed !== true || !answeredTeamState.team_plan_ready) throw new Error('selftest failed: pipeline answer did not materialize Team after ambiguity gate');
  if (!(await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'decision-contract.json')))) throw new Error('selftest failed: pipeline answer did not seal decision contract');
  if (!(await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'team-plan.json'))) || !(await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'team-live.md')))) throw new Error('selftest failed: Team artifacts missing after ambiguity gate passed');
  const honestLoopTmp = tmpdir();
  await initProject(honestLoopTmp, {});
  const { id: honestLoopId, dir: honestLoopDir } = await createMission(honestLoopTmp, { mode: 'sks', prompt: 'honest loopback selftest' });
  await writeJsonAtomic(path.join(honestLoopDir, 'decision-contract.json'), { sealed_hash: 'selftest', answers: { GOAL_PRECISE: 'selftest' } });
  await setCurrent(honestLoopTmp, { mission_id: honestLoopId, route: 'SKS', route_command: '$SKS', mode: 'SKS', phase: 'SKS_CLARIFICATION_CONTRACT_SEALED', implementation_allowed: true, clarification_required: false, ambiguity_gate_passed: true, stop_gate: 'honest_mode' });
  const honestLoopResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nSelftest 경로의 Honest Mode loopback 동작을 검증했습니다.\n**솔직모드**\n검증: selftest ran\n남은 gap: CHANGELOG.md 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestLoopResult.code !== 0) throw new Error(`selftest failed: honest loopback hook exited ${honestLoopResult.code}: ${honestLoopResult.stderr}`);
  const honestLoopJson = JSON.parse(honestLoopResult.stdout);
  if (honestLoopJson.decision !== 'block' || !String(honestLoopJson.reason || '').includes('post-ambiguity execution phase')) throw new Error('selftest failed: Honest Mode gap did not trigger loopback');
  const honestLoopState = await readJson(stateFile(honestLoopTmp), {});
  if (honestLoopState.phase !== 'SKS_HONEST_LOOPBACK_AFTER_CLARIFICATION' || honestLoopState.implementation_allowed !== true || honestLoopState.clarification_required !== false || honestLoopState.ambiguity_gate_passed !== true) throw new Error('selftest failed: honest loopback did not preserve post-ambiguity execution state');
  if (!(await exists(path.join(honestLoopDir, 'honest-loopback.json')))) throw new Error('selftest failed: honest-loopback artifact missing');
  const honestCleanResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nCHANGELOG 확인과 selftest 통과 상태로 loopback을 닫았습니다.\n**솔직모드**\n검증: CHANGELOG.md check and selftest passed\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestCleanResult.code !== 0) throw new Error(`selftest failed: clean honest hook exited ${honestCleanResult.code}: ${honestCleanResult.stderr}`);
  const honestCleanJson = JSON.parse(honestCleanResult.stdout);
  if (honestCleanJson.decision === 'block') throw new Error('selftest failed: clean Honest Mode was blocked after loopback was resolved');
  const honestCleanState = await readJson(stateFile(honestLoopTmp), {});
  if (honestCleanState.honest_loop_required !== false || honestCleanState.phase !== 'SKS_HONEST_COMPLETE') throw new Error('selftest failed: honest loopback was not marked resolved');
  const honestMissingSummaryResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**솔직모드**\n검증: selftest 통과\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestMissingSummaryResult.code !== 0) throw new Error(`selftest failed: missing-summary honest hook exited ${honestMissingSummaryResult.code}: ${honestMissingSummaryResult.stderr}`);
  const honestMissingSummaryJson = JSON.parse(honestMissingSummaryResult.stdout);
  if (honestMissingSummaryJson.decision !== 'block' || !String(honestMissingSummaryJson.reason || '').includes('completion summary')) throw new Error('selftest failed: Honest Mode without completion summary was accepted');
  const honestMissingSummaryRepeatResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**솔직모드**\n검증: selftest 통과\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestMissingSummaryRepeatResult.code !== 0) throw new Error(`selftest failed: repeated missing-summary honest hook exited ${honestMissingSummaryRepeatResult.code}: ${honestMissingSummaryRepeatResult.stderr}`);
  const honestMissingSummaryRepeatJson = JSON.parse(honestMissingSummaryRepeatResult.stdout);
  if (honestMissingSummaryRepeatJson.decision === 'block' || !String(honestMissingSummaryRepeatJson.systemMessage || '').includes('repeat guard')) throw new Error('selftest failed: repeated completion-summary stop prompt was not suppressed');
  const honestBlockedAsExpectedResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nlegacy QA report 차단 확인을 검증했습니다.\n**솔직모드**\n검증: selftest 통과, legacy `qa-report.md` 차단 확인\n제약: registry publish excluded' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestBlockedAsExpectedResult.code !== 0) throw new Error(`selftest failed: blocked-as-expected honest hook exited ${honestBlockedAsExpectedResult.code}: ${honestBlockedAsExpectedResult.stderr}`);
  const honestBlockedAsExpectedJson = JSON.parse(honestBlockedAsExpectedResult.stdout);
  if (honestBlockedAsExpectedJson.decision === 'block') throw new Error('selftest failed: blocked-as-expected evidence was treated as an unresolved gap');
  const honestNoActiveGateResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**Completion Summary**\nWhat changed: verified route-gate closure evidence handling.\n**SKS Honest Mode**\nVerified: pipeline status returned `No active blocking route gate detected`; post-reflection work blocking was verified by selftest.\nRemaining gaps: none' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestNoActiveGateResult.code !== 0) throw new Error(`selftest failed: no-active-gate honest hook exited ${honestNoActiveGateResult.code}: ${honestNoActiveGateResult.stderr}`);
  const honestNoActiveGateJson = JSON.parse(honestNoActiveGateResult.stdout);
  if (honestNoActiveGateJson.decision === 'block') throw new Error('selftest failed: no-active-blocking status was treated as an unresolved gap');
  const honestNotBlockerResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**Completion Summary**\nWhat changed: verified non-blocker wording in final closeout.\n**SKS Honest Mode**\nVerified: selftest passed.\nRemaining gaps: none. Unrelated dirty worktree entries are not a blocker for this scoped task.' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestNotBlockerResult.code !== 0) throw new Error(`selftest failed: not-blocker honest hook exited ${honestNotBlockerResult.code}: ${honestNotBlockerResult.stderr}`);
  const honestNotBlockerJson = JSON.parse(honestNotBlockerResult.stdout);
  if (honestNotBlockerJson.decision === 'block') throw new Error('selftest failed: non-blocker boundary wording was treated as unresolved gap');
  const honestSummaryCaseResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\n[src/cli/main.mjs]: selftest에 요약 없으면 차단, 요약 있으면 통과 케이스 추가.\n**솔직모드**\n검증: selftest 통과.\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestSummaryCaseResult.code !== 0) throw new Error(`selftest failed: summary-case honest hook exited ${honestSummaryCaseResult.code}: ${honestSummaryCaseResult.stderr}`);
  const honestSummaryCaseJson = JSON.parse(honestSummaryCaseResult.stdout);
  if (honestSummaryCaseJson.decision === 'block') throw new Error('selftest failed: summary block/pass wording was treated as unresolved gap');
  const hookQaTmp = tmpdir();
  await initProject(hookQaTmp, {});
  const hookQaPayload = JSON.stringify({ cwd: hookQaTmp, prompt: '$QA-LOOP run UI and API E2E against local dev' });
  const hookQaResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookQaTmp, input: hookQaPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookQaResult.code !== 0) throw new Error(`selftest failed: $QA-LOOP hook exited ${hookQaResult.code}: ${hookQaResult.stderr}`);
  const hookQaJson = JSON.parse(hookQaResult.stdout);
  const hookQaContext = hookQaJson.hookSpecificOutput?.additionalContext || '';
  if (!hookQaContext.includes('MANDATORY ambiguity-removal gate activated') || !hookQaContext.includes('QA_SCOPE') || !hookQaContext.includes('UI_COMPUTER_USE_ACK')) throw new Error('selftest failed: $QA-LOOP hook did not provide QA-specific questions');
  if (!hookQaContext.includes('Codex Computer Use') || !hookQaContext.includes('Playwright') || !hookQaContext.includes('Chrome MCP')) throw new Error('selftest failed: $QA-LOOP hook did not state Computer Use-only UI policy');
  if (hookQaContext.includes('Browser Use 또는 Computer Use') || hookQaContext.includes('Browser/Computer Use evidence')) throw new Error('selftest failed: $QA-LOOP hook still allows Browser Use as UI evidence');
  const hookQaState = await readJson(stateFile(hookQaTmp), {});
  if (hookQaState.phase !== 'QALOOP_CLARIFICATION_AWAITING_ANSWERS' || hookQaState.implementation_allowed !== false) throw new Error('selftest failed: $QA-LOOP hook did not lock execution behind ambiguity gate');
  const hookQaSchema = await readJson(path.join(missionDir(hookQaTmp, hookQaState.mission_id), 'required-answers.schema.json'));
  const hookQaAnswers = {};
  for (const s of hookQaSchema.slots) hookQaAnswers[s.id] = s.options ? (s.type === 'array' ? [s.options[0]] : s.options[0]) : (s.type.includes('array') ? ['selftest'] : 'selftest');
  hookQaAnswers.QA_SCOPE = 'all_available';
  hookQaAnswers.TARGET_BASE_URL = 'none';
  hookQaAnswers.API_BASE_URL = 'same_as_target';
  const hookQaAnswersPath = path.join(hookQaTmp, 'qa-answers.json');
  await writeJsonAtomic(hookQaAnswersPath, hookQaAnswers);
  const qaAnswerResult = await runProcess(process.execPath, [hookBin, 'pipeline', 'answer', 'latest', hookQaAnswersPath], { cwd: hookQaTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (qaAnswerResult.code !== 0) throw new Error(`selftest failed: QA pipeline answer exited ${qaAnswerResult.code}: ${qaAnswerResult.stderr}`);
  const qaMissionDir = missionDir(hookQaTmp, hookQaState.mission_id);
  const initialQaGate = await readJson(path.join(qaMissionDir, 'qa-gate.json'));
  const qaReportFile = initialQaGate.qa_report_file;
  if (!isQaReportFilename(qaReportFile)) throw new Error(`selftest failed: QA report filename is not date/version-prefixed: ${qaReportFile}`);
  if ((await exists(path.join(qaMissionDir, 'qa-report.md')))) throw new Error('selftest failed: legacy QA report filename was created');
  if (!(await exists(path.join(qaMissionDir, qaReportFile))) || !(await exists(path.join(qaMissionDir, 'qa-ledger.json'))) || !(await exists(path.join(qaMissionDir, 'qa-gate.json')))) throw new Error('selftest failed: QA artifacts missing after answer');
  const legacyQaTmp = tmpdir();
  await writeJsonAtomic(path.join(legacyQaTmp, 'qa-gate.json'), { ...defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } }, { reportFile: 'qa-report.md' }), passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, post_fix_verification_complete: true, honest_mode_complete: true });
  await writeJsonAtomic(path.join(legacyQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(legacyQaTmp, 'qa-report.md'), '# legacy\n');
  const legacyQaGate = await evaluateQaGate(legacyQaTmp);
  if (legacyQaGate.passed || !legacyQaGate.reasons.includes('qa_report_filename_prefix_invalid')) throw new Error('selftest failed: legacy QA report filename was accepted');
  const unresolvedQaTmp = tmpdir();
  await writeJsonAtomic(path.join(unresolvedQaTmp, 'qa-gate.json'), { ...defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } }), passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, unresolved_findings: 0, unresolved_fixable_findings: 1, post_fix_verification_complete: true, honest_mode_complete: true });
  const unresolvedQaGateFile = (await readJson(path.join(unresolvedQaTmp, 'qa-gate.json'))).qa_report_file;
  await writeJsonAtomic(path.join(unresolvedQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(unresolvedQaTmp, unresolvedQaGateFile), '# unresolved\n');
  const unresolvedQaGate = await evaluateQaGate(unresolvedQaTmp);
  if (unresolvedQaGate.passed || !unresolvedQaGate.reasons.includes('unresolved_fixable_findings_remaining')) throw new Error('selftest failed: unresolved fixable QA finding was accepted');
  const forbiddenQaTmp = tmpdir();
  const forbiddenQaGate = defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'ui_e2e_only', TARGET_BASE_URL: 'http://localhost:3000', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } });
  await writeJsonAtomic(path.join(forbiddenQaTmp, 'qa-gate.json'), { ...forbiddenQaGate, passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, ui_evidence_source: 'playwright', post_fix_verification_complete: true, honest_mode_complete: true, evidence: ['Playwright screenshot evidence'] });
  await writeJsonAtomic(path.join(forbiddenQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(forbiddenQaTmp, forbiddenQaGate.qa_report_file), '# forbidden\n');
  const forbiddenQaGateResult = await evaluateQaGate(forbiddenQaTmp);
  if (forbiddenQaGateResult.passed || !forbiddenQaGateResult.reasons.includes('ui_evidence_source_not_codex_computer_use') || !forbiddenQaGateResult.reasons.includes('forbidden_browser_automation_evidence')) throw new Error('selftest failed: forbidden browser automation QA evidence was accepted');
  const promptQa = buildQaLoopPrompt({ id: 'selftest', mission: { prompt: 'QA and fix' }, contract: { answers: { QA_CORRECTIVE_POLICY: 'apply_safe_fixes_and_reverify' } }, cycle: 1, previous: '', reportFile: qaReportFile });
  if (!promptQa.includes('dogfood as human proxy') || !promptQa.includes('fix safe code/test/docs now') || !promptQa.includes('post_fix_verification_complete')) throw new Error('selftest failed: QA-LOOP dogfood prompt');
  if (!promptQa.includes(CODEX_COMPUTER_USE_ONLY_POLICY) || !promptQa.includes('Chrome MCP') || !promptQa.includes('Playwright') || !promptQa.includes('Browser Use')) throw new Error('selftest failed: QA-LOOP prompt did not enforce Computer Use-only UI evidence');
  if (promptQa.includes('Browser/Computer Use evidence')) throw new Error('selftest failed: QA-LOOP prompt still allows Browser/Computer UI evidence');
  const pkgQa = defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } });
  if (pkgQa.ui_e2e_required || pkgQa.api_e2e_required || !pkgQa.ui_computer_use_evidence) throw new Error('selftest failed: package QA target gate');
  const qaRunResult = await runProcess(process.execPath, [hookBin, 'qa-loop', 'run', 'latest', '--mock'], { cwd: hookQaTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (qaRunResult.code !== 0) throw new Error(`selftest failed: qa-loop mock run exited ${qaRunResult.code}: ${qaRunResult.stderr}`);
  const qaGate = await readJson(path.join(qaMissionDir, 'qa-gate.evaluated.json'));
  if (!qaGate.passed) throw new Error('selftest failed: qa-loop mock gate did not pass');
  const hookDfixTmp = tmpdir();
  await initProject(hookDfixTmp, {});
  const hookDfixPayload = JSON.stringify({ cwd: hookDfixTmp, prompt: '$DFix 버튼 라벨 바꿔줘' });
  const hookDfixResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookDfixTmp, input: hookDfixPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (hookDfixResult.code !== 0) throw new Error(`selftest failed: $DFix hook exited ${hookDfixResult.code}: ${hookDfixResult.stderr}`);
  const hookDfixJson = JSON.parse(hookDfixResult.stdout);
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest failed: $DFix incorrectly triggered ambiguity gate');
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('SKS skill-first pipeline active')) throw new Error('selftest failed: $DFix entered the general SKS prompt pipeline');
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('Mission:')) throw new Error('selftest failed: $DFix created route mission state');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix ultralight pipeline active')) throw new Error('selftest failed: $DFix hook missing ultralight pipeline guidance');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('Task list:')) throw new Error('selftest failed: $DFix hook missing micro task list');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix 완료 요약')) throw new Error('selftest failed: $DFix hook missing no-record final marker guidance');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix 솔직모드')) throw new Error('selftest failed: $DFix hook missing lightweight Honest Mode guidance');
  if (!hookDfixJson.systemMessage?.includes('DFix ultralight')) throw new Error('selftest failed: $DFix hook missing ultralight system message');
  if (await exists(path.join(hookDfixTmp, '.sneakoscope', 'state', 'light-route-stop.json'))) throw new Error('selftest failed: $DFix hook created persistent light-route state');
  const hookDfixState = await readJson(stateFile(hookDfixTmp), {});
  if (String(hookDfixState.phase || '').includes('CLARIFICATION_AWAITING_ANSWERS')) throw new Error('selftest failed: $DFix state entered clarification gate');
  const inferredDfixPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '버튼 라벨 바꿔줘' });
  const inferredDfixResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: inferredDfixPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (inferredDfixResult.code !== 0) throw new Error(`selftest failed: inferred DFix hook exited ${inferredDfixResult.code}: ${inferredDfixResult.stderr}`);
  const inferredDfixJson = JSON.parse(inferredDfixResult.stdout);
  const inferredDfixContext = inferredDfixJson.hookSpecificOutput?.additionalContext || '';
  if (!inferredDfixContext.includes('DFix ultralight pipeline active')) throw new Error('selftest failed: inferred DFix did not use ultralight route');
  if (inferredDfixContext.includes('SKS skill-first pipeline active') || inferredDfixContext.includes('Active Team mission') || inferredDfixContext.includes('Mission:')) throw new Error('selftest failed: inferred DFix leaked general pipeline or active Team context');
  const answerPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '이 파이프라인은 왜 이렇게 동작해?' });
  const answerResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: answerPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (answerResult.code !== 0) throw new Error(`selftest failed: answer-only hook exited ${answerResult.code}: ${answerResult.stderr}`);
  const answerJson = JSON.parse(answerResult.stdout);
  const answerContext = answerJson.hookSpecificOutput?.additionalContext || '';
  if (!answerContext.includes('SKS answer-only pipeline active')) throw new Error('selftest failed: question prompt did not use Answer route');
  if (answerContext.includes('MANDATORY ambiguity-removal gate activated') || answerContext.includes('SKS skill-first pipeline active') || answerContext.includes('Active Team mission') || answerContext.includes('Mission:')) throw new Error('selftest failed: Answer route leaked execution pipeline or active Team context');
  if (!answerJson.systemMessage?.includes('answer-only')) throw new Error('selftest failed: Answer route missing system message');
  const wikiPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '$Wiki 갱신' });
  const wikiResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: wikiPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (wikiResult.code !== 0) throw new Error(`selftest failed: Wiki hook exited ${wikiResult.code}: ${wikiResult.stderr}`);
  const wikiJson = JSON.parse(wikiResult.stdout);
  const wikiContext = wikiJson.hookSpecificOutput?.additionalContext || '';
  if (!wikiContext.includes('SKS wiki pipeline active') || !wikiContext.includes('sks wiki refresh')) throw new Error('selftest failed: $Wiki hook did not inject wiki route');
  if (wikiContext.includes('MANDATORY ambiguity-removal gate activated') || wikiContext.includes('Mission:')) throw new Error('selftest failed: Wiki route created ambiguity mission state');
  if (!wikiJson.systemMessage?.includes('wiki refresh')) throw new Error('selftest failed: Wiki route missing system message');
  const codexConfigText = await safeReadText(path.join(tmp, '.codex', 'config.toml'));
  if (!codexConfigText.includes('multi_agent = true')) throw new Error('selftest failed: multi_agent not enabled');
  if (!hasContext7ConfigText(codexConfigText)) throw new Error('selftest failed: Context7 MCP not configured');
  if (!codexConfigText.includes('[profiles.sks-task-low]') || !codexConfigText.includes('[profiles.sks-task-medium]') || !codexConfigText.includes('[profiles.sks-logic-high]') || !codexConfigText.includes('[profiles.sks-research-xhigh]') || !codexConfigText.includes('[profiles.sks-mad-high]')) throw new Error('selftest failed: GPT-5.5 reasoning profiles not configured');
  if (!codexConfigText.includes('[agents.analysis_scout]')) throw new Error('selftest failed: analysis_scout agent not configured');
  if (!codexConfigText.includes('[agents.team_consensus]')) throw new Error('selftest failed: team_consensus agent not configured');
  const autoReviewHome = path.join(tmp, 'auto-review-home');
  const autoReviewEnv = { HOME: autoReviewHome };
  const autoReviewEnabled = await enableAutoReview({ env: autoReviewEnv, high: true });
  if (!autoReviewEnabled.enabled || autoReviewEnabled.profile_name !== 'sks-auto-review-high' || !autoReviewEnabled.high_profile) throw new Error('selftest failed: auto-review high profile was not enabled');
  const autoReviewConfig = await safeReadText(path.join(autoReviewHome, '.codex', 'config.toml'));
  if (!autoReviewConfig.includes('approvals_reviewer = "auto_review"') || autoReviewConfig.includes('approvals_reviewer = "guardian_subagent"') || !autoReviewConfig.includes('[profiles.sks-auto-review-high]')) throw new Error('selftest failed: auto-review config not written');
  const autoReviewDisabled = await disableAutoReview({ env: autoReviewEnv });
  if (autoReviewDisabled.enabled || autoReviewDisabled.approvals_reviewer !== 'user') throw new Error('selftest failed: auto-review disable did not restore user reviewer');
  const autoReviewDisabledConfig = await safeReadText(path.join(autoReviewHome, '.codex', 'config.toml'));
  if (autoReviewDisabledConfig.includes('approvals_reviewer = "guardian_subagent"')) throw new Error('selftest failed: auto-review disable left legacy reviewer values');
  const analysisAgentExists = await exists(path.join(tmp, '.codex', 'agents', 'analysis-scout.toml'));
  if (!analysisAgentExists) throw new Error('selftest failed: analysis scout agent not installed');
  const teamAgentExists = await exists(path.join(tmp, '.codex', 'agents', 'team-consensus.toml'));
  if (!teamAgentExists) throw new Error('selftest failed: team consensus agent not installed');
  const teamSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'team', 'SKILL.md'));
  if (!teamSkillExists) throw new Error('selftest failed: $Team skill not installed');
  const honestSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'honest-mode', 'SKILL.md'));
  if (!honestSkillExists) throw new Error('selftest failed: honest-mode skill not installed');
  const autoResearchSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'autoresearch-loop', 'SKILL.md'));
  if (!autoResearchSkillExists) throw new Error('selftest failed: autoresearch-loop skill not installed');
  const requiredSkillsStatus = await checkRequiredSkills(tmp);
  if (!requiredSkillsStatus.ok) throw new Error(`selftest failed: required skills missing: ${requiredSkillsStatus.missing.join(', ')}`);
  const c7Status = await checkContext7(tmp);
  if (!c7Status.ok || !c7Status.project.ok) throw new Error('selftest failed: Context7 check failed for project config');
  if (hasContext7ConfigText('[mcp_servers.other]\ncommand = "npx"\n')) throw new Error('selftest failed: missing Context7 config passed structural check');
  const mockContext7Path = path.join(tmp, 'mock-context7.mjs');
  await writeTextAtomic(mockContext7Path, `process.stdin.setEncoding('utf8');\nlet buf='';\nfunction send(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');}\nprocess.stdin.on('data',(chunk)=>{buf+=chunk;for(;;){const i=buf.indexOf('\\n');if(i<0)break;const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;const msg=JSON.parse(line);if(!msg.id)continue;if(msg.method==='initialize')send(msg.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'Mock Context7',version:'0.0.0'}});else if(msg.method==='tools/list')send(msg.id,{tools:[{name:'resolve-library-id'},{name:'query-docs'}]});else if(msg.method==='tools/call'&&msg.params.name==='resolve-library-id')send(msg.id,{content:[{type:'text',text:'Context7-compatible library ID: /mock/lib'}]});else if(msg.method==='tools/call'&&msg.params.name==='query-docs')send(msg.id,{content:[{type:'text',text:'mock docs for '+msg.params.arguments.libraryId}]});else send(msg.id,{content:[{type:'text',text:'unknown'}],isError:true});}});\n`);
  const mockContext7Docs = await context7Docs('Mock Lib', { command: process.execPath, args: [mockContext7Path], query: 'hooks', timeoutMs: 5000 });
  if (!mockContext7Docs.ok || mockContext7Docs.docs_tool !== 'query-docs' || mockContext7Docs.library_id !== '/mock/lib') throw new Error('selftest failed: local Context7 MCP client did not resolve/query docs');
  const passedTeamGate = { passed: true, analysis_artifact: true, triwiki_refreshed: true, triwiki_validated: true, consensus_artifact: true, team_roster_confirmed: true, implementation_team_fresh: true, review_artifact: true, integration_evidence: true, session_cleanup: true };
  const passedTeamSessionCleanup = { schema_version: 1, passed: true, all_sessions_closed: true, outstanding_sessions: 0, live_transcript_finalized: true, closed_at: nowIso() };
  const passedFromChatImgCoverageLedger = {
    schema_version: 1,
    passed: true,
    all_chat_requirements_listed: true,
    all_requirements_mapped_to_work_order: true,
    all_screenshot_regions_accounted: true,
    all_attachments_accounted: true,
    image_analysis_complete: true,
    verbatim_customer_requests_preserved: true,
    checklist_updated: true,
    temp_triwiki_recorded: true,
    scoped_qa_loop_completed: true,
    checklist_file: FROM_CHAT_IMG_CHECKLIST_ARTIFACT,
    temp_triwiki_file: FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT,
    qa_loop_file: FROM_CHAT_IMG_QA_LOOP_ARTIFACT,
    unresolved_items: [],
    chat_requirements: [{ id: 'req-1', source: 'selftest chat text', text: 'Change the hero image.' }],
    attachment_matches: [{ id: 'match-1', requirement_ids: ['req-1'], attachment: 'original-1.png', confidence: 'high' }],
    work_order_items: [{ id: 'work-1', requirement_ids: ['req-1'], action: 'Apply the requested hero image change.' }]
  };
  const passedFromChatImgChecklist = [
    '# From-Chat-IMG Checklist',
    '',
    '## Customer Requests',
    '- [x] req-1 source-bound customer request preserved.',
    '',
    '## Image Analysis',
    '- [x] match-1 screenshot image region matched to original-1.png with high confidence.',
    '',
    '## Work Items',
    '- [x] work-1 requested hero image change represented in the work order.',
    '',
    '## QA Loop',
    '- [x] scoped QA-LOOP covered work-1 after implementation with zero unresolved findings.',
    '',
    '## Verification',
    '- [x] coverage ledger, checklist, and temporary TriWiki session context reconciled.',
    ''
  ].join('\n');
  const passedFromChatImgTempTriWiki = {
    schema_version: 1,
    scope: 'temporary',
    storage: 'triwiki',
    expires_after_sessions: FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS,
    claims: [{ id: 'req-1', source: 'selftest chat text', text: 'Change the hero image.', trust: 'source_bound' }]
  };
  const passedFromChatImgQaLoop = {
    schema_version: 1,
    passed: true,
    scope: 'from-chat-img-work-order',
    coverage_ledger: FROM_CHAT_IMG_COVERAGE_ARTIFACT,
    checklist_file: FROM_CHAT_IMG_CHECKLIST_ARTIFACT,
    all_work_order_items_qa_checked: true,
    work_order_item_ids_covered: ['work-1'],
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    post_fix_verification_complete: true,
    computer_use_evidence_source: CODEX_COMPUTER_USE_EVIDENCE_SOURCE,
    evidence: ['selftest scoped QA-LOOP covered work-1']
  };
  const incompleteTeamGateTmp = tmpdir();
  await initProject(incompleteTeamGateTmp, {});
  const { id: incompleteGateId, dir: incompleteGateDir } = await createMission(incompleteTeamGateTmp, { mode: 'team', prompt: 'incomplete team gate test' });
  await writeJsonAtomic(path.join(incompleteGateDir, 'team-gate.json'), { passed: true, analysis_artifact: true, triwiki_refreshed: true });
  await setCurrent(incompleteTeamGateTmp, { mission_id: incompleteGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, subagents_required: false, stop_gate: 'team-gate.json' });
  const incompleteGateState = await readJson(stateFile(incompleteTeamGateTmp), {});
  const incompleteGateStop = await evaluateStop(incompleteTeamGateTmp, incompleteGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (incompleteGateStop?.decision !== 'block' || !String(incompleteGateStop.reason || '').includes('triwiki_validated')) throw new Error('selftest failed: incomplete Team gate was not blocked');
  const routeGateTmp = tmpdir();
  await initProject(routeGateTmp, {});
  const { id: gateId, dir: gateDir } = await createMission(routeGateTmp, { mode: 'team', prompt: 'Context7 gate test' });
  await writeJsonAtomic(path.join(gateDir, 'team-roster.json'), { schema_version: 1, mission_id: gateId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(gateDir, 'team-gate.json'), passedTeamGate);
  await setCurrent(routeGateTmp, { mission_id: gateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: true, stop_gate: 'team-gate.json' });
  const gateState = await readJson(stateFile(routeGateTmp), {});
  const missingC7Stop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingC7Stop?.decision !== 'block' || !String(missingC7Stop.reason || '').includes('Context7')) throw new Error('selftest failed: Stop hook did not block missing Context7 evidence');
  const rosterArtifactGateTmp = tmpdir();
  await initProject(rosterArtifactGateTmp, {});
  const { id: rosterArtifactGateId, dir: rosterArtifactGateDir } = await createMission(rosterArtifactGateTmp, { mode: 'team', prompt: 'team roster artifact gate test' });
  await writeJsonAtomic(path.join(rosterArtifactGateDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false });
  await setCurrent(rosterArtifactGateTmp, { mission_id: rosterArtifactGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, stop_gate: 'team-gate.json' });
  const rosterArtifactGateState = await readJson(stateFile(rosterArtifactGateTmp), {});
  const missingRosterArtifactStop = await evaluateStop(rosterArtifactGateTmp, rosterArtifactGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingRosterArtifactStop?.decision !== 'block' || !String(missingRosterArtifactStop.reason || '').includes('team-roster.json')) throw new Error('selftest failed: Team gate did not block missing team roster artifact');
  const runtimeGateTmp = tmpdir();
  await initProject(runtimeGateTmp, {});
  const { id: runtimeGateId, dir: runtimeGateDir } = await createMission(runtimeGateTmp, { mode: 'team', prompt: 'team runtime graph gate test' });
  await writeJsonAtomic(path.join(runtimeGateDir, 'team-roster.json'), { schema_version: 1, mission_id: runtimeGateId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(runtimeGateDir, TEAM_SESSION_CLEANUP_ARTIFACT), passedTeamSessionCleanup);
  await writeJsonAtomic(path.join(runtimeGateDir, 'team-gate.json'), {
    ...passedTeamGate,
    team_graph_required: true,
    team_graph_compiled: true,
    runtime_dependencies_concrete: true,
    worker_inboxes_written: true,
    write_scope_conflicts_zero: true,
    task_claim_readiness_checked: true
  });
  await setCurrent(runtimeGateTmp, { mission_id: runtimeGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, stop_gate: 'team-gate.json' });
  const runtimeGateState = await readJson(stateFile(runtimeGateTmp), {});
  const missingRuntimeGraphStop = await evaluateStop(runtimeGateTmp, runtimeGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingRuntimeGraphStop?.decision !== 'block' || !String(missingRuntimeGraphStop.reason || '').includes(TEAM_GRAPH_ARTIFACT)) throw new Error('selftest failed: Team gate did not block missing runtime graph artifacts');
  const fromChatCoverageTmp = tmpdir();
  await initProject(fromChatCoverageTmp, {});
  const { id: fromChatCoverageId, dir: fromChatCoverageDir } = await createMission(fromChatCoverageTmp, { mode: 'team', prompt: '$From-Chat-IMG coverage gate test' });
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-roster.json'), { schema_version: 1, mission_id: fromChatCoverageId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false, from_chat_img_required: true });
  await setCurrent(fromChatCoverageTmp, { mission_id: fromChatCoverageId, mode: 'TEAM', route: 'Team', route_command: '$From-Chat-IMG', phase: 'TEAM_REVIEW', context7_required: false, from_chat_img_required: true, stop_gate: 'team-gate.json' });
  const fromChatCoverageState = await readJson(stateFile(fromChatCoverageTmp), {});
  const missingFromChatCoverageFieldStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatCoverageFieldStop?.decision !== 'block' || !String(missingFromChatCoverageFieldStop.reason || '').includes('from_chat_img_request_coverage')) throw new Error('selftest failed: From-Chat-IMG coverage field did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false, from_chat_img_required: true, from_chat_img_request_coverage: true });
  const missingFromChatCoverageArtifactStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatCoverageArtifactStop?.decision !== 'block' || !String(missingFromChatCoverageArtifactStop.reason || '').includes(FROM_CHAT_IMG_COVERAGE_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG coverage artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_COVERAGE_ARTIFACT), { ...passedFromChatImgCoverageLedger, unresolved_items: ['ambiguous request'] });
  const unresolvedFromChatCoverageStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (unresolvedFromChatCoverageStop?.decision !== 'block' || !String(unresolvedFromChatCoverageStop.reason || '').includes(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:unresolved_items`)) throw new Error('selftest failed: From-Chat-IMG unresolved items did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_COVERAGE_ARTIFACT), passedFromChatImgCoverageLedger);
  const missingFromChatChecklistStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatChecklistStop?.decision !== 'block' || !String(missingFromChatChecklistStop.reason || '').includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG checklist artifact did not block Team gate');
  await writeTextAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_CHECKLIST_ARTIFACT), passedFromChatImgChecklist.replace('- [x] req-1', '- [ ] req-1'));
  const uncheckedFromChatChecklistStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (uncheckedFromChatChecklistStop?.decision !== 'block' || !String(uncheckedFromChatChecklistStop.reason || '').includes(`${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}:unchecked_items`)) throw new Error('selftest failed: From-Chat-IMG unchecked checklist item did not block Team gate');
  await writeTextAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_CHECKLIST_ARTIFACT), passedFromChatImgChecklist);
  const missingFromChatTempTriWikiStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatTempTriWikiStop?.decision !== 'block' || !String(missingFromChatTempTriWikiStop.reason || '').includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG temporary TriWiki artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), { ...passedFromChatImgTempTriWiki, expires_after_sessions: FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS + 1 });
  const invalidFromChatTempTriWikiStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (invalidFromChatTempTriWikiStop?.decision !== 'block' || !String(invalidFromChatTempTriWikiStop.reason || '').includes(`${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}:expires_after_sessions`)) throw new Error('selftest failed: From-Chat-IMG temporary TriWiki TTL did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), passedFromChatImgTempTriWiki);
  const missingFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatQaLoopStop?.decision !== 'block' || !String(missingFromChatQaLoopStop.reason || '').includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG scoped QA-LOOP artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, unresolved_findings: 1 });
  const unresolvedFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (unresolvedFromChatQaLoopStop?.decision !== 'block' || !String(unresolvedFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:unresolved_findings`)) throw new Error('selftest failed: From-Chat-IMG scoped QA-LOOP findings did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, work_order_item_ids_covered: [] });
  const uncoveredFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (uncoveredFromChatQaLoopStop?.decision !== 'block' || !String(uncoveredFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:work_order_item_ids_covered`)) throw new Error('selftest failed: From-Chat-IMG scoped QA-LOOP work item coverage did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, computer_use_evidence_source: 'playwright', evidence: ['Playwright visual verification'] });
  const forbiddenFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (forbiddenFromChatQaLoopStop?.decision !== 'block' || !String(forbiddenFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:computer_use_evidence_source`) || !String(forbiddenFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:forbidden_browser_automation_evidence`)) throw new Error('selftest failed: From-Chat-IMG scoped QA-LOOP accepted forbidden browser automation evidence');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), passedFromChatImgQaLoop);
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, from_chat_img_required: true, from_chat_img_request_coverage: true });
  const coveredFromChatStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (coveredFromChatStop?.decision !== 'block' || String(coveredFromChatStop.reason || '').includes('from-chat-img') || !String(coveredFromChatStop.reason || '').includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest failed: valid From-Chat-IMG artifacts did not hand off to session cleanup gate');
  await recordContext7Evidence(routeGateTmp, gateState, { tool_name: 'resolve-library-id', library: 'react' });
  const resolveOnlyStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (resolveOnlyStop?.decision !== 'block') throw new Error('selftest failed: resolve-only Context7 evidence unblocked route');
  await recordContext7Evidence(routeGateTmp, gateState, { tool_name: 'query-docs', library_id: '/facebook/react' });
  const missingCleanupStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingCleanupStop?.decision !== 'block' || !String(missingCleanupStop.reason || '').includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest failed: Team route did not block missing session cleanup gate');
  await writeJsonAtomic(path.join(gateDir, TEAM_SESSION_CLEANUP_ARTIFACT), passedTeamSessionCleanup);
  const missingReflectionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingReflectionStop?.decision !== 'block' || !String(missingReflectionStop.reason || '').includes('reflection')) throw new Error('selftest failed: full route did not block missing reflection gate');
  const missingReflectionNoQuestionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: true });
  if (missingReflectionNoQuestionStop?.decision !== 'block' || !String(missingReflectionNoQuestionStop.reason || '').includes('reflection')) throw new Error('selftest failed: no-question route did not block missing reflection gate');
  await writeTextAtomic(path.join(gateDir, REFLECTION_ARTIFACT), '# Post-Route Reflection\n\nNo issue selftest.\n');
  await writeJsonAtomic(path.join(gateDir, REFLECTION_GATE), { schema_version: 1, passed: true, mission_id: gateId, route: '$Team', reflection_artifact: true, lessons_recorded: false, no_issue_acknowledged: true, triwiki_recorded: false, wiki_refreshed_or_packed: true, wiki_validated: true, created_at: nowIso() });
  const c7Unblocked = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (c7Unblocked?.decision === 'block') throw new Error('selftest failed: full Context7 evidence did not unblock route gate');
  await appendJsonlBounded(path.join(gateDir, 'team-transcript.jsonl'), { ts: new Date(Date.now() + 5000).toISOString(), agent: 'parent_orchestrator', phase: 'IMPLEMENTATION', type: 'status', message: 'work after reflection selftest' });
  const staleReflectionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (staleReflectionStop?.decision !== 'block' || !String(staleReflectionStop.reason || '').includes('work_after_reflection')) throw new Error('selftest failed: post-reflection work did not stale the reflection gate');
  const subagentGateTmp = tmpdir();
  await initProject(subagentGateTmp, {});
  const { id: subagentGateId, dir: subagentGateDir } = await createMission(subagentGateTmp, { mode: 'team', prompt: 'subagent evidence gate test' });
  await writeJsonAtomic(path.join(subagentGateDir, 'team-roster.json'), { schema_version: 1, mission_id: subagentGateId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(subagentGateDir, 'team-gate.json'), passedTeamGate);
  await setCurrent(subagentGateTmp, { mission_id: subagentGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, subagents_required: true, stop_gate: 'team-gate.json' });
  const subagentGateState = await readJson(stateFile(subagentGateTmp), {});
  const missingSubagentStop = await evaluateStop(subagentGateTmp, subagentGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingSubagentStop?.decision !== 'block' || !String(missingSubagentStop.reason || '').includes('subagent')) throw new Error('selftest failed: Stop hook did not block missing subagent evidence');
  await recordSubagentEvidence(subagentGateTmp, subagentGateState, { tool_name: 'spawn_agent', agent_type: 'worker' });
  await writeJsonAtomic(path.join(subagentGateDir, TEAM_SESSION_CLEANUP_ARTIFACT), passedTeamSessionCleanup);
  await writeTextAtomic(path.join(subagentGateDir, REFLECTION_ARTIFACT), '# Post-Route Reflection\n\nNo issue selftest.\n');
  await writeJsonAtomic(path.join(subagentGateDir, REFLECTION_GATE), { schema_version: 1, passed: true, mission_id: subagentGateId, route: '$Team', reflection_artifact: true, lessons_recorded: false, no_issue_acknowledged: true, triwiki_recorded: false, wiki_refreshed_or_packed: true, wiki_validated: true, created_at: nowIso() });
  const subagentUnblocked = await evaluateStop(subagentGateTmp, subagentGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (subagentUnblocked?.decision === 'block') throw new Error('selftest failed: subagent evidence did not unblock route gate');
  const { id: teamId, dir: teamDir } = await createMission(tmp, { mode: 'team', prompt: '병렬 구현 팀 테스트' });
  const teamPlan = buildTeamPlan(teamId, '병렬 구현 팀 테스트');
  await writeJsonAtomic(path.join(teamDir, 'team-plan.json'), teamPlan);
  if (teamPlan.agent_session_count !== 3) throw new Error('selftest failed: team default sessions not 3');
  if (teamPlan.role_counts.executor !== 3 || teamPlan.role_counts.user !== 1 || teamPlan.role_counts.reviewer !== 1) throw new Error('selftest failed: team default role counts invalid');
  if (teamPlan.phases[0]?.id !== 'team_roster_confirmation' || teamPlan.phases[1]?.id !== 'parallel_analysis_scouting' || teamPlan.phases[2]?.id !== 'triwiki_refresh') throw new Error('selftest failed: team plan is not roster-first then scout-first');
  if (teamPlan.roster.debate_team.length !== 3 || !teamPlan.roster.debate_team.some((agent) => agent.id === 'debate_user_1') || !teamPlan.roster.development_team.some((agent) => agent.id === 'executor_3')) throw new Error('selftest failed: team roster missing default agents');
  if (teamPlan.roster.analysis_team.length !== teamPlan.role_counts.executor || !teamPlan.roster.analysis_team.some((agent) => agent.id === 'analysis_scout_3')) throw new Error('selftest failed: team analysis scout roster missing default agents');
  if (!teamPlan.required_artifacts.includes('team-roster.json') || !teamPlan.required_artifacts.includes('team-analysis.md') || !teamPlan.required_artifacts.includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest failed: team plan missing required artifacts');
  if (teamPlan.team_runtime?.graph_artifact !== TEAM_GRAPH_ARTIFACT || !teamPlan.required_artifacts.includes(TEAM_RUNTIME_TASKS_ARTIFACT) || !teamPlan.required_artifacts.includes(TEAM_DECOMPOSITION_ARTIFACT) || !teamPlan.required_artifacts.includes(TEAM_INBOX_DIR)) throw new Error('selftest failed: team plan missing runtime graph metadata/artifacts');
  if (!teamPlan.phases.some((phase) => phase.id === 'runtime_task_graph_compile')) throw new Error('selftest failed: team plan missing runtime task graph compile phase');
  const teamRuntime = await writeTeamRuntimeArtifacts(teamDir, teamPlan, { contractHash: 'selftest' });
  const teamRuntimeValidation = await validateTeamRuntimeArtifacts(teamDir);
  if (!teamRuntimeValidation.ok) throw new Error(`selftest failed: team runtime graph validation failed: ${teamRuntimeValidation.issues.join(', ')}`);
  if (!teamRuntime.runtime.tasks.every((task) => (task.depends_on || []).every((dep) => String(dep).startsWith('task-')))) throw new Error('selftest failed: team runtime graph dependencies are not concrete task ids');
  if (!Object.keys(teamRuntime.inboxes || {}).length || !teamRuntime.report.inboxes.length) throw new Error('selftest failed: team runtime graph did not write worker inboxes');
  if (teamPlan.context_tracking?.ssot !== 'triwiki' || !teamPlan.required_artifacts.includes('.sneakoscope/wiki/context-pack.json')) throw new Error('selftest failed: team plan missing TriWiki context tracking');
  if (!teamPlan.context_tracking?.stage_policy?.includes('before_each_route_stage_read_relevant_context_pack')) throw new Error('selftest failed: team plan missing per-stage TriWiki policy');
  if (!teamPlan.invariants.some((item) => item.includes('chat-history screenshots'))) throw new Error('selftest failed: team invariants missing chat capture matching');
  if (!teamPlan.invariants.some((item) => item.includes('request coverage'))) throw new Error('selftest failed: team invariants missing From-Chat-IMG request coverage');
  if (!teamPlan.phases.some((phase) => String(phase.goal || '').includes('refreshes/validates TriWiki before implementation handoff'))) throw new Error('selftest failed: team plan missing mid-pipeline TriWiki refresh');
  const fromChatTeamPlan = buildTeamPlan(teamId, '$From-Chat-IMG 채팅 기록 이미지와 첨부 원본 이미지로 고객 요청 작업 지시서 작성');
  if (fromChatTeamPlan.prompt_command !== '$From-Chat-IMG') throw new Error('selftest failed: From-Chat-IMG team plan did not preserve prompt command');
  if (!fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_COVERAGE_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG team plan missing coverage ledger artifact');
  if (!fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT) || !fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT) || !fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest failed: From-Chat-IMG team plan missing checklist/temp TriWiki/QA artifacts');
  if (!fromChatTeamPlan.phases.some((phase) => phase.id === 'from_chat_img_coverage_reconciliation')) throw new Error('selftest failed: From-Chat-IMG team plan missing coverage reconciliation phase');
  if (!fromChatTeamPlan.invariants.some((item) => item.includes('unresolved_items=[]'))) throw new Error('selftest failed: From-Chat-IMG team plan missing zero-unresolved invariant');
  if (!fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT)) || !fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT)) || !fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT))) throw new Error('selftest failed: From-Chat-IMG team plan missing checklist/temp TriWiki/QA invariants');
  const teamWorkflow = teamWorkflowMarkdown(teamPlan);
  if (!teamWorkflow.includes('SSOT: triwiki') || !teamWorkflow.includes('Analysis Scouts') || !teamWorkflow.includes('sks wiki validate')) throw new Error('selftest failed: team workflow missing scout-first TriWiki context tracking');
  if (!teamWorkflow.includes(TEAM_GRAPH_ARTIFACT) || !teamWorkflow.includes(TEAM_INBOX_DIR)) throw new Error('selftest failed: team workflow missing runtime graph/inbox guidance');
  if (!teamWorkflow.includes('before every stage') || !teamWorkflow.includes('after findings/artifact changes')) throw new Error('selftest failed: team workflow missing per-stage TriWiki policy');
  const customTeamPlan = buildTeamPlan(teamId, '병렬 구현 팀 테스트', { agentSessions: 5 });
  if (customTeamPlan.agent_session_count !== 5) throw new Error('selftest failed: custom team sessions not honored');
  if (parseTeamCreateArgs(['--agents', '4', '작업']).agentSessions !== 4) throw new Error('selftest failed: team --agents parsing');
  const maxAgentParsed = parseTeamCreateArgs(['--max-agents', '작업']);
  if (maxAgentParsed.agentSessions !== 6 || maxAgentParsed.roleCounts.executor !== 6) throw new Error('selftest failed: team --max-agents parsing');
  const maxTextParsed = parseTeamSpecText('가용가능한 최대 agents로 분석하고 구현');
  if (maxTextParsed.agentSessions !== 6 || maxTextParsed.roleCounts.executor !== 6) throw new Error('selftest failed: team max-agent text parsing');
  const roleParsed = parseTeamCreateArgs(['executor:5', 'reviewer:2', 'user:1', '작업']);
  if (roleParsed.roleCounts.executor !== 5 || roleParsed.roleCounts.reviewer !== 2 || roleParsed.agentSessions !== 5 || roleParsed.prompt !== '작업') throw new Error('selftest failed: team role-count parsing');
  const openWarpFlagParsed = parseTeamCreateArgs(['--open-warp', '작업']);
  if (openWarpFlagParsed.prompt !== '작업') throw new Error('selftest failed: team --open-warp leaked into prompt');
  const roleTeamPlan = buildTeamPlan(teamId, '역할 팀 테스트', { roleCounts: roleParsed.roleCounts });
  if (roleTeamPlan.roster.debate_team.length !== 5) throw new Error('selftest failed: executor role count not reflected in debate team size');
  if (roleTeamPlan.roster.analysis_team.length !== 5) throw new Error('selftest failed: executor role count not reflected in analysis scout team');
  if (roleTeamPlan.roster.development_team.filter((agent) => agent.role === 'executor').length !== 5) throw new Error('selftest failed: executor role count not reflected in development team');
  if (!roleTeamPlan.roster.debate_team.some((agent) => /inconvenience/.test(agent.persona))) throw new Error('selftest failed: user friction persona missing from debate team');
  const warpTeam = await launchWarpTeamView({ root: tmp, missionId: teamId, plan: roleTeamPlan, json: true });
  if (!warpTeam.agents?.length || !warpTeam.agents.some((entry) => entry.agent === 'analysis_scout_1') || !warpTeam.agents.every((entry) => String(entry.command || '').includes('team lane') && String(entry.command || '').includes('--agent'))) throw new Error('selftest failed: Team warp view did not expose agent live lanes');
  if (!warpTeam.overview?.command?.includes('team watch') || !warpTeam.lanes?.some((entry) => entry.role === 'overview') || !warpTeam.lanes?.some((entry) => entry.agent === 'analysis_scout_1')) throw new Error('selftest failed: Team warp view did not expose orchestration overview plus agent lanes');
  if (teamLaneStyle('analysis_scout_1').role !== 'scout' || teamLaneStyle('executor_1').role !== 'execution' || teamLaneStyle('reviewer_1').role !== 'review') throw new Error('selftest failed: Team warp role palette did not classify lane roles');
  if (!String(warpTeam.cleanup_policy || '').includes('mark-complete') || !warpTeam.lanes.every((entry) => entry.style?.color && entry.title)) throw new Error('selftest failed: Team warp view did not expose color/title metadata and cleanup policy');
  if (!warpTeam.launch_uri?.includes(encodeURIComponent(`sks-team-${teamId}.yaml`))) throw new Error('selftest failed: Team warp launch URI is not named for visibility');
  if (routeReasoning(routePrompt('$Research frontier idea'), '$Research frontier idea').effort !== 'xhigh') throw new Error('selftest failed: research reasoning not xhigh');
  if (routeReasoning(routePrompt('$From-Chat-IMG 채팅 이미지 작업'), '$From-Chat-IMG 채팅 이미지 작업').effort !== 'xhigh') throw new Error('selftest failed: From-Chat-IMG reasoning not xhigh');
  if (routeReasoning(routePrompt('$Computer-Use localhost UI smoke'), '$Computer-Use localhost UI smoke').effort !== 'low') throw new Error('selftest failed: Computer Use fast lane reasoning not low');
  if (routeReasoning(routePrompt('$DB migration'), '$DB migration').effort !== 'high') throw new Error('selftest failed: logical reasoning not high');
  const lowReasoning = routeReasoning({ id: 'LowSmoke', reasoningPolicy: 'low' }, 'small metadata read');
  if (lowReasoning.effort !== 'low' || lowReasoning.profile !== 'sks-task-low') throw new Error('selftest failed: low reasoning did not route to sks-task-low');
  const forensicEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-IMG', route: 'from-chat-img', prompt: '$From-Chat-IMG screenshot match' });
  if (forensicEffort.selected_effort !== 'forensic_vision' || !validateEffortDecision(forensicEffort).ok) throw new Error('selftest failed: From-Chat-IMG effort did not select forensic_vision');
  const lowEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-LOW', is_deterministic: true, has_verified_skill: true });
  if (lowEffort.selected_effort !== 'low') throw new Error('selftest failed: deterministic verified skill did not select low effort');
  const recoveryEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-RECOVERY', failure_count: 2 });
  if (recoveryEffort.selected_effort !== 'recovery') throw new Error('selftest failed: repeated failure did not select recovery effort');
  const invalidLedger = createWorkOrderLedger({ missionId: 'selftest', route: 'team', sourcesComplete: true, requests: [{ verbatim: 'do it', status: 'verified' }] });
  if (validateWorkOrderLedger(invalidLedger).ok) throw new Error('selftest failed: work-order ledger accepted verified item without evidence');
  const validLedger = createWorkOrderLedger({ missionId: 'selftest', route: 'team', sourcesComplete: true, requests: [{ verbatim: 'do it', implementation_tasks: ['TASK-001'], status: 'verified', implementation_evidence: ['file:src/core/routes.mjs'], verification_evidence: ['selftest'] }] });
  if (!validateWorkOrderLedger(validLedger).ok) throw new Error('selftest failed: valid work-order ledger rejected');
  const unresolvedVisualMap = buildFromChatImgVisualMap({ missionId: 'selftest', sources: [{ id: 'chat-img-1', type: 'chat_image', relevant: true, accounted_for: true }], regions: [{ image_id: 'chat-img-1', region_id: 'R01', status: 'uncertain' }] });
  if (validateFromChatImgVisualMap(unresolvedVisualMap).ok) throw new Error('selftest failed: unresolved From-Chat-IMG visual region accepted');
  const validVisualMap = buildFromChatImgVisualMap({ missionId: 'selftest', sources: [{ id: 'chat-img-1', type: 'chat_image', relevant: true, accounted_for: true }], regions: [{ image_id: 'chat-img-1', region_id: 'R01', observed_detail: 'button', matched_customer_request_ids: ['REQ-001'], confidence: 0.9, status: 'mapped' }] });
  if (!validateFromChatImgVisualMap(validVisualMap).ok) throw new Error('selftest failed: valid From-Chat-IMG visual map rejected');
  const dogfoodBlocked = createDogfoodReport({ scenario: 'selftest', computer_use_available: false, browser_available: false, cycles: 1, findings: [classifyDogfoodFinding({ id: 'DF-001', classification: 'fixable', description: 'broken' })], post_fix_verification_complete: false });
  if (validateDogfoodReport(dogfoodBlocked).ok) throw new Error('selftest failed: dogfood report accepted unresolved fixable finding');
  const dogfoodPassed = createDogfoodReport({ scenario: 'selftest', computer_use_available: true, browser_available: true, cycles: 2, findings: [classifyDogfoodFinding({ id: 'DF-001', classification: 'fixable', description: 'fixed', post_fix_verification: 'passed' })], post_fix_verification_complete: true });
  if (!validateDogfoodReport(dogfoodPassed).ok) throw new Error('selftest failed: dogfood report rejected post-fix verification');
  const skillCandidate = createSkillCandidate({ id: 'skill.from-chat-img.visual-work-order.v1', status: 'active', triggers: ['$From-Chat-IMG'], successful_runs: 3, files: ['.agents/skills/from-chat-img/SKILL.md'] });
  if (!validateSkillCandidate(skillCandidate).ok) throw new Error('selftest failed: active skill candidate rejected');
  const injection = decideSkillInjection({ route: 'from-chat-img', task_signature: 'reference images', skills: [skillCandidate, { ...skillCandidate, id: 'deprecated', status: 'deprecated' }] });
  if (!validateSkillInjectionDecision(injection).ok || injection.injected.length !== 1) throw new Error('selftest failed: skill injection did not respect active/top-K filtering');
  const promptContext = buildPromptContext({ stable: ['stable'], policies: ['policy'], dynamic: ['dynamic'] });
  if (promptContext.blocks[0]?.cache_region !== 'stable_prefix' || promptContext.blocks.at(-1)?.cache_region !== 'dynamic_suffix') throw new Error('selftest failed: prompt context did not place dynamic context last');
  const repeatedMistake = await recordMistake(teamDir, { route: 'from-chat-img', gate: 'visual-map', reason: 'unmatched-reference' });
  const repeatedMistake2 = await recordMistake(teamDir, { route: 'from-chat-img', gate: 'visual-map', reason: 'unmatched-reference' });
  if (!repeatedMistake.ledger.entries.length || !repeatedMistake2.ledger.entries[0].prevention) throw new Error('selftest failed: repeated mistake did not attach prevention');
  if (routeReasoning(routePrompt('$DFix button label'), '$DFix button label').effort !== 'medium') throw new Error('selftest failed: simple reasoning not medium');
  if (routePrompt('이 파이프라인은 왜 이렇게 동작해?')?.id !== 'Answer') throw new Error('selftest failed: question prompt did not route to Answer');
  if (routePrompt('React useEffect 최신 문서 기준으로 설명해줘')?.id !== 'Answer') throw new Error('selftest failed: docs question did not route to Answer');
  if (routePrompt('질문을 하더라도 진짜 질문인지 아니면 질문형태를 띄는 암묵적인 지시인지를 반드시 파악해야해')?.id !== 'Team') throw new Error('selftest failed: question-shaped directive did not route to Team');
  if (routePrompt('근데 왜 팀원 구성을 안하고 작업을 하는 경우가 이렇게 많지?')?.id !== 'Team') throw new Error('selftest failed: question-shaped Team complaint did not route to Team');
  if (routePrompt('$DF button label')) throw new Error('selftest failed: deprecated $DF route still resolved');
  if (routePrompt('implement feature')?.id !== 'Team') throw new Error('selftest failed: implementation prompt did not default to Team');
  if (routePrompt('$SKS implement feature')?.id !== 'Team') throw new Error('selftest failed: $SKS implementation prompt did not promote to Team');
  if (routePrompt('$From-Chat-IMG 채팅 기록 이미지와 첨부 이미지로 고객사 요청 수정 작업 수행해줘')?.id !== 'Team') throw new Error('selftest failed: explicit chat capture client work did not promote to Team');
  if (routePrompt('$Computer-Use localhost 화면 빠르게 검증해줘')?.id !== 'ComputerUse') throw new Error('selftest failed: $Computer-Use did not route to ComputerUse fast lane');
  if (routePrompt('$CU localhost 화면 빠르게 검증해줘')?.id !== 'ComputerUse') throw new Error('selftest failed: $CU did not route to ComputerUse fast lane');
  if (routePrompt('computer use 사용하는 파이프라인은 마지막에 triwiki honest mode만 실행되게 조정해줘')?.id !== 'ComputerUse') throw new Error('selftest failed: Computer Use pipeline request was misrouted away from fast lane');
  if (routePrompt('triwiki나 honest mode가 마지막에만 실행되게 computer use 파이프라인 조정해줘')?.id !== 'ComputerUse') throw new Error('selftest failed: Computer Use directive was hijacked by Wiki route');
  if (routePrompt('$SKS show me available workflows')?.id !== 'SKS') throw new Error('selftest failed: $SKS workflow discovery should remain SKS');
  if (routeRequiresSubagents(routePrompt('이 파이프라인은 왜 이렇게 동작해?'), '이 파이프라인은 왜 이렇게 동작해?')) throw new Error('selftest failed: Answer route requires subagents');
  if (!routeRequiresSubagents(routePrompt('implement feature'), 'implement feature')) throw new Error('selftest failed: default Team implementation route does not require subagents');
  if (!routeRequiresSubagents(routePrompt('$Team implement feature'), '$Team implement feature')) throw new Error('selftest failed: Team route does not require subagents');
  if (routeRequiresSubagents(routePrompt('$Computer-Use localhost UI smoke'), '$Computer-Use localhost UI smoke')) throw new Error('selftest failed: Computer Use fast lane requires subagents');
  if (!routeRequiresSubagents(routePrompt('$Goal implement feature'), '$Goal implement feature')) throw new Error('selftest failed: Goal implementation route does not require subagents');
  if (routeRequiresSubagents(routePrompt('$Help commands'), '$Help commands')) throw new Error('selftest failed: Help route incorrectly requires subagents');
  if (!reflectionRequiredForRoute(routePrompt('$Team implement feature'))) throw new Error('selftest failed: Team route does not require reflection');
  if (reflectionRequiredForRoute(routePrompt('$Computer-Use localhost UI smoke'))) throw new Error('selftest failed: Computer Use fast lane requires full-route reflection');
  if (!reflectionRequiredForRoute(routePrompt('$DB migration'))) throw new Error('selftest failed: DB route does not require reflection');
  if (reflectionRequiredForRoute(routePrompt('$DFix button label'))) throw new Error('selftest failed: DFix route incorrectly requires reflection');
  if (reflectionRequiredForRoute(routePrompt('이 파이프라인은 왜 이렇게 동작해?'))) throw new Error('selftest failed: Answer route incorrectly requires reflection');
  if (!teamPlan.phases.some((phase) => phase.id === 'parallel_implementation')) throw new Error('selftest failed: team plan missing implementation phase');
  await initTeamLive(teamId, teamDir, '병렬 구현 팀 테스트', { roleCounts: roleParsed.roleCounts });
  await appendTeamEvent(teamDir, { agent: 'analysis_scout_1', phase: 'parallel_analysis_scouting', message: 'selftest mapped repo slice' });
  await appendTeamEvent(teamDir, { agent: 'team_consensus', phase: 'planning_debate', message: 'selftest mapped options' });
  const teamDashboard = await readTeamDashboard(teamDir);
  if (teamDashboard?.agent_session_count !== 5 || teamDashboard?.role_counts?.executor !== 5) throw new Error('selftest failed: team dashboard session/role budget missing');
  await writeTeamDashboardState(teamDir, { missionId: teamId, mission: { id: teamId, mode: 'team' }, effort: 'high', phase: 'verification' });
  const teamDashboardState = await readJson(path.join(teamDir, ARTIFACT_FILES.team_dashboard_state), {});
  if (!validateTeamDashboardState(teamDashboardState).ok || !renderTeamDashboardState(teamDashboardState).includes('Mission / Goal View')) throw new Error('selftest failed: Team dashboard state missing required cockpit panes');
  if (teamDashboard?.context_tracking?.ssot !== 'triwiki') throw new Error('selftest failed: team dashboard missing TriWiki context tracking');
  if (!teamDashboard?.phases?.includes('parallel_analysis_scouting')) throw new Error('selftest failed: team dashboard missing analysis scout phase');
  if (!teamDashboard?.latest_messages?.some((entry) => entry.agent === 'analysis_scout_1')) throw new Error('selftest failed: team live dashboard missing analysis scout event');
  if (!teamDashboard?.latest_messages?.some((entry) => entry.agent === 'team_consensus')) throw new Error('selftest failed: team live dashboard missing agent event');
  const teamLive = await readTeamLive(teamDir);
  if (!teamLive.includes('Analysis scouts') || !teamLive.includes('selftest mapped repo slice')) throw new Error('selftest failed: team live transcript missing analysis scout section/event');
  if (!teamLive.includes('selftest mapped options')) throw new Error('selftest failed: team live transcript missing event');
  if (!teamLive.includes('Context tracking SSOT: TriWiki')) throw new Error('selftest failed: team live transcript missing TriWiki context tracking');
  if (!(await readTeamTranscriptTail(teamDir, 1)).join('\n').includes('selftest mapped options')) throw new Error('selftest failed: team transcript tail missing event');
  const teamLane = await renderTeamAgentLane(teamDir, { missionId: teamId, agent: 'analysis_scout_1', lines: 4 });
  if (!teamLane.includes('SKS Team Agent Lane') || !teamLane.includes('analysis_scout_1') || !teamLane.includes('selftest mapped repo slice')) throw new Error('selftest failed: team agent lane missing agent event context');
  const teamLaneCli = await runProcess(process.execPath, [hookBin, 'team', 'lane', teamId, '--agent', 'analysis_scout_1', '--lines', '4'], { cwd: tmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (teamLaneCli.code !== 0 || !String(teamLaneCli.stdout || '').includes('SKS Team Agent Lane') || !String(teamLaneCli.stdout || '').includes('analysis_scout_1')) throw new Error('selftest failed: sks team lane CLI did not render an agent lane');
  await writeTextAtomic(path.join(teamDir, 'team-analysis.md'), '- claim: analysis scout mapped route registry | source: src/core/routes.mjs | risk: high | confidence: supported\n');
  const installUxSchema = buildQuestionSchema('SKS first install/bootstrap UX and Context7 MCP setup improvement');
  const installUxSlotIds = installUxSchema.slots.map((s) => s.id);
  if (installUxSchema.domain_hints.includes('uiux') || installUxSlotIds.includes('VISUAL_REGRESSION_REQUIRED')) throw new Error('selftest failed: CLI UX install prompt should not ask visual UI questions');
  if (installUxSlotIds.some((id) => /^(D|SUPA)/.test(id) && id !== 'DEPENDENCY_CHANGE_ALLOWED')) throw new Error('selftest failed: non-data MCP setup prompt asked guarded slots');
  if (installUxSlotIds.includes('MID_RUN_UNKNOWN_POLICY')) throw new Error('selftest failed: no-question fallback ladder should be inferred, not asked');
  const { id, dir, mission } = await createMission(tmp, { mode: 'goal', prompt: '로그인 세션 만료 UX 개선 supabase db' });
  const schema = buildQuestionSchema(mission.prompt);
  await writeQuestions(dir, schema);
  if (validateAnswers(schema, {}).ok) throw new Error('selftest failed: empty answers valid');
  const answers = {};
  for (const s of schema.slots) answers[s.id] = s.options ? (s.type === 'array' ? [s.options[0]] : s.options[0]) : (s.type.includes('array') ? ['selftest'] : (s.id === 'DB_MAX_BLAST_RADIUS' ? 'no_live_dml' : 'selftest'));
  await writeJsonAtomic(path.join(dir, 'answers.json'), answers);
  const sealed = await sealContract(dir, mission);
  if (!sealed.ok) throw new Error('selftest failed: answers rejected');
  await setCurrent(tmp, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_RUNNING_NO_QUESTIONS' });
  if (!containsUserQuestion('확인해 주세요?')) throw new Error('selftest failed: question guard');
  if (classifySql('drop table users;').level !== 'destructive') throw new Error('selftest failed: destructive sql not detected');
  if (classifyCommand('supabase db reset').level !== 'destructive') throw new Error('selftest failed: supabase db reset not detected');
  const dbDecision = await checkDbOperation(tmp, { mission_id: id }, { tool_name: 'mcp__supabase__execute_sql', sql: 'drop table users;' }, { duringNoQuestion: true });
  if (dbDecision.action !== 'block') throw new Error('selftest failed: destructive MCP SQL allowed');
  const madMission = await createMission(tmp, { mode: 'mad-sks', prompt: '$MAD-SKS selftest scoped DB override' });
  await writeJsonAtomic(path.join(madMission.dir, 'team-gate.json'), { schema_version: 1, passed: false, team_roster_confirmed: true });
  const madState = { mission_id: madMission.id, mode: 'TEAM', route_command: '$Team', stop_gate: 'team-gate.json', mad_sks_active: true, mad_sks_modifier: true, mad_sks_gate_file: 'team-gate.json' };
  const columnCleanupSql = 'alter table users ' + 'dr' + 'op column legacy_name;';
  const madColumnCleanupDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: columnCleanupSql }, { duringNoQuestion: false });
  if (madColumnCleanupDecision.action !== 'allow') throw new Error('selftest failed: MAD-SKS column cleanup was not allowed');
  const tableRemovalSql = 'dr' + 'op table users;';
  const madTableRemovalDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: tableRemovalSql }, { duringNoQuestion: false });
  if (madTableRemovalDecision.action !== 'block') throw new Error('selftest failed: MAD-SKS catastrophic table removal was not blocked');
  const allRowsSql = 'de' + 'lete from users;';
  const madAllRowsDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: allRowsSql }, { duringNoQuestion: false });
  if (madAllRowsDecision.action !== 'block') throw new Error('selftest failed: MAD-SKS all-row DML was not blocked');
  await writeJsonAtomic(path.join(madMission.dir, 'team-gate.json'), { schema_version: 1, passed: true, team_roster_confirmed: true, permissions_deactivated: true });
  const madClosedDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: columnCleanupSql }, { duringNoQuestion: false });
  if (madClosedDecision.action !== 'block') throw new Error('selftest failed: MAD-SKS permission persisted after gate close');
  const nonDbDecision = await checkDbOperation(tmp, {}, { command: 'npm test' }, { duringNoQuestion: true });
  if (nonDbDecision.action !== 'allow') throw new Error('selftest failed: non-DB command blocked by DB guard');
  const evalReport = runEvaluationBenchmark({ iterations: 5 });
  if (!evalReport.comparison.meaningful_improvement) throw new Error('selftest failed: evaluation benchmark did not show meaningful improvement');
  if (!evalReport.candidate.wiki?.valid) throw new Error('selftest failed: wiki coordinate index invalid in eval');
  if (evalReport.candidate.wiki?.voxel_schema !== 'sks.wiki-voxel.v1' || evalReport.candidate.wiki?.voxel_rows < 1) throw new Error('selftest failed: eval did not include voxel overlay metrics');
  const harnessReport = harnessGrowthReport({});
  if (!harnessReport.forgetting.fixture.passed || !harnessReport.warp.views.includes('Harness Experiments View') || !harnessReport.reliability.tool_error_taxonomy.includes('Unknown')) throw new Error('selftest failed: harness growth fixture incomplete');
  const proofField = await proofFieldFixture();
  if (!proofField.validation.ok || !validateProofFieldReport(proofField.report).ok) throw new Error('selftest failed: proof field report invalid');
  if (!proofField.checks.route_cone_selected || !proofField.checks.cli_cone_selected || !proofField.checks.catastrophic_guard_present || !proofField.checks.negative_release_work_recorded) throw new Error('selftest failed: proof field fixture checks incomplete');
  const workflowPerf = await runWorkflowPerfBench(tmp, {
    iterations: 2,
    intent: 'small CLI help surface update',
    changedFiles: ['src/cli/maintenance-commands.mjs', 'src/core/routes.mjs']
  });
  if (!validateWorkflowPerfReport(workflowPerf).ok || workflowPerf.metrics.decision_mode !== 'fast_lane' || !workflowPerf.metrics.fast_lane_eligible) throw new Error('selftest failed: workflow perf proof field did not produce a valid fast lane report');
  if (classifyToolError({ message: 'operation timed out' }) !== 'Timeout' || classifyToolError({ message: 'unclassified weirdness' }) !== 'Unknown') throw new Error('selftest failed: tool error taxonomy classification');
  const coord = rgbaToWikiCoord({ r: 12, g: 34, b: 56, a: 255 });
  if (coord.schema !== 'sks.wiki-coordinate.v1' || coord.xyzw.length !== 4) throw new Error('selftest failed: RGBA wiki coordinate conversion');
  await writeTextAtomic(path.join(tmp, '.sneakoscope', 'memory', 'q2_facts', 'selftest.md'), '- claim: Selftest memory claim must be selected before lower-weight mission notes. | id: selftest-memory-priority | source: src/cli/main.mjs | risk: high | status: supported | evidence_count: 3 | required_weight: 1.0 | trust_score: 0.9\n');
  await createMission(tmp, { mode: 'sks', prompt: '모호한 질문은 그만 물어봐야지;; triwiki로 예측해' });
  await createMission(tmp, { mode: 'sks', prompt: 'triwiki에서 자주 요청하는 것들은 카운팅해서 더 우선 참고해줘' });
  const wikiPack = contextCapsule({
    mission: { id: 'selftest-wiki', coord: { rgba: { r: 48, g: 132, b: 212, a: 240 } } },
    role: 'verifier',
    claims: await projectWikiClaims(tmp),
    q4: { mode: 'selftest' },
    q3: ['sks', 'llm-wiki', 'wiki-coordinate'],
    budget: { maxWikiAnchors: 48, includeTrustSummary: true }
  });
  const wikiValidation = validateWikiCoordinateIndex(wikiPack.wiki);
  if (!wikiValidation.ok) throw new Error('selftest failed: wiki coordinate pack invalid');
  if (wikiPack.wiki.vx?.s !== 'sks.wiki-voxel.v1' || wikiVoxelRowCount(wikiPack.wiki) < 1) throw new Error('selftest failed: wiki voxel overlay missing');
  const legacyWiki = { ...wikiPack.wiki };
  delete legacyWiki.vx;
  const legacyValidation = validateWikiCoordinateIndex(legacyWiki);
  if (legacyValidation.ok || !legacyValidation.issues.some((issue) => issue.id === 'vx_missing')) throw new Error('selftest failed: legacy coordinate-only wiki pack was accepted');
  if (!wikiPack.trust_summary || !Number.isFinite(Number(wikiPack.trust_summary.needs_evidence))) throw new Error('selftest failed: wiki trust summary missing');
  if (wikiPack.attention?.mode !== 'aggressive_triwiki_active_recall' || !wikiPack.attention.use_first?.length || !wikiPack.attention.hydrate_first?.length) throw new Error('selftest failed: wiki active attention ranking missing');
  if (!wikiPack.attention.use_first.every((row) => Array.isArray(row) && row[0] && row[1] && row[2])) throw new Error('selftest failed: wiki attention use_first rows are not hydratable anchors');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-aggressive-active-recall')) throw new Error('selftest failed: aggressive TriWiki attention claim missing from pack');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => Array.isArray(anchor) ? Number.isFinite(Number(anchor[9])) : Number.isFinite(Number(anchor.trust_score)))) throw new Error('selftest failed: wiki anchor trust score missing');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => (Array.isArray(anchor) ? anchor[0] : anchor.id) === 'wiki-trig')) throw new Error('selftest failed: wiki trig anchor missing');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => String(Array.isArray(anchor) ? anchor[0] : anchor.id).startsWith('team-analysis-'))) throw new Error('selftest failed: team analysis claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => String(claim.id).startsWith('user-request-frequency-'))) throw new Error('selftest failed: repeated user request frequency claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => String(claim.id).startsWith('user-strong-feedback-'))) throw new Error('selftest failed: strong user feedback claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'selftest-memory-priority')) throw new Error('selftest failed: memory required_weight claim was not selected in TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-stack-current-docs-policy')) throw new Error('selftest failed: stack current-docs policy claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-stack-current-docs-vercel-duration')) throw new Error('selftest failed: Vercel duration current-docs claim missing from TriWiki pack');
  const dryRunPack = await writeWikiContextPack(tmp, ['--max-anchors', '4'], { dryRun: true });
  if (wikiVoxelRowCount(dryRunPack.pack.wiki) !== 4) throw new Error('selftest failed: dry-run wiki pack did not build voxel rows');
  if (await exists(dryRunPack.file)) throw new Error('selftest failed: wiki refresh dry-run wrote context pack');
  await ensureDir(path.dirname(dryRunPack.file));
  await writeJsonAtomic(path.join(path.dirname(dryRunPack.file), 'low-trust-artifact.json'), { trust_summary: { avg: 0.1 }, wiki: { anchors: [] } });
  const wikiPruneDryRun = await pruneWikiArtifacts(tmp, { dryRun: true });
  if (wikiPruneDryRun.candidates < 1 || !wikiPruneDryRun.actions.some((action) => action.reason === 'low_wiki_trust')) throw new Error('selftest failed: wiki prune did not flag low-trust artifact');
  const { dir: researchDir, mission: researchMission } = await createMission(tmp, { mode: 'research', prompt: '새로운 코드 리뷰 방법론 연구' });
  const researchPlan = await writeResearchPlan(researchDir, researchMission.prompt, {});
  const researchGate = await writeMockResearchResult(researchDir, researchPlan);
  if (!researchGate.passed) throw new Error('selftest failed: mock research gate did not pass');
  await writeJsonAtomic(path.join(dir, 'done-gate.json'), { passed: true, unsupported_critical_claims: 0, database_safety_violation: false, database_safety_reviewed: true, visual_drift: 'low', wiki_drift: 'low', tests_required: false });
  const gate = await evaluateDoneGate(tmp, id);
  if (!gate.passed) throw new Error('selftest failed: done gate');
  const gxDir = path.join(tmp, '.sneakoscope', 'gx', 'cartridges', 'selftest');
  await writeJsonAtomic(path.join(gxDir, 'vgraph.json'), defaultVGraph('selftest'));
  await writeJsonAtomic(path.join(gxDir, 'beta.json'), defaultBeta('selftest'));
  const render = await renderCartridge(gxDir, { format: 'all' });
  if (!render.outputs.includes('render.svg')) throw new Error('selftest failed: gx svg not rendered');
  const validation = await validateCartridge(gxDir);
  if (!validation.ok) throw new Error('selftest failed: gx validation rejected');
  if (!validateWikiCoordinateIndex(validation.wiki_coordinates).ok) throw new Error('selftest failed: gx wiki coordinate validation rejected');
  const drift = await driftCartridge(gxDir);
  if (drift.status !== 'low') throw new Error('selftest failed: gx drift is high');
  const snapshot = await snapshotCartridge(gxDir);
  if (!snapshot.files.svg || !snapshot.files.html) throw new Error('selftest failed: gx snapshot incomplete');
  if (!validateWikiCoordinateIndex(snapshot.wiki_coordinates).ok) throw new Error('selftest failed: gx snapshot wiki coordinates invalid');
  const { dir: oldFromChatTempDir } = await createMission(tmp, { mode: 'team', prompt: '$From-Chat-IMG old temp TriWiki retention selftest' });
  await writeJsonAtomic(path.join(oldFromChatTempDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), { schema_version: 1, scope: 'temporary', storage: 'triwiki', expires_after_sessions: 1, claims: [{ id: 'req-1', text: 'old temporary claim' }] });
  const oldMtime = new Date(Date.now() - 60 * 1000);
  await fsp.utimes(oldFromChatTempDir, oldMtime, oldMtime);
  await createMission(tmp, { mode: 'team', prompt: 'newer mission for temp TriWiki retention selftest' });
  const gc = await enforceRetention(tmp, { dryRun: true });
  if (!gc.report.exists) throw new Error('selftest failed: storage report');
  if (!gc.actions.some((action) => action.action === 'remove_from_chat_img_temp_triwiki')) throw new Error('selftest failed: From-Chat-IMG temporary TriWiki retention action missing');
  console.log('ㅅㅋㅅ selftest passed.');
  console.log(`temp: ${tmp}`);
}
