import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot, readJson, writeJsonAtomic, writeTextAtomic, appendJsonlBounded, nowIso, exists, ensureDir, tmpdir, packageRoot, dirSize, formatBytes, which, runProcess, PACKAGE_VERSION, sksRoot, globalSksRoot, findProjectRoot, readStdin } from '../core/fsx.mjs';
import { assertCodexWarningSuppressed as assertCodexWarn, hasDeprecatedCodexHooksFeatureFlag, hasTopLevelCodexModeLock, initProject, installSkills, missingGeneratedCodexAppFeatureFlags, normalizeInstallScope, sksCommandPrefix } from '../core/init.mjs';
import { buildCodexExecArgs, getCodexInfo, runCodexExec } from '../core/codex-adapter.mjs';
import { createMission, loadMission, findLatestMission, missionDir, setCurrent, stateFile } from '../core/mission.mjs';
import { buildQuestionSchema, writeQuestions } from '../core/questions.mjs';
import { sealContract, validateAnswers } from '../core/decision-contract.mjs';
import { buildQaLoopQuestionSchema, buildQaLoopPrompt, defaultQaGate, evaluateQaGate, isQaReportFilename, qaStatus, writeMockQaResult, writeQaLoopArtifacts } from '../core/qa-loop.mjs';
import { containsUserQuestion, noQuestionContinuationReason } from '../core/no-question-guard.mjs';
import { evaluateDoneGate, defaultDoneGate } from '../core/hproof.mjs';
import { emitHook, selftestCodexCommitHooks } from '../core/hooks-runtime.mjs';
import { storageReport, enforceRetention, pruneWikiArtifacts } from '../core/retention.mjs';
import { classifySql, classifyCommand, classifyToolPayload, checkDbOperation, handleMadSksUserConfirmation, loadDbSafetyPolicy, scanDbSafety } from '../core/db-safety.mjs';
import { checkHarnessModification, harnessGuardStatus, isHarnessSourceProject } from '../core/harness-guard.mjs';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.mjs';
import { context7Docs, context7Resolve, context7Text, context7Tools } from '../core/context7-client.mjs';
import { bumpProjectVersion, disableVersionGitHook, runVersionPreCommit, versioningStatus } from '../core/version-manager.mjs';
import { rustInfo } from '../core/rust-accelerator.mjs';
import { renderCartridge, validateCartridge, driftCartridge, snapshotCartridge } from '../core/gx-renderer.mjs';
import { defaultEvaluationScenario, runEvaluationBenchmark } from '../core/evaluation.mjs';
import { buildResearchPrompt, evaluateResearchGate, isDatedResearchPaperArtifact, writeMockResearchResult, writeResearchPlan } from '../core/research.mjs';
import { evaluateRecallPulseFixtures, readMissionStatusLedger, writeRecallPulseArtifacts } from '../core/recallpulse.mjs';
import {
  PPT_AUDIENCE_STRATEGY_ARTIFACT,
  PPT_CLEANUP_REPORT_ARTIFACT,
  PPT_FACT_LEDGER_ARTIFACT,
  PPT_GATE_ARTIFACT,
  PPT_HTML_ARTIFACT,
  PPT_IMAGE_ASSET_LEDGER_ARTIFACT,
  PPT_ITERATION_REPORT_ARTIFACT,
  PPT_PARALLEL_REPORT_ARTIFACT,
  PPT_PDF_ARTIFACT,
  PPT_REVIEW_LEDGER_ARTIFACT,
  PPT_REVIEW_POLICY_ARTIFACT,
  PPT_RENDER_REPORT_ARTIFACT,
  PPT_SOURCE_HTML_DIR,
  PPT_TEMP_DIR,
  writePptBuildArtifacts,
  writePptRouteArtifacts
} from '../core/ppt.mjs';
import {
  IMAGE_UX_REVIEW_GATE_ARTIFACT,
  IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT,
  IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT,
  IMAGE_UX_REVIEW_POLICY_ARTIFACT,
  IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT,
  writeImageUxReviewRouteArtifacts
} from '../core/image-ux-review.mjs';
import { contextCapsule } from '../core/triwiki-attention.mjs';
import { rgbaKey, rgbaToWikiCoord, validateWikiCoordinateIndex } from '../core/wiki-coordinate.mjs';
import { ALLOWED_REASONING_EFFORTS, AWESOME_DESIGN_MD_REFERENCE, CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_COMPUTER_USE_EVIDENCE_SOURCE, CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_IMAGEGEN_REQUIRED_POLICY, COMMAND_CATALOG, DESIGN_SYSTEM_SSOT, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS, DOLLAR_SKILL_NAMES, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_SOURCE_INVENTORY_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, FROM_CHAT_IMG_VISUAL_MAP_ARTIFACT, FROM_CHAT_IMG_WORK_ORDER_ARTIFACT, GETDESIGN_REFERENCE, PPT_PIPELINE_SKILL_ALLOWLIST, RECOMMENDED_SKILLS, ROUTES, USAGE_TOPICS, context7ConfigToml, hasContext7ConfigText, hasFromChatImgSignal, looksLikeAnswerOnlyRequest, noUnrequestedFallbackCodePolicyText, reflectionRequiredForRoute, reasoningInstruction, routePrompt, routeReasoning, routeRequiresSubagents, speedLanePolicyText, stackCurrentDocsPolicy, stripVisibleDecisionAnswerBlocks, triwikiContextTracking } from '../core/routes.mjs';
import { PIPELINE_PLAN_ARTIFACT, buildPipelinePlan, context7Evidence, evaluateStop, projectGateStatus, recordContext7Evidence, recordSubagentEvidence, validatePipelinePlan, writePipelinePlan } from '../core/pipeline.mjs';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, validateTeamRuntimeArtifacts, writeTeamRuntimeArtifacts } from '../core/team-dag.mjs';
import { appendTeamEvent, initTeamLive, parseTeamSpecText, readTeamDashboard, readTeamLive, readTeamTranscriptTail, renderTeamAgentLane, renderTeamWatch } from '../core/team-live.mjs';
import { evaluateTeamReviewPolicyGate } from '../core/team-review-policy.mjs';
import { ARTIFACT_FILES, validateDogfoodReport, validateEffortDecision, validateFromChatImgVisualMap, validateSkillCandidate, validateSkillInjectionDecision, validateTeamDashboardState, validateWorkOrderLedger } from '../core/artifact-schemas.mjs';
import { selectEffort, writeEffortDecision } from '../core/effort-orchestrator.mjs';
import { createWorkOrderLedger } from '../core/work-order-ledger.mjs';
import { buildFromChatImgVisualMap } from '../core/from-chat-img-forensics.mjs';
import { classifyDogfoodFinding, createDogfoodReport, writeDogfoodReport } from '../core/dogfood-loop.mjs';
import { createSkillCandidate, decideSkillInjection, skillDreamFixture, writeSkillCandidate, writeSkillForgeReport, writeSkillInjectionDecision } from '../core/skill-forge.mjs';
import { classifyToolError, harnessGrowthReport } from '../core/evaluation.mjs';
import { runWorkflowPerfBench, validateWorkflowPerfReport } from '../core/perf-bench.mjs';
import { buildProofField, proofFieldFixture, validateProofFieldReport } from '../core/proof-field.mjs';
import { permissionGateSummary } from '../core/permission-gates.mjs';
import { recordMistake, writeMistakeMemoryReport } from '../core/mistake-memory.mjs';
import { MISTAKE_RECALL_ARTIFACT, contractConsumesMistakeRecall } from '../core/mistake-recall.mjs';
import { buildPromptContext } from '../core/prompt-context-builder.mjs';
import { renderTeamDashboardState, writeTeamDashboardState } from '../core/team-dashboard-renderer.mjs';
import { GOAL_WORKFLOW_ARTIFACT } from '../core/goal-workflow.mjs';
import { CODEX_APP_DOCS_URL, codexAppIntegrationStatus, formatCodexAppStatus } from '../core/codex-app.mjs';
import { codexAppRemoteControlCommand } from './codex-app-command.mjs';
import { OPENCLAW_SKILL_NAME, installOpenClawSkill } from '../core/openclaw.mjs';
import { buildTmuxLaunchPlan, buildTmuxOpenArgs, codexLaunchCommand, createTmuxSession, defaultCodexLaunchArgs, isTmuxShellSession, runTmuxLaunchPlanSyntaxCheck, shouldAutoAttachTmux, sksAsciiLogo, tmuxReadiness, tmuxStatusKind, defaultTmuxSessionName, formatTmuxBanner, launchMadTmuxUi, launchTmuxTeamView, launchTmuxUi, platformTmuxInstallHint, reconcileTmuxTeamCockpit, runTmuxStatus, sanitizeTmuxSessionName, sweepCodexLbTmuxSessions, sweepTmuxTeamSurfaces, teamLaneStyle } from '../core/tmux-ui.mjs';
import { autoReviewProfileName, autoReviewStatus, autoReviewSummary, enableAutoReview, disableAutoReview, enableMadHighProfile, madHighProfileName } from '../core/auto-review.mjs';
import { context7Command } from './context7-command.mjs';
import { askPostinstallQuestion, checkCodexLbResponseChain, checkContext7, checkRequiredSkills, codexLbChatgptBackupPath, codexLbStatus, configureCodexLb, ensureCodexCliTool, ensureGlobalCodexFastModeDuringInstall, ensureGlobalCodexSkillsDuringInstall, ensureProjectContext7Config, ensureRelatedCliTools, ensureSksCommandDuringInstall, ensureTmuxCliTool, globalCodexSkillsRoot, maybePromptCodexLbSetupForLaunch, maybePromptCodexUpdateForLaunch, postinstall, postinstallBootstrapDecision, releaseCodexLbAuthHold, repairCodexLbAuth, selftestCodexLb, shouldAutoApproveInstall, unselectCodexLbProvider } from './install-helpers.mjs';
import { buildTeamPlan, codeStructureCommand, dbCommand, defaultBeta, defaultVGraph, evalCommand, gcCommand, goalCommand, gxCommand, harnessCommand, hproofCommand, madHighCommand as runMadHighCommand, memoryCommand, migrateWikiContextPack, parseTeamCreateArgs, perfCommand, profileCommand, projectWikiClaims, proofFieldCommand, qaLoopCommand, quickstartCommand, researchCommand, skillDreamCommand, statsCommand, team, teamWorkflowMarkdown, validateArtifactsCommand, wikiCommand, wikiVoxelRowCount, writeWikiContextPack } from './maintenance-commands.mjs';
import { openClawCommand } from './openclaw-command.mjs';
import { recallPulseCommand } from './recallpulse-command.mjs';

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
  if (isMadHighLaunch(args)) return runMadHighCommand(args, { maybePromptSksUpdateForLaunch, maybePromptCodexUpdateForLaunch, ensureMadLaunchDependencies, printDepsInstallAction, maybePromptCodexLbSetupForLaunch, packageVersion: PACKAGE_VERSION });
  if (isAutoReviewFlag(args[0])) return autoReviewCommand('start', args.slice(1));
  const [cmd, sub, ...rest] = args;
  const tail = sub === undefined ? [] : [sub, ...rest];
  if (!cmd) return defaultTmuxCommand();
  if (cmd === '--help' || cmd === '-h') return help();
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') return version();
  if (cmd === 'tmux') return !sub || String(sub).startsWith('--') ? tmuxCommand('check', tail) : tmuxCommand(sub, rest);
  if (cmd === 'auto-review' || cmd === 'autoreview') return autoReviewCommand(sub, rest);
  if (cmd === 'dollar-commands' || cmd === 'dollars' || cmd === '$') return dollarCommands(tail);
  if (String(cmd).toLowerCase() === 'dfix') return dfixHelp();
  const handlers = {
    postinstall: () => postinstall({ bootstrap }), wizard: () => wizard(tail), ui: () => wizard(tail), 'update-check': () => updateCheck(tail), help: () => help(tail), commands: () => commands(tail), usage: () => usage(tail), root: () => rootCommand(tail), quickstart: () => quickstartCommand(), 'codex-app': () => codexAppHelp(tail), 'codex-lb': () => codexLbCommand(sub, rest), auth: () => codexLbCommand(sub, rest), openclaw: () => openClawCommand(tail), bootstrap: () => bootstrap(tail), deps: () => deps(sub, rest),
    'qa-loop': () => qaLoopCommand(sub, rest), ppt: () => pptCommand(sub, rest), 'image-ux-review': () => imageUxReviewCommand(sub, rest), 'ux-review': () => imageUxReviewCommand(sub, rest), 'visual-review': () => imageUxReviewCommand(sub, rest), 'ui-ux-review': () => imageUxReviewCommand(sub, rest), context7: () => context7Command(sub, rest), recallpulse: () => recallPulseCommand(sub, rest), pipeline: () => pipeline(sub, rest), guard: () => guard(sub, rest), conflicts: () => conflicts(sub, rest), versioning: () => versioning(sub, rest), reasoning: () => reasoningCommand(tail), aliases: () => aliases(), setup: () => setup(tail), 'fix-path': () => fixPath(tail), doctor: () => doctor(tail), init: () => init(tail), selftest: () => selftest(tail),
    goal: () => goalCommand(sub, rest), research: () => researchCommand(sub, rest), hook: () => emitHook(sub), profile: () => profileCommand(sub, rest), hproof: () => hproofCommand(sub, rest), 'validate-artifacts': () => validateArtifactsCommand(tail), perf: () => perfCommand(sub, rest), 'proof-field': () => proofFieldCommand(sub, rest), 'skill-dream': () => skillDreamCommand(sub, rest), 'code-structure': () => codeStructureCommand(sub, rest), memory: () => memoryCommand(sub, rest), gx: () => gxCommand(sub, rest),
    team: () => team(tail), db: () => dbCommand(sub, rest), eval: () => evalCommand(sub, rest), harness: () => harnessCommand(sub, rest), wiki: () => wikiCommand(sub, rest), gc: () => gcCommand(tail), stats: () => statsCommand(tail)
  };
  if (handlers[cmd]) return handlers[cmd]();
  console.error(`Unknown command: ${cmd}`);
  process.exitCode = 1;
}

async function defaultTmuxCommand(args = []) {
  const update = await maybePromptSksUpdateForLaunch(args, { label: 'default tmux launch' });
  if (update.status === 'updated') {
    console.log(`SKS updated from ${PACKAGE_VERSION} to ${update.latest}. Rerun: sks`);
    return;
  }
  if (update.status === 'failed') {
    console.error(`SKS update failed: ${update.error}`);
    process.exitCode = 1;
    return;
  }
  const codexUpdate = await maybePromptCodexUpdateForLaunch(args, { label: 'default tmux launch' });
  if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
    console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
    process.exitCode = 1;
    return;
  }
  const lb = await maybePromptCodexLbSetupForLaunch(args);
  if (lb.status === 'missing_api_key') {
    process.exitCode = 1;
    return;
  }
  return launchTmuxUi(args, codexLbImmediateLaunchOpts(args, lb, { conciseBlockers: true }));
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

function help(args = []) {
  const topic = args[0];
  if (topic) return usage([topic]);
  console.log(`${sksAsciiLogo()}

Usage:
  sks
  sks help [topic]
  sks version
  sks update-check [--json]
  sks wizard
  sks commands [--json]
  sks usage [${USAGE_TOPICS}]
  sks root [--json]
  sks quickstart
  sks bootstrap [--install-scope global|project] [--local-only] [--json]
  sks deps check|install [tmux|codex|context7|all] [--yes] [--json]
  sks codex-app
  sks codex-lb status|health|repair|release|unselect|setup --host <domain> --api-key <key>
  sks auth status|health|repair|release|unselect|setup --host <domain> --api-key <key>
  sks openclaw install|path|print [--dir path] [--force] [--json]
  sks --mad [--high]
  sks auto-review status|enable|start [--high]
  sks --Auto-review [--high]
  sks tmux open [--workspace name]
  sks tmux status [--once]
  sks dollar-commands [--json]
  sks dfix
  sks qa-loop prepare "target"
  sks qa-loop answer <mission-id|latest> <answers.json>
  sks qa-loop run <mission-id|latest> [--mock] [--max-cycles N]
  sks qa-loop status <mission-id|latest>
  sks ppt build <mission-id|latest> [--json]
  sks ppt status <mission-id|latest> [--json]
  sks context7 check|setup|tools|resolve|docs|evidence ...
  sks recallpulse run|status|eval|governance|checklist <mission-id|latest>
  sks pipeline status|resume|plan [--json] [--proof-field]
  sks pipeline answer <mission-id|latest> <answers.json|--stdin|--text "...">
  sks guard check [--json]
  sks conflicts check|prompt [--json]
  sks versioning status|bump|disable [--json]
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
  sks team "task" [executor:5 reviewer:6 user:1] [--json]
  sks team log|tail|watch|lane|status|dashboard|open-tmux|attach-tmux [mission-id|latest]
  sks team event [mission-id|latest] --agent <name> --phase <phase> --message "..."
  sks team message [mission-id|latest] --from <agent> --to <agent|all> --message "..."
  sks team open-tmux [mission-id|latest] [--no-attach|--separate-session]
  sks team attach-tmux [mission-id|latest]
  sks team cleanup-tmux [mission-id|latest]
  sks research prepare "topic" [--depth frontier]
  sks research run <mission-id|latest> [--mock] [--max-cycles N] [--cycle-timeout-minutes N]
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
  sks skill-dream status|run|record [--json]
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

async function wizard(args = []) {
  if (!shouldShowWizard() && !flag(args, '--force')) return help();
  const rl = readline.createInterface({ input, output });
  try {
    console.log(`${sksAsciiLogo()}\nSetup UI\n`);
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
          console.log('  npm i -g sneakoscope@latest\n');
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
  console.log(`${sksAsciiLogo()}\nUpdate Check`);
  console.log(`Current: ${result.current}`);
  console.log(`Latest:  ${result.latest || 'unknown'}`);
  console.log(`Update:  ${result.update_available ? 'available' : 'not needed'}`);
  if (result.error) console.log(`Error:   ${result.error}`);
  if (result.update_available) console.log('Run:     npm i -g sneakoscope@latest');
}

const DOLLAR_DEFAULT_PIPELINE_TEXT = 'Default pipeline: direct answers -> $Answer, tiny Direct Fix edits -> $DFix, presentation/PDF artifacts -> $PPT, image-generation UI/UX reviews -> $Image-UX-Review/$UX-Review, Computer Use UI/browser speed work -> $Computer-Use, code -> $Team. Execution routes infer their contract from prompt, TriWiki/current-code defaults, and conservative policy instead of surfacing prequestion sheets. Use $From-Chat-IMG only for chat screenshot plus original attachments. Use $MAD-SKS only as an explicit scoped DB authorization modifier that can be combined with another $ route. No route may invent unrequested fallback implementation code.';

function commands(args = []) {
  if (flag(args, '--json')) return console.log(JSON.stringify({ aliases: ['sks', 'sneakoscope'], dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES, commands: COMMAND_CATALOG }, null, 2));
  console.log(`${sksAsciiLogo()}\nCommands\n`);
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
  console.log(`${sksAsciiLogo()}\nRoot\n`);
  console.log(`Mode:        ${result.mode}`);
  console.log(`Active root: ${active}`);
  console.log(`Project:     ${project || 'none'}`);
  console.log(`Global root: ${global}`);
  if (!project) console.log('\nNo project marker was found here, so SKS will use the per-user global runtime root. Run `sks bootstrap` to initialize the current directory as a project.');
}

function dollarCommands(args = []) {
  if (flag(args, '--json')) return console.log(JSON.stringify({ dollar_commands: DOLLAR_COMMANDS, app_skill_aliases: DOLLAR_COMMAND_ALIASES }, null, 2));
  console.log(`${sksAsciiLogo()}\n$ Commands\n`);
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
  console.log(`SKS Direct Fix Mode

Prompt command:
  $DFix <tiny direct fix request>

Examples:
  $DFix 글자 색 파란색으로 바꿔줘
  $DFix 내용을 영어로 바꿔줘
  $DFix Change the CTA label to "Start"
  $DFix Fix the README typo
  $DFix Update the package version

Purpose:
  Fast tiny direct edits only. Direct Fix bypasses the general SKS prompt pipeline and uses an ultralight, no-record task list.

Rules:
  List the exact micro-edits, inspect only needed files, apply only those edits.
  Do not run mission state, ambiguity gates, TriWiki/TriFix/reflection/state recording, Context7 routing, subagents, Goal, Research, eval, or broad redesign.
  Run only cheap verification when useful.
  Start the final answer with "DFix 완료 요약:" and include one "DFix 솔직모드:" line for verified, not verified, and remaining issues.
`);
}

async function pptCommand(sub = 'status', args = []) {
  const root = await sksRoot();
  const action = sub || 'status';
  const missionArg = args.find((arg) => !String(arg).startsWith('--')) || 'latest';
  const id = await resolveMissionId(root, missionArg);
  if (!id) throw new Error('Usage: sks ppt build|status <mission-id|latest> [--json]');
  const { dir } = await loadMission(root, id);
  if (action === 'build') {
    const contract = await readJson(path.join(dir, 'decision-contract.json'), null);
    if (!contract) throw new Error(`PPT build requires a sealed decision-contract.json for ${id}`);
    const result = await writePptBuildArtifacts(dir, contract);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'ppt.build.completed', ok: result.ok, files: result.files });
    if (flag(args, '--json')) return console.log(JSON.stringify({ ok: result.ok, mission_id: id, files: result.files, gate: result.gate, report: result.report }, null, 2));
    console.log('SKS PPT build\n');
    console.log(`Mission: ${id}`);
    console.log(`HTML:    ${path.relative(root, result.files.html)}`);
    console.log(`PDF:     ${path.relative(root, result.files.pdf)}`);
    console.log(`Facts:   ${path.relative(root, result.files.fact_ledger)}`);
    console.log(`Images:  ${path.relative(root, result.files.image_asset_ledger)}`);
    console.log(`Review:  ${path.relative(root, result.files.review_ledger)}`);
    console.log(`Loop:    ${path.relative(root, result.files.iteration_report)}`);
    console.log(`Report:  ${path.relative(root, result.files.render_report)}`);
    console.log(`Cleanup: ${path.relative(root, result.files.cleanup_report)}`);
    console.log(`Parallel:${' '.repeat(1)}${path.relative(root, result.files.parallel_report)}`);
    console.log(`Gate:    ${result.ok ? 'passed' : 'blocked'} (${path.relative(root, result.files.gate)})`);
    return;
  }
  if (action === 'status') {
    const gate = await readJson(path.join(dir, PPT_GATE_ARTIFACT), null);
    const report = await readJson(path.join(dir, PPT_RENDER_REPORT_ARTIFACT), null);
    const status = {
      ok: Boolean(gate?.passed),
      mission_id: id,
      gate,
      report,
      files: {
        html: path.join(dir, PPT_HTML_ARTIFACT),
        source_html: path.join(dir, PPT_HTML_ARTIFACT),
        pdf: path.join(dir, PPT_PDF_ARTIFACT),
        fact_ledger: path.join(dir, PPT_FACT_LEDGER_ARTIFACT),
        image_asset_ledger: path.join(dir, PPT_IMAGE_ASSET_LEDGER_ARTIFACT),
        review_policy: path.join(dir, PPT_REVIEW_POLICY_ARTIFACT),
        review_ledger: path.join(dir, PPT_REVIEW_LEDGER_ARTIFACT),
        iteration_report: path.join(dir, PPT_ITERATION_REPORT_ARTIFACT),
        render_report: path.join(dir, PPT_RENDER_REPORT_ARTIFACT),
        cleanup_report: path.join(dir, PPT_CLEANUP_REPORT_ARTIFACT),
        parallel_report: path.join(dir, PPT_PARALLEL_REPORT_ARTIFACT),
        gate: path.join(dir, PPT_GATE_ARTIFACT)
      }
    };
    if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
    console.log('SKS PPT status\n');
    console.log(`Mission: ${id}`);
    console.log(`Gate:    ${status.ok ? 'passed' : 'not passed'}`);
    console.log(`HTML:    ${path.relative(root, status.files.html)}`);
    console.log(`PDF:     ${path.relative(root, status.files.pdf)}`);
    console.log(`Facts:   ${path.relative(root, status.files.fact_ledger)}`);
    console.log(`Images:  ${path.relative(root, status.files.image_asset_ledger)}`);
    console.log(`Review:  ${path.relative(root, status.files.review_ledger)}`);
    console.log(`Loop:    ${path.relative(root, status.files.iteration_report)}`);
    console.log(`Report:  ${path.relative(root, status.files.render_report)}`);
    console.log(`Cleanup: ${path.relative(root, status.files.cleanup_report)}`);
    console.log(`Parallel:${' '.repeat(1)}${path.relative(root, status.files.parallel_report)}`);
    return;
  }
  throw new Error(`Unknown ppt command: ${action}`);
}

async function imageUxReviewCommand(sub = 'status', args = []) {
  const root = await sksRoot();
  const action = sub || 'status';
  if (action === 'help' || action === '--help' || action === '-h') {
    console.log(`SKS Image UX Review

Prompt commands:
  $Image-UX-Review <target>
  $UX-Review <target>

Inspect artifacts:
  sks image-ux-review status latest --json

Core loop:
  source UI screenshot -> $imagegen/gpt-image-2 generated annotated review image -> image-ux-issue-ledger.json -> optional requested fixes -> changed-screen recheck
`);
    return;
  }
  if (action !== 'status') throw new Error(`Unknown image-ux-review command: ${action}`);
  const missionArg = args.find((arg) => !String(arg).startsWith('--')) || 'latest';
  const id = await resolveMissionId(root, missionArg);
  if (!id) throw new Error('Usage: sks image-ux-review status <mission-id|latest> [--json]');
  const { dir } = await loadMission(root, id);
  const gate = await readJson(path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT), null);
  const policy = await readJson(path.join(dir, IMAGE_UX_REVIEW_POLICY_ARTIFACT), null);
  const inventory = await readJson(path.join(dir, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT), null);
  const generatedReviewLedger = await readJson(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), null);
  const issueLedger = await readJson(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), null);
  const iterationReport = await readJson(path.join(dir, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT), null);
  const status = {
    ok: Boolean(gate?.passed),
    mission_id: id,
    gate,
    policy,
    inventory,
    generated_review_ledger: generatedReviewLedger,
    issue_ledger: issueLedger,
    iteration_report: iterationReport,
    files: {
      policy: path.join(dir, IMAGE_UX_REVIEW_POLICY_ARTIFACT),
      inventory: path.join(dir, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT),
      generated_review_ledger: path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT),
      issue_ledger: path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT),
      iteration_report: path.join(dir, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT),
      gate: path.join(dir, IMAGE_UX_REVIEW_GATE_ARTIFACT)
    }
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(status, null, 2));
  console.log('SKS Image UX Review status\n');
  console.log(`Mission: ${id}`);
  console.log(`Gate:    ${status.ok ? 'passed' : 'not passed'}`);
  console.log(`Policy:  ${path.relative(root, status.files.policy)}`);
  console.log(`Screens: ${path.relative(root, status.files.inventory)}`);
  console.log(`Images:  ${path.relative(root, status.files.generated_review_ledger)}`);
  console.log(`Issues:  ${path.relative(root, status.files.issue_ledger)}`);
  console.log(`Loop:    ${path.relative(root, status.files.iteration_report)}`);
  console.log(`Gate:    ${path.relative(root, status.files.gate)}`);
  if (gate?.blockers?.length) console.log(`Blockers:${' '.repeat(1)}${gate.blockers.join(', ')}`);
}

async function pipeline(sub = 'status', args = []) {
  const root = await sksRoot();
  const action = sub || 'status';
  if (action === 'answer') return pipelineAnswer(root, args);
  if (action === 'plan') return pipelinePlan(root, args);
  const state = await readJson(stateFile(root), {});
  const evidence = await context7Evidence(root, state);
  const plan = state.mission_id ? await readJson(path.join(missionDir(root, state.mission_id), PIPELINE_PLAN_ARTIFACT), null) : null;
  const gateProjection = await projectGateStatus(root, state);
  const stop = await evaluateStop(root, state, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  const result = {
    root,
    state,
    context7: evidence,
    gate_projection: gateProjection,
    plan: plan ? pipelinePlanSummary(plan, root, state.mission_id) : null,
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
  if (plan) {
    console.log(`Plan:      ${path.relative(root, path.join(missionDir(root, state.mission_id), PIPELINE_PLAN_ARTIFACT))}`);
    console.log(`Lane:      ${plan.runtime_lane?.lane || 'unknown'} (${plan.runtime_lane?.source || 'unknown'})`);
    console.log(`Stages:    keep ${plan.stage_summary?.kept ?? '?'} / skip ${plan.stage_summary?.skipped ?? '?'}`);
  }
  console.log(`Reasoning: ${state.reasoning_effort || 'medium'}${state.reasoning_profile ? ` (${state.reasoning_profile})` : ''}${state.reasoning_temporary ? ' temporary' : ''}`);
  console.log(`Stop gate: ${state.stop_gate || 'none'}`);
  console.log(`Gate projection: ${gateProjection.ok ? 'ok' : `blocked (${gateProjection.blockers.join(', ')})`}`);
  console.log(`Context7:  ${state.context7_required ? (evidence.ok ? 'ok' : 'required-missing') : 'optional'} (${evidence.count || 0} event(s))`);
  console.log(`Next:      ${result.next_action}`);
}

async function pipelinePlan(root, args = []) {
  const state = await readJson(stateFile(root), {});
  const missionArg = pipelineMissionArg(args);
  const id = await resolveMissionId(root, missionArg);
  let dir = null;
  let mission = {};
  let routeContext = {};
  if (id) {
    const loaded = await loadMission(root, id);
    dir = loaded.dir;
    mission = loaded.mission || {};
    routeContext = await readJson(path.join(dir, 'route-context.json'), {});
    const existing = await readJson(path.join(dir, PIPELINE_PLAN_ARTIFACT), null);
    if (existing && !flag(args, '--refresh') && !flag(args, '--proof-field')) {
      if (flag(args, '--json')) return console.log(JSON.stringify({ ok: validatePipelinePlan(existing).ok, plan_path: path.join(dir, PIPELINE_PLAN_ARTIFACT), plan: existing }, null, 2));
      return printPipelinePlan(root, id, existing);
    }
  }
  const intent = readOption(args, '--intent', routeContext.task || mission.prompt || state.prompt || '');
  const route = ROUTES.find((candidate) => candidate.id === routeContext.route || candidate.command === routeContext.command || candidate.id === state.route || candidate.command === state.route_command)
    || routePrompt(routeContext.command || state.route_command || intent || '$SKS');
  const changedRaw = readOption(args, '--changed', '');
  const proofField = flag(args, '--proof-field') ? await buildProofField(root, { intent, changedFiles: changedRaw ? changedRaw.split(',') : undefined }) : null;
  const contract = dir ? await readJson(path.join(dir, 'decision-contract.json'), {}) : {};
  const contractSealed = contract?.status === 'sealed' || Boolean(contract?.sealed_at || contract?.sealed_hash);
  const ambiguity = {
    required: Boolean(routeContext.clarification_gate || state.ambiguity_gate_required || contractSealed),
    passed: Boolean(state.ambiguity_gate_passed || state.clarification_passed || contractSealed),
    status: state.clarification_required ? 'awaiting_answers' : ((state.ambiguity_gate_passed || contractSealed) ? 'contract_sealed' : undefined),
    contract_hash: contract?.sealed_hash || null
  };
  const planInput = { missionId: id || null, route, task: intent, required: Boolean(routeContext.context7_required || state.context7_required), ambiguity, proofField };
  const plan = dir ? await writePipelinePlan(dir, planInput) : buildPipelinePlan(planInput);
  const validation = validatePipelinePlan(plan);
  if (flag(args, '--json')) return console.log(JSON.stringify({ ok: validation.ok, validation, plan_path: dir ? path.join(dir, PIPELINE_PLAN_ARTIFACT) : null, plan }, null, 2));
  printPipelinePlan(root, id || 'none', plan);
}

function pipelineMissionArg(args = []) {
  const valueFlags = new Set(['--intent', '--changed']);
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    if (valueFlags.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('--')) return arg;
  }
  return 'latest';
}

function pipelinePlanSummary(plan, root, id) {
  return {
    path: id ? path.join(missionDir(root, id), PIPELINE_PLAN_ARTIFACT) : null,
    validation: validatePipelinePlan(plan),
    lane: plan.runtime_lane?.lane || null,
    source: plan.runtime_lane?.source || null,
    kept: plan.stage_summary?.kept ?? null,
    skipped: plan.stage_summary?.skipped ?? null,
    next_actions: plan.next_actions || []
  };
}

function printPipelinePlan(root, id, plan) {
  const validation = validatePipelinePlan(plan);
  console.log('SKS Pipeline Plan\n');
  console.log(`Mission:   ${id}`);
  console.log(`Route:     ${plan.route?.command || plan.route?.id || 'unknown'}`);
  console.log(`Lane:      ${plan.runtime_lane?.lane || 'unknown'} (${plan.runtime_lane?.source || 'unknown'})`);
  console.log(`Valid:     ${validation.ok ? 'yes' : `no (${validation.issues.join(', ')})`}`);
  if (id && id !== 'none') console.log(`Artifact:  ${path.relative(root, path.join(missionDir(root, id), PIPELINE_PLAN_ARTIFACT))}`);
  console.log(`Stages:    keep ${plan.stage_summary?.kept ?? 0}, skip ${plan.stage_summary?.skipped ?? 0}, n/a ${plan.stage_summary?.not_applicable ?? 0}`);
  console.log(`Verify:    ${(plan.verification || []).join('; ')}`);
  console.log(`Next:      ${(plan.next_actions || []).join(' -> ')}`);
}

async function pipelineAnswer(root, args = []) {
  const [missionArg, answerFile] = args;
  const id = await resolveMissionId(root, missionArg);
  if (!id || !answerFile) throw new Error('Usage: sks pipeline answer <mission-id|latest> <answers.json|--stdin|--text "...">');
  const { dir, mission } = await loadMission(root, id);
  const schema = await readJson(path.join(dir, 'required-answers.schema.json'));
  const answers = answerFile === '--stdin'
    ? parseAnswersText(schema, await readStdin())
    : answerFile === '--text'
      ? parseAnswersText(schema, args.slice(2).join(' '))
      : await readJson(path.resolve(answerFile));
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
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: materialized.prompt || routeContext.task || mission.prompt || '', required: Boolean(routeContext.context7_required), ambiguity: { required: true, passed: true, status: 'contract_sealed', contract_hash: result.contract.sealed_hash } });
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
    pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok,
    pipeline_plan_path: PIPELINE_PLAN_ARTIFACT,
    reasoning_effort: route ? routeReasoning(route, routeContext.task || mission.prompt || '').effort : 'medium',
    reasoning_profile: route ? routeReasoning(route, routeContext.task || mission.prompt || '').profile : 'sks-task-medium',
    reasoning_temporary: true,
    prompt: materialized.prompt || routeContext.task || mission.prompt || '',
    ...materialized.state
  });
  if (flag(args, '--json')) return console.log(JSON.stringify({ ok: true, mission_id: id, route: route?.id || routeContext.route, hash: result.contract.sealed_hash, validation: result.validation, pipeline_plan: path.join(dir, PIPELINE_PLAN_ARTIFACT) }, null, 2));
  console.log(`SKS ambiguity gate passed for ${id}`);
  console.log(`Route: ${route?.command || routeContext.command || '$SKS'}`);
  console.log(`Hash: ${result.contract.sealed_hash}`);
  console.log(`Plan: ${path.relative(root, path.join(dir, PIPELINE_PLAN_ARTIFACT))}`);
  console.log('Next: continue the original route lifecycle using decision-contract.json.');
}

function parseAnswersText(schema = {}, text = '') {
  const body = String(text || '').trim();
  const slots = Array.isArray(schema.slots) ? schema.slots : [];
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const answers = {};
  let currentId = null;
  let currentLines = [];
  const flush = () => {
    if (!currentId) return;
    answers[currentId] = normalizeTextAnswerValue(slotById.get(currentId), currentLines.join('\n').trim());
    currentId = null;
    currentLines = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]{2,})\s*[:：]\s*(.*)$/);
    if (match && slotById.has(match[1])) {
      flush();
      currentId = match[1];
      currentLines = [match[2] || ''];
      continue;
    }
    if (currentId) currentLines.push(line);
  }
  flush();
  if (!Object.keys(answers).length && slots.length === 1 && body) {
    answers[slots[0].id] = normalizeTextAnswerValue(slots[0], body.replace(new RegExp(`^\\s*${slots[0].id}\\s*`, 'i'), '').trim());
  }
  return answers;
}

function normalizeTextAnswerValue(slot = {}, raw = '') {
  const value = String(raw || '').trim();
  if (slot.type === 'array') {
    return value.split(/\r?\n|,/).map((x) => x.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
  }
  if (slot.type === 'array_or_string') {
    const bulletLines = value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (bulletLines.length > 1 && bulletLines.every((line) => /^[-*]\s+/.test(line))) return bulletLines.map((line) => line.replace(/^[-*]\s+/, '').trim());
  }
  return value;
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
      normal_db_writes_allowed: true,
      live_server_writes_allowed: true,
      migration_apply_allowed: true,
      catastrophic_safety_guard_active: true,
      permission_profile: permissionGateSummary(),
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
        normal_db_writes_allowed: true,
        live_server_writes_allowed: true,
        migration_apply_allowed: true,
        catastrophic_safety_guard_active: true
      }
    };
  }
  if (route?.id === 'PPT') {
    await writePptRouteArtifacts(dir, contract);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
      ts: nowIso(),
      type: 'ppt.materialized_after_ambiguity_gate',
      route: route.id,
      audience_strategy_artifact: PPT_AUDIENCE_STRATEGY_ARTIFACT,
      gate: PPT_GATE_ARTIFACT
    });
    return {
      phase: 'PPT_AUDIENCE_STRATEGY_READY',
      prompt: routeContext.task || mission.prompt || '',
      state: {
        ppt_audience_strategy_ready: true,
        ppt_gate_ready: true,
        ...madSksState
      }
    };
  }
  if (route?.id === 'ImageUXReview') {
    await writeImageUxReviewRouteArtifacts(dir, contract);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
      ts: nowIso(),
      type: 'image_ux_review.materialized',
      route: route.id,
      gate: IMAGE_UX_REVIEW_GATE_ARTIFACT,
      generated_review_ledger: IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT
    });
    return {
      phase: 'IMAGE_UX_REVIEW_READY',
      prompt: routeContext.task || mission.prompt || '',
      state: {
        image_ux_review_gate_ready: true,
        image_ux_review_policy_ready: true,
        ...madSksState
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
    normal_db_writes_allowed: true,
    live_server_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
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
    normal_db_writes_allowed: true,
    live_server_writes_allowed: true,
    migration_apply_allowed: true,
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
    if (status.runtime_drift?.checked) {
      const drift = status.runtime_drift;
      console.log(`Runtime:   ${drift.runtime_version || 'unknown'} (${drift.relation || 'unknown'})`);
      if (!drift.ok) console.log(`Warning:   source package is ${drift.package_version}, but bare sks resolves to ${drift.runtime_version}. Use node ./bin/sks.mjs in this repo or reinstall/update the global package before trusting runtime behavior.`);
    }
    if (!status.ok) console.log('Run: sks doctor --fix');
    return;
  }
  if (action === 'hook' || action === 'install-hook' || action === 'enable') {
    const res = await disableVersionGitHook(root);
    const blocked = { ...res, ok: false, installed: false, reason: 'pre_commit_hooks_unsupported' };
    process.exitCode = 2;
    if (flag(args, '--json')) return console.log(JSON.stringify(blocked, null, 2));
    console.error('SKS no longer installs Git pre-commit hooks. Use `sks versioning bump` and release checks explicitly.');
    if (res.hook_removed) console.error(`Removed existing SKS version hook: ${res.hook_path}`);
    return;
  }
  if (action === 'disable' || action === 'off' || action === 'remove-hook' || action === 'unhook') {
    const res = await disableVersionGitHook(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    console.log(res.hook_removed ? `Version hook removed: ${res.hook_path}` : `Version hook disabled: ${res.reason || 'policy updated'}`);
    return;
  }
  if (action === 'bump') {
    const res = await bumpProjectVersion(root, { force: true });
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
    console.log(res.changed ? `SKS versioning synced: ${res.version}` : `SKS versioning: ${res.version} verified`);
    return;
  }
  console.error('Usage: sks versioning status|bump|disable [--json]');
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

async function tmuxCommand(sub = 'start', args = []) {
  const action = sub || 'start';
  if (action === 'status' || action === 'banner') {
    if (flag(args, '--json')) {
      const status = await codexAppIntegrationStatus();
      return console.log(JSON.stringify(status, null, 2));
    }
    await runTmuxStatus(action === 'banner' ? ['--once', ...args] : args);
    return;
  }
  if (action === 'check') {
    const root = await sksRoot();
    const plan = await buildTmuxLaunchPlan({ root, session: readOption(args, '--session', null) });
    if (flag(args, '--json')) return console.log(JSON.stringify(plan, null, 2));
    console.log(formatTmuxBanner(plan.app));
    console.log('');
    console.log(`tmux:      ${plan.tmux.ok ? 'ok' : 'missing'} ${plan.tmux.version || ''}`.trim());
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
    const codexUpdate = await maybePromptCodexUpdateForLaunch(args, { label: 'tmux launch' });
    if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
      console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
      process.exitCode = 1;
      return;
    }
    const lb = await maybePromptCodexLbSetupForLaunch(args);
    if (lb.status === 'missing_api_key') {
      process.exitCode = 1;
      return;
    }
    const result = await launchTmuxUi(args, codexLbImmediateLaunchOpts(args, lb));
    if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error('Usage: sks tmux open|start|check|status|banner [--workspace name]');
  process.exitCode = 1;
}

async function codexLbCommand(action = 'status', args = []) {
  const sub = action || 'status';
  const json = flag(args, '--json');
  if (sub === 'status' || sub === 'check') {
    const status = await codexLbStatus();
    const backupPath = codexLbChatgptBackupPath();
    const backupPresent = await exists(backupPath);
    if (json) return console.log(JSON.stringify({ ...status, chatgpt_backup_present: backupPresent, chatgpt_backup_path: backupPath }, null, 2));
    console.log('SKS codex-lb\n');
    console.log(`Configured: ${status.ok ? 'yes' : 'no'}`);
    console.log(`Selected:   ${status.selected ? 'yes' : 'no'}`);
    console.log(`Provider:   ${status.provider_configured ? 'yes' : 'no'}`);
    console.log(`Codex App auth: ${status.provider_requires_openai_auth ? 'yes' : 'missing'}`);
    console.log(`Env file:   ${status.env_file ? status.env_path : 'missing'}`);
    if (status.base_url) console.log(`Base URL:   ${status.base_url}`);
    console.log(`ChatGPT backup: ${backupPresent ? `yes (${backupPath})` : 'no'}`);
    if (status.ok && !status.selected) console.log('\nRun: sks codex-lb repair to activate codex-lb for Codex App.');
    else if (!status.ok && status.base_url && status.env_key_configured) console.log('\nRun: sks codex-lb repair to restore the upstream codex-lb provider block.');
    else if (!status.ok) console.log('\nRun: sks codex-lb setup --host <domain> --api-key <key>');
    else console.log('\nRepair provider auth: sks codex-lb repair');
    if (backupPresent) console.log('Switch back to ChatGPT OAuth login: sks codex-lb release');
    return;
  }
  if (sub === 'release') {
    const result = await releaseCodexLbAuthHold({
      keepProvider: flag(args, '--keep-provider'),
      deleteBackup: flag(args, '--delete-backup'),
      force: flag(args, '--force')
    });
    if (result.status === 'no_backup' || result.status === 'auth_in_use' || result.status === 'failed') process.exitCode = 1;
    if (json) return console.log(JSON.stringify(result, null, 2));
    if (result.status === 'released') {
      console.log('codex-lb auth released: ChatGPT OAuth blob restored.');
      console.log(`Auth:   ${result.auth_path}`);
      console.log(`Backup: ${result.backup_removed ? 'removed' : result.backup_path}`);
      console.log(`Provider unselected: ${result.provider_unselected ? 'yes' : 'no'}`);
      if (result.provider_error) console.log(`Provider unselect warning: ${result.provider_error}`);
      console.log('\nLaunch Codex App / `codex` and complete the ChatGPT browser login if prompted.');
      return;
    }
    if (result.status === 'already_chatgpt') {
      console.log('codex-lb auth release: auth.json already carries ChatGPT OAuth tokens — nothing to restore.');
      console.log(`Auth:   ${result.auth_path}`);
      console.log(`Backup: ${result.backup_path}`);
      console.log(`Provider unselected: ${result.provider_unselected ? 'yes' : 'no'}`);
      if (result.provider_error) console.log(`Provider unselect warning: ${result.provider_error}`);
      return;
    }
    if (result.status === 'no_backup') {
      console.error(`codex-lb auth release: no ChatGPT OAuth backup found at ${result.backup_path}.`);
      if (result.reason === 'backup_not_oauth') console.error('The backup file is present but does not contain a ChatGPT OAuth token blob — refusing to clobber auth.json.');
      else console.error('Run `sks codex-lb repair` after a fresh ChatGPT login to recreate a backup, or `sks codex-lb unselect` to leave codex-lb off without touching auth.json.');
      process.exitCode = 1;
      return;
    }
    if (result.status === 'auth_in_use') {
      console.error(`codex-lb auth release refused: ${result.auth_path} does not look like the codex-lb apikey shape. Re-run with --force to overwrite, or back up auth.json yourself first.`);
      process.exitCode = 1;
      return;
    }
    console.error(`codex-lb auth release failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    process.exitCode = 1;
    return;
  }
  if (sub === 'unselect') {
    const result = await unselectCodexLbProvider();
    if (result.status === 'failed') process.exitCode = 1;
    if (json) return console.log(JSON.stringify(result, null, 2));
    if (result.status === 'unselected') {
      console.log('codex-lb unselected. Codex CLI/App will fall back to the default OpenAI provider.');
      console.log(`Config: ${result.config_path}`);
      console.log('Re-engage codex-lb with: sks codex-lb repair');
      return;
    }
    if (result.status === 'not_selected') {
      console.log('codex-lb is not selected — nothing to do.');
      return;
    }
    console.error(`codex-lb unselect failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
    process.exitCode = 1;
    return;
  }
  if (sub === 'health' || sub === 'verify-chain' || sub === 'chain') {
    const status = await codexLbStatus();
    const result = status.ok
      ? await checkCodexLbResponseChain(status, { force: true })
      : { ok: false, status: 'not_configured', codex_lb: status };
    if (json) return console.log(JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log('codex-lb response chain: ok');
      return;
    }
    console.error(`codex-lb response chain: failed (${result.status})`);
    if (result.error) console.error(result.error);
    process.exitCode = 1;
    return;
  }
  if (sub === 'repair' || sub === 'resync' || sub === 'login') {
    const result = await repairCodexLbAuth();
    if (json) return console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      if (result.status === 'not_configured') console.error('codex-lb auth repair failed: codex-lb is not fully configured. Run: sks codex-lb setup --host <domain> --api-key <key>');
      else console.error(`codex-lb auth repair failed: ${result.status}${result.codex_login?.error ? `: ${result.codex_login.error}` : ''}`);
      process.exitCode = 1;
      return;
    }
    console.log('codex-lb provider auth repaired for Codex CLI/App environment.');
    console.log(`Config: ${result.config_path}`);
    console.log(`Key env: ${result.env_path}`);
    return;
  }
  if (sub === 'setup' || sub === 'reconfigure') {
    let host = readOption(args, '--host', readOption(args, '--domain', null));
    let apiKey = readOption(args, '--api-key', readOption(args, '--key', null));
    if (!host || !apiKey) {
      if (json) return console.log(JSON.stringify({ ok: false, reason: 'missing_host_or_api_key' }, null, 2));
      if (!canAskYesNo()) {
        console.error('Usage: sks codex-lb setup|reconfigure --host <domain> --api-key <key>');
        process.exitCode = 1;
        return;
      }
      console.log('codex-lb setup — configure your Codex load balancer connection.\n');
      if (!host) host = (await askPostinstallQuestion('Your codex-lb domain (e.g. https://codex.example.com/backend-api/codex): ')).trim();
      if (!host) { console.error('Setup cancelled: no domain provided.'); process.exitCode = 1; return; }
      if (!apiKey) apiKey = (await askPostinstallQuestion('Your codex-lb API key (sk-clb-...): ')).trim();
      if (!apiKey) { console.error('Setup cancelled: no API key provided.'); process.exitCode = 1; return; }
    }
    const result = await configureCodexLb({ host, apiKey });
    if (json) return console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      console.error(`codex-lb setup failed: ${result.status}${result.error ? `: ${result.error}` : ''}`);
      process.exitCode = 1;
      return;
    }
    console.log(`codex-lb configured: ${result.base_url}`);
    console.log(`Config: ${result.config_path}`);
    console.log(`Key env: ${result.env_path}`);
    return;
  }
  console.error('Usage: sks codex-lb status|health|repair|release [--keep-provider] [--delete-backup] [--force]|unselect|setup --host <domain> --api-key <key> [--json]');
  process.exitCode = 1;
}

async function maybePromptSksUpdateForLaunch(args = [], opts = {}) {
  if (flag(args, '--json') || flag(args, '--skip-update-check') || process.env.SKS_SKIP_UPDATE_CHECK === '1') return { status: 'skipped' };
  const latest = await npmPackageVersion('sneakoscope');
  const currentPackage = await effectivePackageVersion();
  if (!latest.version || compareVersions(latest.version, currentPackage) <= 0) return { status: 'current', latest: latest.version || null, error: latest.error || null };
  const command = `npm i -g sneakoscope@${latest.version} --registry https://registry.npmjs.org/`;
  if (shouldAutoApproveInstall(args)) return installSksLatest(command, latest.version);
  if (!canAskYesNo()) {
    console.log(`SKS update available: ${currentPackage} -> ${latest.version}. Run: ${command}`);
    return { status: 'available', latest: latest.version, command };
  }
  const label = opts.label || 'launch';
  const answer = (await askPostinstallQuestion(`SKS ${currentPackage} -> ${latest.version} update before ${label}? [Y/n] `)).trim();
  const yes = answer === '' || /^(y|yes|예|네|응)$/i.test(answer);
  if (!yes) return { status: 'skipped_by_user', latest: latest.version, command };
  return installSksLatest(command, latest.version);
}

async function installSksLatest(command, latestVersion) {
  const npm = await which('npm').catch(() => null);
  if (!npm) return { status: 'failed', latest: latestVersion, command, error: 'npm not found on PATH' };
  const install = await runProcess(npm, ['i', '-g', `sneakoscope@${latestVersion}`, '--registry', 'https://registry.npmjs.org/'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code !== 0) return { status: 'failed', latest: latestVersion, command, error: `${install.stderr || install.stdout || command + ' failed'}`.trim() };
  return { status: 'updated', latest: latestVersion, command };
}

async function ensureMadLaunchDependencies(args = []) {
  const actions = [];
  if (!flag(args, '--skip-cli-tools')) {
    const codex = await getCodexInfo().catch(() => ({}));
    if (!codex.bin) actions.push(await installCodexDependency(args, { prompt: 'Codex CLI missing. Install latest Codex CLI with npm i -g @openai/codex@latest?' }));
  }
  if (!flag(args, '--no-auto-install-tmux')) {
    const tmux = await tmuxReadiness().catch(() => ({ ok: false }));
    if (!tmux.ok) actions.push(await installTmuxDependency(args));
  }
  const status = await depsStatus(await sksRoot());
  return { ready: Boolean(status.codex_cli.ok && status.tmux.ok), actions, status };
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
  console.error('Usage: sks deps check|install [tmux|codex|context7|all] [--yes] [--json]');
  process.exitCode = 1;
}

async function depsStatus(root = null, opts = {}) {
  root ||= await sksRoot();
  const npmBin = await which('npm').catch(() => null);
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const app = opts.codexApp || await codexAppIntegrationStatus({ codex });
  const context7 = opts.context7 || await checkContext7(root);
  const tmux = opts.tmux || await tmuxReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  const brew = process.platform === 'darwin' ? await which('brew').catch(() => null) : null;
  const globalBin = await discoverGlobalSksCommand();
  const npmPrefix = npmBin ? await runProcess(npmBin, ['prefix', '-g'], { timeoutMs: 8000, maxOutputBytes: 4096 }).catch(() => null) : null;
  const pathText = process.env.PATH || '';
  const npmPrefixDir = npmPrefix?.code === 0 ? npmPrefix.stdout.trim().split(/\r?\n/).pop() : null;
  const npmBinDir = npmPrefixDir ? (process.platform === 'win32' ? npmPrefixDir : path.join(npmPrefixDir, 'bin')) : null;
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  const homebrewNeeded = process.platform === 'darwin' && !tmux.ok;
  return {
    root,
    ready: Boolean(nodeOk && npmBin && globalBin && codex.bin && context7.ok && tmux.ok),
    node: { ok: nodeOk, version: process.version },
    npm: { ok: Boolean(npmBin), bin: npmBin, global_bin_dir: npmBinDir, global_bin_on_path: npmBinDir ? pathText.split(path.delimiter).includes(npmBinDir) : null },
    sneakoscope: { ok: Boolean(globalBin), bin: globalBin },
    codex_cli: { ok: Boolean(codex.bin), bin: codex.bin || null, version: codex.version || null },
    codex_app: app,
    context7,
    browser_use: { ok: Boolean(app.features?.browser_tool_ready || app.mcp.has_browser_use), cache: app.plugins.browser_use_cache, source: app.features?.browser_tool_source || app.mcp.browser_use_source || null },
    computer_use: { ok: app.mcp.has_computer_use, cache: app.plugins.computer_use_cache },
    tmux: { ok: Boolean(tmux.ok), bin: tmux.bin || null, version: tmux.version || null, min_version: tmux.min_version || '3.0', current_session: Boolean(tmux.current_session), install_hint: tmux.ok ? null : platformTmuxInstallHint(), error: tmux.error || null },
    homebrew: process.platform === 'darwin' ? { ok: Boolean(brew), bin: brew, required_for_tmux_install: homebrewNeeded } : { ok: null, bin: null, required_for_tmux_install: false },
    next_actions: depsNextActions({ npmBin, globalBin, codex, app, context7, tmux, brew, nodeOk })
  };
}

function depsNextActions({ npmBin, globalBin, codex, app, context7, tmux, brew, nodeOk }) {
  const out = [];
  if (!nodeOk) out.push('Install Node.js 20.11+.');
  if (!npmBin) out.push('Install npm or use a Node.js distribution that includes npm.');
  if (!globalBin) out.push('Run: npm i -g sneakoscope');
  if (!codex.bin) out.push('Run: sks deps install codex');
  if (!context7.ok) out.push('Run: sks deps install context7');
  if (!app.ok) out.push('Run: sks codex-app check');
  if (!tmux.ok) out.push(process.platform === 'darwin' && !brew ? 'Install tmux from https://www.tmux.dev/download, or install Homebrew then run: sks deps install tmux' : 'Run: sks deps install tmux');
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
  console.log(`Image Gen:   ${status.codex_app.features?.image_generation ? 'ok' : 'missing'}`);
  console.log(`Context7:    ${status.context7.ok ? 'ok' : 'missing'}`);
  console.log(`Browser:     ${status.browser_use.ok ? `ok${status.browser_use.source ? ` (${status.browser_use.source})` : ''}` : 'missing'}`);
  console.log(`Computer Use:${status.computer_use.ok ? ' ok' : ' missing'}`);
  console.log(`tmux:        ${tmuxStatusKind(status.tmux)} ${status.tmux.version || status.tmux.error || ''}`.trimEnd());
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
  const wants = target === 'all' ? ['codex', 'context7', 'tmux'] : [target];
  const actions = [];
  if (wants.includes('codex')) actions.push(await installCodexDependency(args));
  if (wants.includes('context7')) actions.push(await installContext7Dependency(root));
  if (wants.includes('tmux')) actions.push(await installTmuxDependency(args));
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

async function installTmuxDependency(args = []) {
  return ensureTmuxCliTool(args, { dryRun: flag(args, '--dry-run') });
}

async function confirmInstall(question, args = []) {
  if (shouldAutoApproveInstall(args)) return true;
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
    const codexUpdate = await maybePromptCodexUpdateForLaunch(args, { label: 'auto-review tmux launch' });
    if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
      console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
      process.exitCode = 1;
      return;
    }
    const sessionArg = readOption(cleanArgs, '--session', null);
    const session = sessionArg || sanitizeTmuxSessionName(`${profile}-${defaultTmuxSessionName(process.cwd())}`);
    return launchTmuxUi([...cleanArgs, '--session', session], { codexArgs: ['--profile', profile] });
  }
  console.error('Usage: sks auto-review status|enable|disable|start [--high] [--json]');
  console.error('Alias: sks --Auto-review [--high]');
  process.exitCode = 1;
}

async function codexAppHelp(args = []) {
  const action = args[0] || 'help';
  if (action === 'remote-control' || action === 'remote') return codexAppRemoteControlCommand(args.slice(1));
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
    sksAsciiLogo(), '',
    'Codex App', '',
    formatCodexAppStatus(status), '',
    `Skills: project=${skills.project.ok ? 'ok' : `missing ${skills.project.missing.length}`} global=${skills.global.ok ? 'ok' : `missing ${skills.global.missing.length}`}`, '',
    'Setup:', '  sks bootstrap', '  sks deps check', '  sks codex-app check', '  sks codex-app remote-control --status', '  sks tmux check', '',
    'Generated files:', '  .codex/config.toml', '  .codex/hooks.json', '  .agents/skills/', '  .codex/agents/', '  .codex/SNEAKOSCOPE.md', '  AGENTS.md', '',
    'Git ignore:', '  default setup writes .gitignore entries for .sneakoscope/, .codex/, .agents/, AGENTS.md', '  --local-only writes those patterns to .git/info/exclude instead', '',
    'Prompt routes:', formatDollarCommandsCompact('  ')
  ].join('\n'));
}

function aliases() {
  console.log(`${sksAsciiLogo()}

Aliases

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
  sks
  sks setup
  sneakoscope setup
  sks commands
  sneakoscope commands
`);
}

function usage(args = []) {
  const topic = String(args[0] || 'overview').toLowerCase();
  const blocks = {
    overview: [sksAsciiLogo(), '', 'Usage', '', 'Discover:', '  sks commands', '  sks quickstart', '  sks root', '  sks bootstrap', '  sks deps check', '  sks codex-app check', '  sks tmux check', '  sks dollar-commands', '', `Topics: ${USAGE_TOPICS}`],
    install: ['Install', '', '1. Global install:', '  npm i -g sneakoscope', '', '2. Bootstrap and check dependencies:', '  sks bootstrap', '  sks deps check', '', '3. Confirm Codex App commands:', '  sks codex-app check', '  sks dollar-commands', '', '4. Optional codex-lb key setup for CLI sks runs:', '  sks codex-lb setup --host <domain> --api-key <key>', '  sks codex-lb health', '  sks codex-lb repair', '  sks', '', 'Fallback:', '  npx -y -p sneakoscope sks root', '', 'Project:', '  npm i -D sneakoscope', '  npx sks setup --install-scope project'],
    bootstrap: ['Bootstrap', '', '  sks bootstrap', '  sks setup --bootstrap', '', 'Creates project SKS files, Codex App skills/hooks/config, state/guard files, then checks Codex App, Context7, and tmux.'],
    root: ['Root', '', '  sks root [--json]', '', 'Inside a project, SKS uses that project root. Outside any project marker, runtime commands use the per-user global SKS root instead of writing .sneakoscope into the current random folder.'],
    deps: ['Dependencies', '', '  sks deps check [--json]', '  sks deps install [tmux|codex|context7|all] [--yes]', '', 'tmux on macOS uses Homebrew after Y/n approval for missing installs or Homebrew-managed upgrades. If PATH resolves an npm-managed tmux, SKS prompts for npm i -g tmux@latest instead. Unknown non-Homebrew tmux paths are reported as conflicts.'],
    tmux: ['tmux', '', '  sks', '  sks tmux open', '  sks tmux check', '  sks tmux status --once', '  sks deps install tmux', '', 'Running bare `sks` opens or reuses the default tmux Codex CLI session in fast-high mode: --model gpt-5.5 -c model_reasoning_effort="high". SKS always forces gpt-5.5; SKS_CODEX_MODEL and SKS_CODEX_FAST_HIGH=0 cannot downgrade or remove that model pin. Use SKS_CODEX_REASONING only for reasoning effort. Before launch, SKS checks npm @openai/codex@latest and prompts Y/n when the installed Codex CLI is missing or outdated. Use `sks tmux open` when you need explicit session/workspace flags, and `sks help` for CLI help.'],
    openclaw: ['OpenClaw', '', '  sks openclaw install', '  sks openclaw path', '  sks openclaw print SKILL.md', '', 'Installs an OpenClaw skill package under ~/.openclaw/skills/sneakoscope-codex so OpenClaw agents can attach skills: [sneakoscope-codex] with the shell tool and call local SKS commands from a project root.'],
    team: ['Team', '', '  sks team "task" executor:5 reviewer:6 user:1', '  sks team open-tmux latest', '  sks team watch latest', '  sks team lane latest --agent analysis_scout_1 --follow', '  sks team message latest --from analysis_scout_1 --to executor_1 --message "handoff note"', '  sks team cleanup-tmux latest', '', '$Team auto-seals a route contract, opens scout-first tmux lanes when available, then runs scouts -> TriWiki attention -> debate -> runtime graph/inbox -> fresh executors -> review -> cleanup -> reflection -> Honest.'],
    'qa-loop': ['QA-LOOP', '', '  sks qa-loop prepare "QA this app"', '  sks qa-loop answer <MISSION_ID> answers.json', '  sks qa-loop run <MISSION_ID> --max-cycles 8', '', 'Report: YYYY-MM-DD-v<version>-qa-report.md'],
    ppt: ['PPT', '', '  $PPT 투자자용 피치덱을 HTML 기반 PDF로 만들어줘', '  $PPT 우리 SaaS 소개자료 만들어줘', '  sks ppt build latest --json', '  sks ppt status latest --json', '', '$PPT infers delivery context, audience profile, STP strategy, decision context, and 3+ pain-point/solution/aha mappings before source research, design-system work, HTML/PDF export, render QA, fact-ledger validation, and bounded review-loop validation. Independent strategy/render/file-write phases run in parallel where inputs allow and are recorded in ppt-parallel-report.json. The visual system must stay simple, restrained, and information-first; editable source HTML is kept under source-html/, PPT-only temporary build files are cleaned, and installed skills/MCPs outside the $PPT allowlist are ignored. Design uses getdesign-reference plus the built-in PPT design pipeline; imagegen is a required PPT skill so any needed raster assets or generated slide visual critique must invoke Codex App $imagegen/gpt-image-2 and save real outputs into the mission assets/review evidence paths. Context7 is conditional only when the sealed PPT contract needs current external docs. Missing required $imagegen/gpt-image-2 output blocks instead of being simulated.'],
    'image-ux-review': ['Image UX Review', '', '  $Image-UX-Review localhost 화면을 이미지 생성 리뷰 루프로 검수해줘', '  $UX-Review 이 스크린샷을 gpt-image-2 콜아웃 리뷰로 분석하고 고쳐줘', '  sks image-ux-review status latest --json', '', '$Image-UX-Review captures or receives source UI screenshots, runs Codex App $imagegen/gpt-image-2 to create generated annotated review images with numbered callouts, then extracts those generated images into image-ux-issue-ledger.json. Text-only screenshot critique cannot pass image-ux-review-gate.json; missing generated review images remain an explicit blocker.'],
    goal: ['Goal', '', '  sks goal create "task"', '  sks goal status latest', '  sks goal pause latest', '  sks goal resume latest', '  sks goal clear latest'],
    'codex-app': ['Codex App', '', '  sks bootstrap', '  sks codex-app check', '  sks codex-app remote-control --status', '  sks dollar-commands', '  cat .codex/SNEAKOSCOPE.md'],
    dollar: ['Dollar Commands', '', formatDollarCommandsCompact('  '), '', 'Terminal: sks dollar-commands [--json]'],
    wiki: ['TriWiki', '', '  sks wiki pack', '  sks wiki refresh [--prune]', '  sks wiki sweep latest --json', '  sks wiki validate .sneakoscope/wiki/context-pack.json', '  sks wiki prune --dry-run --json', '', 'Packs include attention.use_first and attention.hydrate_first for compact recall plus source hydration. Sweep records intentional forgetting and promotion candidates.'],
    harness: ['Harness Growth', '', '  sks harness fixture --json', '  sks harness review --json', '', 'Runs deterministic fixtures for deliberate forgetting, skill cards, harness experiments, tool error taxonomy, permission profiles, MultiAgentV2, and tmux cockpit views.'],
    'skill-dream': ['Skill Dreaming', '', '  sks skill-dream status', '  sks skill-dream run --json', '  sks skill-dream record --route team --skills team,prompt-pipeline', '', 'Records cheap JSON usage counters in .sneakoscope/skills/dream-state.json and periodically writes recommendation-only keep/merge/prune/improve reports. It never deletes or merges skills automatically.'],
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
  const deps = await depsStatus(root, { context7: context7Status, codexApp: appRuntime, tmux: cliTools.tmux });
  const install = await installStatus(root, installScope, { globalCommand });
  const versioningInfo = await versioningStatus(root);
  const skills = await checkRequiredSkills(root);
  const guard = await harnessGuardStatus(root);
  const files = await codexAppFilesStatus(root, skills, versioningInfo);
  const ready = Boolean(!conflicts.hard_block && install.ok && files.ok && skills.ok && guard.ok && context7Status.ok && appRuntime.ok && deps.tmux.ok);
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
    tmux: deps.tmux,
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
  console.log(`tmux:          ${deps.tmux.ok ? 'ok' : 'missing'}${deps.tmux.version ? ` ${deps.tmux.version}` : ''}`);
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
  console.log(`${sksAsciiLogo()}\nSetup\n`);
  console.log(`Project:   ${root}`);
  console.log(`Install:   ${install.ok ? 'ok' : 'missing'} ${install.scope} (${install.command_prefix})`);
  console.log(`CLI tools: Codex ${formatCodexCliToolStatus(cliTools.codex)}; tmux ${tmuxStatusKind(cliTools.tmux)} ${cliTools.tmux.version || cliTools.tmux.error || ''}`.trimEnd());
  console.log(`Hooks:     ${path.relative(root, hooksPath)}`);
  console.log(`Version:   explicit bump only${versioningInfo.package_version ? ` (${versioningInfo.package_version})` : ''}`);
  if (localOnly) console.log('Git:       local-only (.git/info/exclude; user AGENTS preserved, SKS managed block refreshed)');
  else console.log('Git:       .gitignore ignores SKS generated files');
  console.log(`Codex App: .codex/config.toml, .codex/hooks.json, .agents/skills, .codex/agents, .codex/SNEAKOSCOPE.md`);
  console.log(`Global $:  ${globalSkills.status === 'installed' ? 'ok' : globalSkills.status} ${globalSkills.root || ''}`.trimEnd());
  console.log(`App tools: ${appRuntime.ok ? 'ok' : 'needs setup'} Codex App=${appRuntime.app.installed ? 'ok' : 'missing'} Browser=${appRuntime.features?.browser_tool_ready ? 'ok' : 'missing'} Computer Use=${appRuntime.mcp.has_computer_use ? 'ok' : 'missing'} Image Gen=${appRuntime.features?.image_generation ? 'ok' : 'missing'} Git Actions=${appRuntime.features?.git_actions?.ok ? 'ok' : 'missing'}`);
  console.log(`Prompt:    intent-first routing, $Answer fact-check route, $DFix ultralight Direct Fix route, $PPT HTML/PDF presentation route, Context7 gate`);
  console.log(`Skills:    .agents/skills`);
  console.log(`Next:      sks context7 check; sks selftest --mock; sks commands; sks dollar-commands`);
  if (cliTools.codex.status === 'failed') console.log(`\nCodex CLI install failed. Run manually: npm i -g @openai/codex. ${cliTools.codex.error || ''}`.trim());
  if (cliTools.codex.status === 'installed_not_on_path') console.log(`\nCodex CLI installed but not on PATH. ${cliTools.codex.hint}`);
  if (!cliTools.tmux.ok) console.log(`\ntmux ${tmuxStatusKind(cliTools.tmux)}. Install: ${cliTools.tmux.install_hint}`);
  if (!install.ok && install.scope === 'global') console.log('\nGlobal command missing. Run: npm i -g sneakoscope');
  if (!install.ok && install.scope === 'project') console.log('\nProject package missing. Run: npm i -D sneakoscope');
  if (!appRuntime.ok) console.log('\nCodex App, first-party Codex Computer Use, and $imagegen/gpt-image-2 are required for SKS visual evidence; Browser Use is not a UI verification substitute. Run: sks codex-app check');
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
  let globalCodexConfigRepair = null;
  let projectRepair = null;
  let codexLbRepair = null;
  const globalCommand = await globalSksCommand();
  if (flag(args, '--fix') && !conflictScan.hard_block) {
    const existingManifest = await readJson(path.join(root, '.sneakoscope', 'manifest.json'), null);
    const fixScope = requestedScope || normalizeInstallScope(existingManifest?.installation?.scope || 'global');
    projectRepair = await initProject(root, { installScope: fixScope, globalCommand, localOnly: flag(args, '--local-only') || Boolean(existingManifest?.git?.local_only), force: true, repair: true });
    if (!flag(args, '--local-only')) globalCodexConfigRepair = await ensureGlobalCodexFastModeDuringInstall();
    if (!flag(args, '--local-only')) globalSkillsRepair = await ensureGlobalCodexSkillsDuringInstall({ force: true });
    codexLbRepair = await repairCodexLbAuth();
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
  const install = await installStatus(root, installScope, { globalCommand });
  const dbPolicyExists = await exists(path.join(root, '.sneakoscope', 'db-safety.json'));
  const dbScan = await scanDbSafety(root).catch((err) => ({ ok: false, findings: [{ id: 'db_safety_scan_failed', severity: 'high', reason: err.message }] }));
  const context7Status = await checkContext7(root);
  const appRuntime = await codexAppIntegrationStatus({ codex });
  const tmuxStatus = await tmuxReadiness().catch((err) => ({ ok: false, version: null, error: err.message }));
  const skillStatus = await checkRequiredSkills(root);
  const globalSkillStatus = await checkRequiredSkills(null, globalCodexSkillsRoot());
  const codexLb = await codexLbStatus();
  const codexLbReady = (!codexLb.selected && !codexLb.provider_configured && !codexLb.env_file) || (codexLb.ok && codexLb.selected);
  const guardStatus = await harnessGuardStatus(root);
  const versioningInfo = await versioningStatus(root);
  const codexApp = await codexAppFilesStatus(root, skillStatus, versioningInfo);
  codexApp.global_skills = globalSkillStatus;
  const result = {
    node: { ok: nodeOk, version: process.version }, root, codex, rust,
    install,
    repair: { applied: repairApplied, project: projectRepair, global_codex_config: globalCodexConfigRepair, global_skills: globalSkillsRepair, codex_lb: codexLbRepair, blocked_by_other_harness: flag(args, '--fix') && conflictScan.hard_block },
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
    runtime: { tmux: { ok: Boolean(tmuxStatus.ok), bin: tmuxStatus.bin || null, version: tmuxStatus.version || null, min_version: tmuxStatus.min_version || '3.0', current_session: Boolean(tmuxStatus.current_session), install_hint: tmuxStatus.ok ? null : platformTmuxInstallHint(), error: tmuxStatus.error || null } },
    harness_guard: guardStatus,
    versioning: versioningInfo,
    db_guard: { ok: dbPolicyExists && dbScan.ok, policy: dbPolicyExists ? await loadDbSafetyPolicy(root) : null, scan: dbScan },
    hooks: { ok: await exists(path.join(root, '.codex', 'hooks.json')) },
    skills: skillStatus,
    global_skills: globalSkillStatus,
    codex_lb: { ...codexLb, ready: codexLbReady },
    codex_app: {
      ...codexApp
    },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) }, storage
  };
  result.ready = !result.harness_conflicts.hard_block && nodeOk && Boolean(codex.bin) && install.ok && result.sneakoscope.ok && result.context7.ok && appRuntime.ok && result.runtime.tmux.ok && result.harness_guard.ok && result.versioning.ok && result.db_guard.ok && result.codex_lb.ready && result.codex_app.ok && result.skills.ok && result.global_skills.ok;
  if (result.harness_conflicts.hard_block) process.exitCode = 1;
  if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
  console.log(`${sksAsciiLogo()}\nDoctor\n`);
  console.log(`Node:      ${nodeOk ? 'ok' : 'fail'} ${process.version}`);
  console.log(`Project:   ${root}`);
  console.log(`Codex:     ${codex.bin ? 'ok' : 'missing'} ${codex.version || ''}`);
  console.log(`Install:   ${install.ok ? 'ok' : 'missing'} ${install.scope} (${install.command_prefix})`);
  console.log(`Conflicts: ${result.harness_conflicts.hard_block ? 'blocked' : 'ok'} ${result.harness_conflicts.conflicts.length} finding(s)`);
  if (repairApplied) console.log('Repair:    regenerated SKS managed files from the installed package template');
  if (globalCodexConfigRepair) console.log(`Global Codex config: ${globalCodexConfigRepair.status} ${globalCodexConfigRepair.config_path || ''}`.trimEnd());
  if (globalSkillsRepair) {
    const removed = globalSkillsRepair.removed_stale_generated_skills || [];
    const cleanup = removed.length ? ` removed stale generated skill shadow(s): ${removed.join(', ')}` : '';
    console.log(`Global $ repair: ${globalSkillsRepair.status} ${globalSkillsRepair.root || ''}${cleanup}`.trimEnd());
  }
  if (codexLbRepair?.ok) console.log(`codex-lb repair: ${codexLbRepair.config_repaired ? 'config+provider auth resynced' : 'provider auth resynced'} from stored env`);
  else if (codexLbRepair && codexLbRepair.status !== 'missing_env_key') console.log(`codex-lb repair: skipped (${codexLbRepair.status})`);
  if (flag(args, '--fix') && result.harness_conflicts.hard_block) console.log('Repair:    skipped because another Codex harness needs human-approved removal first');
  console.log(`Rust acc.: ${rust.available ? rust.version : 'optional-missing'}`);
  console.log(`State:     ${result.sneakoscope.ok ? 'ok' : 'missing .sneakoscope'}`);
  console.log(`Context7:  ${result.context7.ok ? 'ok' : 'missing MCP config'} project=${result.context7.project.ok ? 'ok' : 'missing'} global=${result.context7.global.ok ? 'ok' : 'missing'}`);
  console.log(`App tools: ${appRuntime.ok ? 'ok' : 'needs setup'} Codex App=${appRuntime.app.installed ? 'ok' : 'missing'} Browser=${appRuntime.features?.browser_tool_ready ? 'ok' : 'missing'} Computer Use=${appRuntime.mcp.has_computer_use ? 'ok' : 'missing'} Image Gen=${appRuntime.features?.image_generation ? 'ok' : 'missing'}`);
  console.log(`tmux:      ${tmuxStatusKind(result.runtime.tmux)} ${result.runtime.tmux.version || result.runtime.tmux.error || ''}`.trimEnd());
  console.log(`Guard:     ${result.harness_guard.ok ? 'ok' : 'blocked'}${result.harness_guard.source_exception ? ' source-exception' : ''}`);
  console.log(`Version:   ${result.versioning.ok ? 'ok' : 'missing'}${result.versioning.enabled ? ` ${result.versioning.package_version || ''}` : ` ${result.versioning.reason || 'disabled'}`}`);
  console.log(`DB Guard:  ${result.db_guard.ok ? 'ok' : 'blocked'} ${dbScan.findings?.length || 0} finding(s)`);
  console.log(`Hooks:     ${result.hooks.ok ? 'ok' : 'missing .codex/hooks.json'}`);
  console.log(`codex-lb:  ${result.codex_lb.ok ? 'ok' : result.codex_lb.ready ? 'not configured' : 'needs repair'}${result.codex_lb.base_url ? ` ${result.codex_lb.base_url}` : ''}`);
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
  if (!result.runtime.tmux.ok) console.log('tmux missing. Run: sks deps install tmux');
  if (!result.harness_guard.ok) console.log('Harness guard failed. Run: sks setup from a real terminal, then sks guard check.');
  if (!result.versioning.ok) console.log('Versioning metadata drift detected. Run: sks versioning status, then sks versioning bump if release metadata should change.');
  if (!result.codex_lb.ready) console.log('codex-lb config/auth drift detected. Run: sks doctor --fix, or reconfigure once with sks codex-lb reconfigure --host <domain> --api-key <key>.');
  if (!result.skills.ok) console.log(`Missing skills: ${result.skills.missing.join(', ')}. Run: sks setup`);
  if (!result.global_skills.ok) console.log(`Missing global $ skills: ${result.global_skills.missing.join(', ')}. Run: npm i -g sneakoscope, or sks setup from a non-local-only run.`);
  const blocked = [];
  if (!result.runtime.tmux.ok) blocked.push(['tmux is missing', 'sks deps install tmux']);
  if (!appRuntime.ok) blocked.push(['Codex App or first-party MCP/plugin tools need setup', 'sks codex-app check']);
  if (blocked.length) {
    console.log('\nBlocked:');
    for (const [reason] of blocked) console.log(`- ${reason}`);
    console.log('\nRun:');
    for (const [, command] of blocked) console.log(`  ${command}`);
  }
  if (!result.ready && !flag(args, '--fix')) console.log('Run: sks doctor --fix');
}

async function codexAppSkillReadiness(root = null) {
  root ||= await sksRoot();
  const project = await checkRequiredSkills(root);
  const global = await checkRequiredSkills(null, globalCodexSkillsRoot());
  return { ok: project.ok || global.ok, project, global };
}

async function init(args) {
  const root = await projectRoot();
  const conflicts = await scanHarnessConflicts(root);
  if (conflicts.hard_block) return blockForHarnessConflicts(conflicts, args);
  const installScope = installScopeFromArgs(args);
  const localOnly = flag(args, '--local-only');
  const globalCommand = await globalSksCommand();
  const res = await initProject(root, { force: flag(args, '--force'), installScope, globalCommand, localOnly });
  console.log(`Initialized SKS in ${root}`);
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
  const sourceProject = await isHarnessSourceProject(root).catch(() => false);
  const sourceBin = path.join(root, 'bin', 'sks.mjs');
  const sourceBinExists = sourceProject && await exists(sourceBin);
  const commandPrefix = sourceBinExists ? 'node ./bin/sks.mjs' : sksCommandPrefix(scope, { globalCommand: globalBin || undefined });
  const projectBin = path.join(root, 'node_modules', 'sneakoscope', 'bin', 'sks.mjs');
  const projectBinExists = await exists(projectBin);
  return {
    scope,
    default_scope: 'global',
    command_prefix: commandPrefix,
    global_bin: globalBin,
    project_bin: projectBin,
    source_project: sourceProject,
    source_bin: sourceBinExists ? sourceBin : null,
    ok: sourceBinExists || (scope === 'project' ? projectBinExists : Boolean(globalBin))
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

async function selftestRuntimeVersion() {
  const source = await safeReadText(path.join(packageRoot(), 'src', 'core', 'fsx.mjs'));
  const sourceVersion = source.match(/export const PACKAGE_VERSION = ['"]([^'"]+)['"];/)?.[1] || null;
  return sourceVersion || PACKAGE_VERSION;
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

function hasResearchProfileConfig(text = '') {
  return /\[profiles\.sks-research-xhigh\][\s\S]*?model = "gpt-5\.5"[\s\S]*?model_reasoning_effort = "xhigh"/.test(text)
    && /\[profiles\.sks-research\][\s\S]*?model = "gpt-5\.5"[\s\S]*?approval_policy = "never"[\s\S]*?model_reasoning_effort = "xhigh"/.test(text);
}

function readMaxCycles(args, fallback) {
  const i = args.indexOf('--max-cycles');
  const raw = i >= 0 && args[i + 1] ? Number(args[i + 1]) : Number(fallback);
  if (!Number.isFinite(raw)) return Math.max(1, Number.parseInt(fallback, 10) || 1);
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

function positionalArgs(args = []) {
  const out = [];
  const valueFlags = new Set(['--format', '--iterations', '--out', '--baseline', '--candidate', '--install-scope', '--max-cycles', '--cycle-timeout-minutes', '--depth', '--scope', '--transport', '--query', '--topic', '--tokens', '--timeout-ms', '--sql', '--command', '--project-ref', '--agent', '--phase', '--message', '--role', '--max-anchors', '--lines', '--dir']);
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
  // Force non-interactive mode for the entire selftest so any in-process call that hits
  // canAskYesNo() (codex-lb provider-restore prompt, chain-failure prompt, etc.) takes the
  // non-interactive fallback path instead of bubbling a live readline prompt up to the
  // user's terminal (e.g. during `npm publish` -> prepublishOnly -> release:check -> selftest).
  process.env.CI = 'true';
  const tmp = tmpdir();
  process.chdir(tmp);
  await initProject(tmp, {});
  const latestMissionTmp = tmpdir();
  await ensureDir(path.join(latestMissionTmp, '.sneakoscope', 'missions', 'M-20260509-193839-6917'));
  await ensureDir(path.join(latestMissionTmp, '.sneakoscope', 'missions', 'M-20260509-193839-0551'));
  await writeJsonAtomic(path.join(latestMissionTmp, '.sneakoscope', 'missions', 'M-20260509-193839-6917', 'mission.json'), { id: 'M-20260509-193839-6917', created_at: '2026-05-09T10:38:39.362Z' });
  await writeJsonAtomic(path.join(latestMissionTmp, '.sneakoscope', 'missions', 'M-20260509-193839-0551', 'mission.json'), { id: 'M-20260509-193839-0551', created_at: '2026-05-09T10:38:39.363Z' });
  if (await findLatestMission(latestMissionTmp) !== 'M-20260509-193839-0551') throw new Error('selftest: latest mission should use mission metadata time, not lexicographic id order');
  if (readMaxCycles(['--max-cycles', 'Infinity'], 8) !== 8) throw new Error('selftest: non-finite max cycles not sanitized');
  if (readMaxCycles(['--max-cycles', '0'], 8) !== 1) throw new Error('selftest: zero max cycles not bounded');
  const loopMission = await createMission(tmp, { mode: 'team', prompt: 'compliance loop guard selftest' });
  const loopState = { mission_id: loopMission.id, mode: 'TEAM', route_command: '$Team', stop_gate: 'team-gate.json' };
  await writeJsonAtomic(path.join(loopMission.dir, 'team-gate.json'), { passed: false });
  for (let i = 0; i < 2; i++) {
    const stop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
    if (stop?.decision !== 'block') throw new Error('selftest: compliance loop guard blocked too early');
  }
  const trippedStop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
  if (trippedStop) throw new Error('selftest: compliance loop guard did not terminally trip');
  const loopBlocker = await readJson(path.join(loopMission.dir, 'hard-blocker.json'), null);
  if (loopBlocker?.reason !== 'compliance_loop_guard_tripped') throw new Error('selftest: compliance loop guard did not write hard blocker');
  const hardBlockerUnblocked = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
  if (hardBlockerUnblocked?.decision === 'block' && !String(hardBlockerUnblocked.reason || '').includes('reflection')) throw new Error('selftest: hard blocker did not unblock incomplete active gate');
  const clarificationMission = await createMission(tmp, { mode: 'team', prompt: 'visible question gate selftest' });
  await writeTextAtomic(path.join(clarificationMission.dir, 'questions.md'), '# Questions\n\n1. GOAL_PRECISE: What should be changed?\n');
  await writeJsonAtomic(path.join(clarificationMission.dir, 'required-answers.schema.json'), { slots: [{ id: 'GOAL_PRECISE', question: 'What should be changed?' }] });
  const clarificationState = {
    mission_id: clarificationMission.id,
    mode: 'TEAM',
    route_command: '$Team',
    phase: 'TEAM_CLARIFICATION_AWAITING_ANSWERS',
    clarification_required: true,
    implementation_allowed: false,
    ambiguity_gate_required: true,
    ambiguity_gate_passed: false,
    stop_gate: 'clarification-gate'
  };
  for (let i = 0; i < 5; i++) {
    const stop = await evaluateStop(tmp, clarificationState, { last_assistant_message: 'continuing implementation without visible questions' });
    if (stop?.decision !== 'block' || stop?.gate !== 'clarification' || !/paused|answers|pipeline answer/i.test(String(stop?.reason || ''))) throw new Error('selftest: clarification not paused');
  }
  if (await exists(path.join(clarificationMission.dir, 'hard-blocker.json'))) throw new Error('selftest: clarification wrote hard-blocker');
  const visibleQuestionStop = await evaluateStop(tmp, clarificationState, { last_assistant_message: 'Required questions\n1. GOAL_PRECISE\nsks pipeline answer latest --stdin' });
  if (visibleQuestionStop?.continue !== true) throw new Error('selftest: visible clarification did not wait');
  const cg = await projectGateStatus(tmp, clarificationState);
  if (!cg.blockers.includes('clarification-gate:explicit_user_answers') || !cg.blockers.includes('clarification-gate:pipeline_answer')) throw new Error('selftest: missing clarification blockers');
  await setCurrent(tmp, clarificationState);
  const hookPath = path.join(packageRoot(), 'bin', 'sks.mjs');
  const blockedPre = await runProcess(process.execPath, [hookPath, 'hook', 'pre-tool'], { cwd: tmp, input: JSON.stringify({ cwd: tmp, tool_name: 'Bash', tool_input: { command: 'npm run selftest' } }), timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (blockedPre.code !== 0) throw new Error(`selftest: pre-tool exit ${blockedPre.code}: ${blockedPre.stderr}`);
  const bp = JSON.parse(blockedPre.stdout || '{}');
  if (bp.decision !== 'block' || !String(bp.reason || '').includes('waiting for explicit user answers')) throw new Error('selftest: pre-tool not blocked');
  const deniedPermission = await runProcess(process.execPath, [hookPath, 'hook', 'permission-request'], { cwd: tmp, input: JSON.stringify({ cwd: tmp, command: 'npm run selftest', action: 'Run command' }), timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (deniedPermission.code !== 0) throw new Error(`selftest: permission exit ${deniedPermission.code}: ${deniedPermission.stderr}`);
  const dp = JSON.parse(deniedPermission.stdout || '{}');
  if (dp.hookSpecificOutput?.decision?.behavior !== 'deny' || !String(dp.hookSpecificOutput?.decision?.message || '').includes('waiting for explicit user answers')) throw new Error('selftest: permission not denied');
  const answerTool = await runProcess(process.execPath, [hookPath, 'hook', 'pre-tool'], { cwd: tmp, input: JSON.stringify({ cwd: tmp, tool_name: 'Bash', tool_input: { command: `sks pipeline answer ${clarificationMission.id} --stdin` } }), timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (answerTool.code !== 0) throw new Error(`selftest: answer hook exit ${answerTool.code}: ${answerTool.stderr}`);
  if (JSON.parse(answerTool.stdout || '{}').decision === 'block') throw new Error('selftest: answer command blocked');
  await setCurrent(tmp, loopState);
  const dfixPromptHook = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'user-prompt-submit'], {
    cwd: tmp,
    input: JSON.stringify({ cwd: tmp, prompt: '$DFix Change the CTA label only' }),
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (dfixPromptHook.code !== 0) throw new Error(`selftest: DFix prompt hook exited ${dfixPromptHook.code}: ${dfixPromptHook.stderr}`);
  if (await exists(path.join(tmp, '.sneakoscope', 'state', 'light-route-stop.json'))) throw new Error('selftest: DFix prompt hook created persistent light-route state');
  const dfixStopHook = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'stop'], {
    cwd: tmp,
    input: JSON.stringify({ cwd: tmp, last_assistant_message: 'DFix 완료 요약: CTA 라벨만 변경했습니다.\nDFix 솔직모드: 검증=대상 파일 확인 통과, 미검증=없음, 남은 문제=없음.' }),
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (dfixStopHook.code !== 0) throw new Error(`selftest: DFix stop hook exited ${dfixStopHook.code}: ${dfixStopHook.stderr}`);
  const dfixStop = JSON.parse(dfixStopHook.stdout || '{}');
  if (dfixStop.decision === 'block' || dfixStop.continue === false) throw new Error(`selftest: DFix stop hook was blocked: ${dfixStopHook.stdout}`);
  if (!String(dfixStop.systemMessage || '').includes('DFix ultralight finalization accepted')) throw new Error('selftest: DFix stop hook did not use the ultralight finalization bypass');
  await writeJsonAtomic(path.join(loopMission.dir, 'team-roster.json'), { schema_version: 1, mission_id: loopMission.id, confirmed: true });
  await writeJsonAtomic(path.join(loopMission.dir, 'team-session-cleanup.json'), { schema_version: 1, passed: true, all_sessions_closed: true, outstanding_sessions: 0, live_transcript_finalized: true });
  await writeJsonAtomic(path.join(loopMission.dir, 'team-gate.json'), { passed: true, team_roster_confirmed: true, analysis_artifact: true, triwiki_refreshed: true, triwiki_validated: true, consensus_artifact: true, implementation_team_fresh: true, review_artifact: true, integration_evidence: true, session_cleanup: true });
  const afterGateFixStop = await evaluateStop(tmp, loopState, { last_assistant_message: 'done' });
  if (afterGateFixStop?.decision !== 'block' || !String(afterGateFixStop.reason || '').includes('reflection')) throw new Error('selftest: hard blocker masked later gate progress');
  const guardStatus = await harnessGuardStatus(tmp);
  if (!guardStatus.ok || !guardStatus.locked || guardStatus.source_exception) throw new Error('selftest: harness guard not locked in installed project');
  const repairTmp = tmpdir();
  await writeJsonAtomic(path.join(repairTmp, 'package.json'), { name: 'sneakoscope', version: '0.0.0', type: 'module' });
  await ensureDir(path.join(repairTmp, 'bin'));
  await writeTextAtomic(path.join(repairTmp, 'bin', 'sks.mjs'), '#!/usr/bin/env node\n');
  await ensureDir(path.join(repairTmp, 'src', 'core'));
  await writeTextAtomic(path.join(repairTmp, 'src', 'core', 'init.mjs'), '// source-project marker\n');
  await writeTextAtomic(path.join(repairTmp, 'src', 'core', 'hooks-runtime.mjs'), '// source-project marker\n');
  await initProject(repairTmp, { installScope: 'project', localOnly: true });
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'team', 'SKILL.md'), 'tampered\n');
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'), '---\nname: agent-team\ndescription: Fallback Codex App picker alias for $Team.\n---\n');
  await ensureDir(path.join(repairTmp, '.agents', 'skills', 'stale-sks-generated'));
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'stale-sks-generated', 'SKILL.md'), '---\nname: stale-sks-generated\ndescription: Old SKS generated skill that should disappear on update.\n---\n');
  const stalePluginSkillNames = ['browser', 'browser-use', 'computer-use', 'chrome', 'documents', 'presentations', 'spreadsheets', 'latex'];
  const stalePluginSkillContent = (name) => `---\nname: ${name}\ndescription: Sneakoscope generated stale plugin collision for selftest.\n---\n\nCodex App pipeline activation:\n- stale selftest marker\n`;
  for (const name of stalePluginSkillNames) {
    await ensureDir(path.join(repairTmp, '.agents', 'skills', name));
    await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', name, 'SKILL.md'), stalePluginSkillContent(name));
  }
  await writeJsonAtomic(path.join(repairTmp, '.agents', 'skills', '.sks-generated.json'), {
    schema_version: 1,
    generated_by: 'sneakoscope',
    version: '0.0.1',
    skills: ['team', 'stale-sks-generated', ...stalePluginSkillNames],
    files: ['.agents/skills/team/SKILL.md', '.agents/skills/stale-sks-generated/SKILL.md', ...stalePluginSkillNames.map((name) => `.agents/skills/${name}/SKILL.md`)]
  });
  const staleCodexAgentRel = '.codex/agents/stale-generated.toml';
  await writeTextAtomic(path.join(repairTmp, staleCodexAgentRel), 'name = "stale_generated"\n');
  const staleManifest = await readJson(path.join(repairTmp, '.sneakoscope', 'manifest.json'));
  staleManifest.version = '0.0.1';
  staleManifest.generated_files = {
    schema_version: 1,
    generated_by: 'sneakoscope',
    prune_policy: 'remove_previous_sks_generated_paths_absent_from_current_manifest',
    files: [...(staleManifest.generated_files?.files || []), '.agents/skills/stale-sks-generated/SKILL.md', staleCodexAgentRel]
  };
  await writeJsonAtomic(path.join(repairTmp, '.sneakoscope', 'manifest.json'), staleManifest);
  await ensureDir(path.join(repairTmp, '.agents', 'skills', 'custom-keep'));
  await writeTextAtomic(path.join(repairTmp, '.agents', 'skills', 'custom-keep', 'SKILL.md'), '---\nname: custom-keep\ndescription: User custom skill, not generated by SKS.\n---\n');
  await writeTextAtomic(path.join(repairTmp, '.codex', 'skills', 'team', 'SKILL.md'), 'legacy mirror\n');
  await writeTextAtomic(path.join(repairTmp, '.codex', 'hooks.json'), '{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "tampered hook" }] }] } }\n');
  await writeTextAtomic(path.join(repairTmp, '.codex', 'SNEAKOSCOPE.md'), 'tampered quick reference\n');
  await writeJsonAtomic(path.join(repairTmp, '.sneakoscope', 'policy.json'), { broken: true });
  const existingAgentsMd = await safeReadText(path.join(repairTmp, 'AGENTS.md'));
  await writeTextAtomic(path.join(repairTmp, 'AGENTS.md'), existingAgentsMd.replace(/<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->[\s\S]*?<!-- END Sneakoscope Codex GX MANAGED BLOCK -->\n?/, '<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->\ntampered managed block\n<!-- END Sneakoscope Codex GX MANAGED BLOCK -->\n'));
  const doctorRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'doctor', '--fix', '--local-only', '--json'], {
    cwd: repairTmp,
    env: { HOME: path.join(repairTmp, 'home'), SKS_DISABLE_UPDATE_CHECK: '1' },
    timeoutMs: 30000,
    maxOutputBytes: 1024 * 1024
  });
  if (doctorRepair.code !== 0) throw new Error(`selftest: doctor --fix exited ${doctorRepair.code}: ${doctorRepair.stderr}`);
  const doctorRepairJson = JSON.parse(doctorRepair.stdout || '{}');
  if (!doctorRepairJson.repair?.applied || doctorRepairJson.install?.scope !== 'project' || !doctorRepairJson.install?.ok || !doctorRepairJson.install?.source_project) throw new Error('selftest: doctor scope');
  const repairedManifest = await readJson(path.join(repairTmp, '.sneakoscope', 'manifest.json'));
  if (repairedManifest.installation?.scope !== 'project' || repairedManifest.installation?.hook_command_prefix !== 'node ./bin/sks.mjs') throw new Error('selftest: manifest scope');
  const repairedCodexConfig = await safeReadText(path.join(repairTmp, '.codex', 'config.toml'));
  assertCodexWarn(repairedCodexConfig, 'doctor project config');
  const repairedTeamSkill = await safeReadText(path.join(repairTmp, '.agents', 'skills', 'team', 'SKILL.md'));
  if (!repairedTeamSkill.includes('SKS Team orchestration') || repairedTeamSkill.includes('tampered')) throw new Error('selftest: doctor repair did not regenerate team skill');
  if (await exists(path.join(repairTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'))) throw new Error('selftest: doctor repair did not remove deprecated agent-team alias skill');
  if (await exists(path.join(repairTmp, '.agents', 'skills', 'stale-sks-generated', 'SKILL.md'))) throw new Error('selftest: doctor repair did not prune stale generated skill from previous SKS manifest');
  for (const name of stalePluginSkillNames) {
    if (await exists(path.join(repairTmp, '.agents', 'skills', name, 'SKILL.md'))) throw new Error(`selftest: doctor repair left stale generated ${name} plugin shadow skill`);
  }
  if (await exists(path.join(repairTmp, staleCodexAgentRel))) throw new Error('selftest: doctor repair did not prune stale generated agent file from previous SKS manifest');
  if (!doctorRepairJson.repair?.project?.skill_install?.removed_stale_generated_skills?.includes('.agents/skills/stale-sks-generated')) throw new Error('selftest: stale skill report');
  const generatedCleanupReport = doctorRepairJson.repair?.project?.generated_cleanup || {};
  if (![...(generatedCleanupReport.pruned || []), ...(generatedCleanupReport.already_absent || [])].includes(staleCodexAgentRel)) throw new Error('selftest: stale file report');
  if (!(await exists(path.join(repairTmp, '.agents', 'skills', 'custom-keep', 'SKILL.md')))) throw new Error('selftest: doctor repair removed a user-owned custom skill');
  if (await exists(path.join(repairTmp, '.codex', 'skills', 'team', 'SKILL.md'))) throw new Error('selftest: doctor repair did not remove legacy .codex/skills');
  const repairedQuickReference = await safeReadText(path.join(repairTmp, '.codex', 'SNEAKOSCOPE.md'));
  if (!repairedQuickReference.includes('Install scope: `project`') || repairedQuickReference.includes('tampered')) throw new Error('selftest: doctor --fix did not regenerate quick reference');
  const repairedHooks = await safeReadText(path.join(repairTmp, '.codex', 'hooks.json'));
  if (!repairedHooks.includes('node ./bin/sks.mjs hook stop') || repairedHooks.includes('tampered hook')) throw new Error('selftest: doctor --fix did not regenerate Codex hooks');
  const repairedPolicy = await readJson(path.join(repairTmp, '.sneakoscope', 'policy.json'));
  if (repairedPolicy.broken || repairedPolicy.installation?.scope !== 'project' || !repairedPolicy.prompt_pipeline?.dollar_commands?.includes('$Team')) throw new Error('selftest: policy regen');
  const repairedAgentsMd = await safeReadText(path.join(repairTmp, 'AGENTS.md'));
  if (!repairedAgentsMd.includes('Do not create unrequested fallback implementation code') || repairedAgentsMd.includes('tampered managed block')) throw new Error('selftest: AGENTS regen');
  const doctorGlobalTmp = tmpdir();
  await writeJsonAtomic(path.join(doctorGlobalTmp, 'package.json'), { name: 'doctor-global-skill-repair-smoke', version: '0.0.0' });
  await initProject(doctorGlobalTmp, { installScope: 'global' });
  const doctorGlobalHome = path.join(doctorGlobalTmp, 'home');
  await ensureDir(path.join(doctorGlobalHome, '.codex'));
  await writeTextAtomic(path.join(doctorGlobalHome, '.codex', 'config.toml'), 'model = "gpt-5.5"\nmodel_reasoning_effort = "high"\nservice_tier = "fast"\n\n[features]\nplugins = false\napps = false\n');
  for (const name of stalePluginSkillNames) {
    await ensureDir(path.join(doctorGlobalHome, '.agents', 'skills', name));
    await writeTextAtomic(path.join(doctorGlobalHome, '.agents', 'skills', name, 'SKILL.md'), stalePluginSkillContent(name));
  }
  const doctorGlobalRepair = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'doctor', '--fix', '--json'], {
    cwd: doctorGlobalTmp,
    env: { HOME: doctorGlobalHome, SKS_DISABLE_UPDATE_CHECK: '1' },
    timeoutMs: 30000,
    maxOutputBytes: 1024 * 1024
  });
  if (doctorGlobalRepair.code !== 0) throw new Error(`selftest: doctor --fix global skill repair exited ${doctorGlobalRepair.code}: ${doctorGlobalRepair.stderr}`);
  const doctorGlobalRepairJson = JSON.parse(doctorGlobalRepair.stdout || '{}');
  const doctorGlobalCodexConfig = await safeReadText(path.join(doctorGlobalHome, '.codex', 'config.toml'));
  if (!doctorGlobalRepairJson.repair?.global_codex_config) throw new Error('selftest: doctor global config repair missing');
  assertCodexWarn(doctorGlobalCodexConfig, 'doctor global config');
  if (hasTopLevelCodexModeLock(doctorGlobalCodexConfig)) throw new Error('selftest: doctor global config repair left top-level model_reasoning_effort lock that can hide Codex App plugin UI');
  if (missingGeneratedCodexAppFeatureFlags(doctorGlobalCodexConfig).length || hasDeprecatedCodexHooksFeatureFlag(doctorGlobalCodexConfig) || !hasResearchProfileConfig(doctorGlobalCodexConfig)) throw new Error('selftest: doctor global config repair did not restore Codex App feature flags and Research xhigh profiles');
  for (const name of stalePluginSkillNames) {
    if (await exists(path.join(doctorGlobalHome, '.agents', 'skills', name, 'SKILL.md'))) throw new Error(`selftest: doctor --fix did not remove global generated ${name} plugin shadow skill`);
  }
  const doctorGlobalRemoved = doctorGlobalRepairJson.repair?.global_skills?.removed_stale_generated_skills || [];
  for (const name of stalePluginSkillNames) {
    if (!doctorGlobalRemoved.includes(`.agents/skills/${name}`)) throw new Error(`selftest: doctor --fix did not report global ${name} plugin shadow cleanup`);
  }
  const conflictTmp = tmpdir();
  await ensureDir(path.join(conflictTmp, '.omx'));
  const conflictScan = await scanHarnessConflicts(conflictTmp, { home: path.join(conflictTmp, 'home') });
  if (!conflictScan.hard_block || !formatHarnessConflictReport(conflictScan).includes('GPT-5.5')) throw new Error('selftest: OMX conflict did not block with cleanup prompt');
  const postinstallConflict = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: conflictTmp, env: { INIT_CWD: conflictTmp, HOME: path.join(conflictTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_SKIP_POSTINSTALL_GETDESIGN: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (postinstallConflict.code !== 0) throw new Error('selftest: postinstall conflict notice should not make npm install fail');
  const postinstallConflictOutput = String(`${postinstallConflict.stdout}\n${postinstallConflict.stderr}`);
  if (!postinstallConflictOutput.includes('SKS setup is blocked') || postinstallConflictOutput.includes('Cleanup prompt:')) throw new Error('selftest: postinstall conflict notice did not stay informational');
  const postinstallConflictPrompt = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: conflictTmp, input: 'y\n', env: { INIT_CWD: conflictTmp, HOME: path.join(conflictTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_SKIP_POSTINSTALL_GETDESIGN: '1', SKS_POSTINSTALL_PROMPT: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (postinstallConflictPrompt.code !== 0 || !String(postinstallConflictPrompt.stdout || '').includes('Goal: completely remove the conflicting Codex harnesses')) throw new Error('selftest: conflict prompt');
  const postinstallSetupTmp = tmpdir();
  await writeJsonAtomic(path.join(postinstallSetupTmp, 'package.json'), { name: 'postinstall-setup-smoke', version: '0.0.0' });
  await ensureDir(path.join(postinstallSetupTmp, '.git'));
  const postinstallSetupHome = path.join(postinstallSetupTmp, 'home');
  for (const name of stalePluginSkillNames) {
    await ensureDir(path.join(postinstallSetupHome, '.agents', 'skills', name));
    await writeTextAtomic(path.join(postinstallSetupHome, '.agents', 'skills', name, 'SKILL.md'), stalePluginSkillContent(name));
  }
  const postinstallSetup = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: postinstallSetupTmp, env: { INIT_CWD: postinstallSetupTmp, HOME: path.join(postinstallSetupTmp, 'home'), SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_SKIP_POSTINSTALL_GETDESIGN: '1', SKS_SKIP_CLI_TOOLS: '1' }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  if (postinstallSetup.code !== 0) throw new Error(`selftest: postinstall setup exited ${postinstallSetup.code}: ${postinstallSetup.stderr}`);
  if (await exists(path.join(postinstallSetupTmp, '.agents', 'skills', 'agent-team', 'SKILL.md'))) throw new Error('selftest: postinstall installed deprecated agent-team fallback skill');
  if (!String(postinstallSetup.stdout || '').includes('SKS bootstrap: auto-running sks setup --bootstrap --install-scope global --force') || !String(postinstallSetup.stdout || '').includes('SKS Ready')) throw new Error('selftest: postinstall bootstrap');
  if (!(await exists(path.join(postinstallSetupTmp, '.codex', 'hooks.json')))) throw new Error('selftest: postinstall did not create project hooks during automatic bootstrap');
  const postinstallSetupConfig = await safeReadText(path.join(postinstallSetupTmp, '.codex', 'config.toml'));
  if (missingGeneratedCodexAppFeatureFlags(postinstallSetupConfig).length || hasDeprecatedCodexHooksFeatureFlag(postinstallSetupConfig)) throw new Error('selftest: postinstall flags');
  assertCodexWarn(postinstallSetupConfig, 'postinstall project config');
  if (!String(postinstallSetup.stdout || '').includes('Codex App global $ skills: installed')) throw new Error('selftest: postinstall did not report automatic global Codex App skills');
  if (!String(postinstallSetup.stdout || '').includes('Removed stale generated skill shadow(s):')) throw new Error('selftest: postinstall did not report stale first-party plugin shadow cleanup');
  const postinstallSetupManifest = await readJson(path.join(postinstallSetupTmp, '.sneakoscope', 'manifest.json'));
  if (postinstallSetupManifest.installation?.scope !== 'global') throw new Error('selftest: postinstall automatic bootstrap did not use global install scope');
  if (postinstallSetupManifest.design_system_ssot?.authority_file !== DESIGN_SYSTEM_SSOT.authority_file || postinstallSetupManifest.design_system_ssot?.builder_prompt !== DESIGN_SYSTEM_SSOT.builder_prompt) throw new Error('selftest: design SSOT');
  if (!postinstallSetupManifest.recommended_design_references?.some((entry) => entry.id === 'getdesign' && entry.codex_skill_install === GETDESIGN_REFERENCE.codex_skill_install)) throw new Error('selftest: getdesign ref');
  if (!postinstallSetupManifest.recommended_design_references?.some((entry) => entry.id === AWESOME_DESIGN_MD_REFERENCE.id && entry.url === AWESOME_DESIGN_MD_REFERENCE.url)) throw new Error('selftest: design refs');
  for (const rel of ['.agents/skills/team/SKILL.md', '.codex/config.toml', '.codex/hooks.json', '.sneakoscope/harness-guard.json', '.codex/SNEAKOSCOPE.md', 'AGENTS.md', '.gitignore']) {
    if (!(await exists(path.join(postinstallSetupTmp, rel)))) throw new Error(`selftest: automatic postinstall bootstrap did not create ${rel}`);
  }
  const postinstallSetupGitignore = await safeReadText(path.join(postinstallSetupTmp, '.gitignore'));
  if (!postinstallSetupGitignore.includes('.sneakoscope/') || !postinstallSetupGitignore.includes('.codex/') || !postinstallSetupGitignore.includes('.agents/') || !postinstallSetupGitignore.includes('AGENTS.md')) throw new Error('selftest: postinstall gitignore');
  for (const skillName of new Set(DOLLAR_SKILL_NAMES)) {
    if (!(await exists(path.join(postinstallSetupTmp, 'home', '.agents', 'skills', skillName, 'SKILL.md')))) throw new Error(`selftest: postinstall global ${skillName} skill not installed`);
  }
  for (const name of stalePluginSkillNames) {
    if (await exists(path.join(postinstallSetupHome, '.agents', 'skills', name, 'SKILL.md'))) throw new Error(`selftest: postinstall global skills shadow the first-party ${name} plugin`);
  }
  if (!(await exists(path.join(postinstallSetupTmp, 'home', '.agents', 'skills', 'getdesign-reference', 'SKILL.md')))) throw new Error('selftest: postinstall global getdesign-reference skill not installed');
  const oldNoBootstrap = process.env.SKS_POSTINSTALL_NO_BOOTSTRAP;
  process.env.SKS_POSTINSTALL_NO_BOOTSTRAP = '1';
  const noBootstrapDecision = await postinstallBootstrapDecision(postinstallSetupTmp);
  if (oldNoBootstrap === undefined) delete process.env.SKS_POSTINSTALL_NO_BOOTSTRAP;
  else process.env.SKS_POSTINSTALL_NO_BOOTSTRAP = oldNoBootstrap;
  if (noBootstrapDecision.run || noBootstrapDecision.reason !== 'SKS_POSTINSTALL_NO_BOOTSTRAP=1') throw new Error('selftest: postinstall bootstrap opt-out decision');
  const postinstallNoMarkerTmp = tmpdir();
  const postinstallNoMarkerHome = path.join(postinstallNoMarkerTmp, 'home');
  const postinstallNoMarkerCwd = path.join(postinstallNoMarkerTmp, 'cwd');
  const postinstallNoMarkerGlobalRoot = path.join(postinstallNoMarkerTmp, 'global-root');
  await ensureDir(postinstallNoMarkerCwd);
  const postinstallNoMarker = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'postinstall'], { cwd: postinstallNoMarkerCwd, env: { INIT_CWD: postinstallNoMarkerCwd, HOME: postinstallNoMarkerHome, SKS_GLOBAL_ROOT: postinstallNoMarkerGlobalRoot, SKS_SKIP_POSTINSTALL_SHIM: '1', SKS_SKIP_POSTINSTALL_CONTEXT7: '1', SKS_SKIP_POSTINSTALL_GETDESIGN: '1', SKS_SKIP_CLI_TOOLS: '1' }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  if (postinstallNoMarker.code !== 0) throw new Error(`selftest: no-marker postinstall bootstrap exited ${postinstallNoMarker.code}: ${postinstallNoMarker.stderr}`);
  if (!String(postinstallNoMarker.stdout || '').includes('no project marker found; auto-running global SKS runtime bootstrap')) throw new Error('selftest: no-marker bootstrap');
  if (!(await exists(path.join(postinstallNoMarkerGlobalRoot, '.sneakoscope', 'manifest.json')))) throw new Error('selftest: no-marker postinstall did not bootstrap global runtime root');
  const postinstallNoMarkerConfig = await safeReadText(path.join(postinstallNoMarkerGlobalRoot, '.codex', 'config.toml'));
  if (missingGeneratedCodexAppFeatureFlags(postinstallNoMarkerConfig).length || hasDeprecatedCodexHooksFeatureFlag(postinstallNoMarkerConfig)) throw new Error('selftest: no-marker flags');
  assertCodexWarn(postinstallNoMarkerConfig, 'postinstall global runtime config');
  if (!hasResearchProfileConfig(postinstallNoMarkerConfig)) throw new Error('selftest: postinstall global runtime config did not restore Research xhigh profiles');
  if (await exists(path.join(postinstallNoMarkerCwd, '.sneakoscope'))) throw new Error('selftest: no-marker postinstall polluted install cwd');
  if (await exists(path.join(postinstallNoMarkerGlobalRoot, '.gitignore'))) throw new Error('selftest: global runtime bootstrap without project git wrote shared .gitignore');
  const bootstrapJsonTmp = tmpdir();
  await writeJsonAtomic(path.join(bootstrapJsonTmp, 'package.json'), { name: 'bootstrap-json-smoke', version: '0.0.0' });
  const bootstrapJson = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'bootstrap', '--json'], { cwd: bootstrapJsonTmp, env: { HOME: path.join(bootstrapJsonTmp, 'home'), SKS_SKIP_POSTINSTALL_GLOBAL_SKILLS: '1', SKS_SKIP_CLI_TOOLS: '1' }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  const bootstrapResult = JSON.parse(bootstrapJson.stdout);
  if (!bootstrapResult.project_setup?.ok || typeof bootstrapResult.ready !== 'boolean') throw new Error('selftest: bootstrap json did not report project setup and ready boolean');
  const depsCheck = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'deps', 'check', '--json'], { cwd: bootstrapJsonTmp, env: { HOME: path.join(bootstrapJsonTmp, 'home') }, timeoutMs: 20000, maxOutputBytes: 256 * 1024 });
  const depsResult = JSON.parse(depsCheck.stdout);
  if (!depsResult.node?.ok || !('tmux' in depsResult) || !('homebrew' in depsResult)) throw new Error('selftest: deps check json missing expected fields');
  const globalCwd = tmpdir();
  const globalRuntimeRoot = path.join(tmpdir(), 'sks-global-root');
  const globalRootProbe = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'root', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const globalRootResult = JSON.parse(globalRootProbe.stdout);
  if (globalRootResult.mode !== 'global' || globalRootResult.active_root !== globalRuntimeRoot || globalRootResult.project_root !== null) throw new Error('selftest: global root');
  const globalPipeline = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'pipeline', 'status', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const globalPipelineResult = JSON.parse(globalPipeline.stdout);
  if (globalPipelineResult.root !== globalRuntimeRoot) throw new Error('selftest: global pipeline root');
  const globalTeam = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'team', 'global path smoke', '--json'], { cwd: globalCwd, env: { SKS_GLOBAL_ROOT: globalRuntimeRoot }, timeoutMs: 30000, maxOutputBytes: 256 * 1024 });
  const globalTeamResult = JSON.parse(globalTeam.stdout);
  if (!String(globalTeamResult.mission_dir || '').startsWith(path.join(globalRuntimeRoot, '.sneakoscope', 'missions')) || !(await exists(path.join(globalRuntimeRoot, '.sneakoscope', 'manifest.json')))) throw new Error('selftest: global team root');
  if (await exists(path.join(globalCwd, '.sneakoscope'))) throw new Error('selftest: global runtime command polluted the caller cwd with .sneakoscope');
  const madProfilePath = path.join(tmp, 'mad-codex-config.toml');
  const madProfile = await enableMadHighProfile({ configPath: madProfilePath });
  const madProfileText = await safeReadText(madProfilePath);
  if (madProfile.profile_name !== 'sks-mad-high' || !madProfileText.includes('sandbox_mode = "danger-full-access"') || !madProfileText.includes('approval_policy = "never"') || !madProfileText.includes('approvals_reviewer = "auto_review"') || !madProfileText.includes('service_tier = "fast"') || !madProfile.launch_args.includes('--sandbox') || !madProfile.launch_args.includes('danger-full-access') || !madProfile.launch_args.includes('--ask-for-approval') || !madProfile.launch_args.includes('never') || !madProfileText.includes('model_reasoning_effort = "high"') || !madProfileText.includes('unrequested fallback implementation code')) throw new Error('selftest: MAD high profile is not Codex full-access high with fallback-code guard');
  if (!isMadHighLaunch(['--mad', '--high']) || isMadHighLaunch(['db', '--mad'])) throw new Error('selftest: MAD high launch flag parsing is not top-level only');
  const workspacePlan = { session: 'sks-mad-selftest', root: tmp, codexArgs: madProfile.launch_args };
  const tmuxSyntax = runTmuxLaunchPlanSyntaxCheck(workspacePlan);
  if (!tmuxSyntax.ok || !tmuxSyntax.command.includes('tmux attach-session -t sks-mad-selftest')) throw new Error('selftest: MAD tmux attach plan is not stable by session name');
  const tmuxOpenArgs = buildTmuxOpenArgs(workspacePlan);
  if (tmuxOpenArgs.join(' ') !== 'attach-session -t sks-mad-selftest') throw new Error('selftest: MAD tmux attach args are not stable by session name');
  const defaultFastHighPlan = await buildTmuxLaunchPlan({ root: tmp, tmux: { ok: true, bin: 'tmux', version: '3.4' }, codex: { bin: 'codex', version: 'codex-cli 99.0.0' }, app: { ok: true } });
  if (defaultFastHighPlan.codexArgs.join(' ') !== '--model gpt-5.5 -c service_tier="fast" -c model_reasoning_effort="high"') throw new Error('selftest: default sks tmux launch is not fast-high');
  const forcedModelPlan = await buildTmuxLaunchPlan({ root: tmp, env: { SKS_CODEX_MODEL: 'gpt-5.0-forbidden', SKS_CODEX_FAST_HIGH: '0', SKS_CODEX_REASONING: 'medium' }, tmux: { ok: true, bin: 'tmux', version: '3.4' }, codex: { bin: 'codex', version: 'codex-cli 99.0.0' }, app: { ok: true } });
  if (forcedModelPlan.codexArgs.includes('gpt-5.0-forbidden') || forcedModelPlan.codexArgs.join(' ') !== '--model gpt-5.5 -c service_tier="fast" -c model_reasoning_effort="medium"') throw new Error('selftest: sks tmux launch allowed a non-GPT-5.5 model override');
  const explicitBadModelPlan = await buildTmuxLaunchPlan({ root: tmp, codexArgs: ['--profile', 'legacy-forbidden-model', '--model', 'gpt-5.0-forbidden', '-c', 'model="gpt-5.0-forbidden"', '-c', 'model_reasoning_effort="low"'], tmux: { ok: true, bin: 'tmux', version: '3.4' }, codex: { bin: 'codex', version: 'codex-cli 99.0.0' }, app: { ok: true } });
  if (explicitBadModelPlan.codexArgs.join(' ').includes('gpt-5.0-forbidden') || explicitBadModelPlan.codexArgs.join(' ') !== '--model gpt-5.5 -c service_tier="fast" --profile legacy-forbidden-model -c model_reasoning_effort="low"') throw new Error('selftest: explicit tmux model override was not forced back to GPT-5.5');
  const codexExecArgs = buildCodexExecArgs({ root: tmp, prompt: 'model guard selftest', profile: 'legacy-forbidden-model', extraArgs: ['--model=gpt-5.0-forbidden', '--config', 'model = "gpt-5.0-forbidden"', '-c', 'model_reasoning_effort="medium"'] });
  if (codexExecArgs.join(' ').includes('gpt-5.0-forbidden') || !codexExecArgs.includes('gpt-5.5') || codexExecArgs.includes('--model=gpt-5.0-forbidden')) throw new Error('selftest: codex exec args allowed a non-GPT-5.5 model override');
  const researchExecArgs = buildCodexExecArgs({ root: tmp, prompt: 'research exec selftest', profile: 'sks-research', extraArgs: ['-c', 'service_tier="fast"', '-c', 'model_reasoning_effort="xhigh"'] });
  const researchExecJoined = researchExecArgs.join(' ');
  if (!researchExecJoined.includes('--profile sks-research') || !researchExecJoined.includes('--model gpt-5.5') || !researchExecJoined.includes('service_tier="fast"') || !researchExecJoined.includes('model_reasoning_effort="xhigh"')) throw new Error('selftest: research exec args did not force GPT-5.5 fast xhigh execution');
  await selftestCodexLb(tmp);
  if (!shouldAutoAttachTmux(['--mad'], {}, { stdin: { isTTY: true }, stdout: { isTTY: true } })) throw new Error('selftest: MAD tmux launch does not auto-attach in an interactive terminal');
  if (shouldAutoAttachTmux(['--mad', '--json'], {}, { stdin: { isTTY: true }, stdout: { isTTY: true } })) throw new Error('selftest: MAD tmux json mode should not auto-attach');
  if (shouldAutoAttachTmux(['--mad', '--no-attach'], {}, { stdin: { isTTY: true }, stdout: { isTTY: true } })) throw new Error('selftest: MAD tmux --no-attach should remain print-only');
  if (shouldAutoAttachTmux(['--mad'], { SKS_TMUX_NO_AUTO_ATTACH: '1' }, { stdin: { isTTY: true }, stdout: { isTTY: true } })) throw new Error('selftest: SKS_TMUX_NO_AUTO_ATTACH should disable tmux auto-attach');
  if (!isTmuxShellSession({ TMUX: '/tmp/tmux-501/default,1,0' })) throw new Error('selftest: tmux shell session env was not detected');
  if (tmuxStatusKind({ ok: false, bin: null }) !== 'missing') throw new Error('selftest: missing tmux was not labeled missing');
  const bareDefault = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs')], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: PACKAGE_VERSION, PATH: '' },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (bareDefault.code !== 1 || !String(bareDefault.stderr || '').includes('SKS tmux launch blocked') || String(bareDefault.stdout || '').includes('Usage:')) throw new Error('selftest: bare sks did not route to default tmux launch');
  const fakeCodexBin = path.join(tmp, 'fake-codex-bin');
  await ensureDir(fakeCodexBin);
  const fakeCodexPath = path.join(fakeCodexBin, 'codex');
  await writeTextAtomic(fakeCodexPath, '#!/bin/sh\necho "codex-cli 0.1.0"\n');
  await fsp.chmod(fakeCodexPath, 0o755);
  const codexUpdatePrompt = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs')], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: PACKAGE_VERSION, SKS_NPM_VIEW__OPENAI_CODEX_VERSION: '99.0.0', PATH: fakeCodexBin },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (!String(codexUpdatePrompt.stdout || '').includes('Codex CLI update available: 0.1.0 -> 99.0.0') || String(codexUpdatePrompt.stdout || '').includes('Usage:')) throw new Error('selftest: bare sks did not recommend Codex CLI update before tmux launch');
  const openClawAutoBin = path.join(tmp, 'openclaw-auto-bin');
  await ensureDir(openClawAutoBin);
  const openClawCodexPath = path.join(openClawAutoBin, 'codex');
  await writeTextAtomic(openClawCodexPath, '#!/bin/sh\necho "codex-cli 0.1.0"\n');
  await writeTextAtomic(path.join(openClawAutoBin, 'npm'), '#!/bin/sh\nDIR="${0%/*}"\nif [ "$1" = "i" ]; then\n  printf \'#!/bin/sh\\necho "codex-cli 99.0.0"\\n\' > "$DIR/codex"\n  chmod +x "$DIR/codex"\n  exit 0\nfi\necho "unexpected npm $*" >&2\nexit 1\n');
  await fsp.chmod(openClawCodexPath, 0o755);
  await fsp.chmod(path.join(openClawAutoBin, 'npm'), 0o755);
  const openClawAutoUpdate = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs')], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, SKS_OPENCLAW: '1', SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: PACKAGE_VERSION, SKS_NPM_VIEW__OPENAI_CODEX_VERSION: '99.0.0', PATH: openClawAutoBin },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (!String(openClawAutoUpdate.stdout || '').includes('Codex CLI ready: 0.1.0 -> codex-cli 99.0.0')) throw new Error('selftest: OpenClaw mode did not auto-approve Codex CLI update before tmux launch');
  const remoteControlBin = path.join(tmp, 'remote-control-bin');
  await ensureDir(remoteControlBin);
  await writeTextAtomic(path.join(remoteControlBin, 'codex'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 0.130.0"; exit 0; fi\nif [ "$1" = "remote-control" ]; then shift; for arg in "$@"; do if [ "$arg" = "--model" ]; then echo "remote-control rejects --model" >&2; exit 64; fi; done; echo "remote-control $*"; exit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(path.join(remoteControlBin, 'codex'), 0o755);
  const remoteControlStatus = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-app', 'remote-control', '--dry-run', '--json'], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, PATH: remoteControlBin },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (remoteControlStatus.code !== 0) throw new Error(`selftest: Codex remote-control status exited ${remoteControlStatus.code}: ${remoteControlStatus.stderr}`);
  const remoteControlJson = JSON.parse(remoteControlStatus.stdout);
  if (!remoteControlJson.ok || remoteControlJson.min_version !== '0.130.0' || !String(remoteControlJson.command || '').includes('remote-control')) throw new Error('selftest: Codex remote-control status did not report 0.130.0 readiness');
  const remoteControlLaunch = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-app', 'remote-control', '--', '--model', 'gpt-5.0-forbidden', '-c', 'model="gpt-5.0-forbidden"', '--example'], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, PATH: remoteControlBin },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  const remoteControlLaunchText = `${remoteControlLaunch.stdout}\n${remoteControlLaunch.stderr}`;
  if (remoteControlLaunch.code !== 0 || remoteControlLaunchText.includes('gpt-5.0-forbidden') || remoteControlLaunchText.includes('--model') || !remoteControlLaunchText.includes('-c model="gpt-5.5"')) throw new Error('selftest: Codex remote-control passthrough did not force GPT-5.5 with config syntax');
  const remoteControlOldBin = path.join(tmp, 'remote-control-old-bin');
  await ensureDir(remoteControlOldBin);
  await writeTextAtomic(path.join(remoteControlOldBin, 'codex'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli 0.129.0"; exit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(path.join(remoteControlOldBin, 'codex'), 0o755);
  const remoteControlOldStatus = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'codex-app', 'remote-control', '--dry-run'], {
    cwd: globalCwd,
    env: { SKS_GLOBAL_ROOT: globalRuntimeRoot, PATH: remoteControlOldBin },
    timeoutMs: 15000,
    maxOutputBytes: 64 * 1024
  });
  if (remoteControlOldStatus.code !== 1 || !String(`${remoteControlOldStatus.stdout}\n${remoteControlOldStatus.stderr}`).includes('Codex CLI 0.130.0+')) throw new Error('selftest: Codex remote-control did not block older Codex CLI versions');
  if (!COMMAND_CATALOG.find((entry) => entry.name === 'codex-app')?.usage.includes('remote-control')) throw new Error('selftest: codex-app command catalog does not advertise remote-control');
  const guardBlocked = await checkHarnessModification(tmp, { tool_name: 'apply_patch', command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' });
  if (guardBlocked.action !== 'block') throw new Error('selftest: harness guard allowed skill tampering');
  const setupBlocked = await checkHarnessModification(tmp, { command: 'sks setup --force' });
  if (setupBlocked.action !== 'block') throw new Error('selftest: harness guard allowed setup maintenance command');
  const appEditAllowed = await checkHarnessModification(tmp, { tool_name: 'apply_patch', command: '*** Update File: src/app.js\n+ok\n' });
  if (appEditAllowed.action === 'block') throw new Error('selftest: harness guard blocked app source edit');
  const sourceEditAllowed = await checkHarnessModification(packageRoot(), { tool_name: 'apply_patch', command: '*** Update File: src/core/init.mjs\n+ok\n' });
  if (sourceEditAllowed.action === 'block' || !(await isHarnessSourceProject(packageRoot()))) throw new Error('selftest: harness source exception not honored');
  const defaultHooks = await readJson(path.join(tmp, '.codex', 'hooks.json'));
  if (defaultHooks.hooks.PreToolUse[0].hooks[0].command !== 'sks hook pre-tool') throw new Error('selftest: global install hook command changed');
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
  if (!sharedHooks.user_key) throw new Error('selftest: hooks merge dropped root metadata');
  if (!sharedHooks.hooks.UserPromptSubmit.some((entry) => entry.hooks?.some((hook) => hook.command === 'node ./user-hook.mjs'))) throw new Error('selftest: hooks merge dropped user hook');
  if (JSON.stringify(sharedHooks).includes('node ./old/sks.mjs hook user-prompt-submit')) throw new Error('selftest: hooks merge kept stale SKS hook');
  if (sharedHooks.hooks.UserPromptSubmit.filter((entry) => entry.hooks?.some((hook) => hook.command === 'sks hook user-prompt-submit')).length !== 1) throw new Error('selftest: hooks merge did not install exactly one SKS prompt hook');
  const absoluteHookTmp = tmpdir();
  await initProject(absoluteHookTmp, { globalCommand: '/usr/local/bin/sks' });
  const absoluteHooks = await readJson(path.join(absoluteHookTmp, '.codex', 'hooks.json'));
  if (absoluteHooks.hooks.PreToolUse[0].hooks[0].command !== '/usr/local/bin/sks hook pre-tool') throw new Error('selftest: absolute global hook command missing');
  const projectScopeTmp = tmpdir();
  await initProject(projectScopeTmp, { installScope: 'project' });
  const projectHooks = await readJson(path.join(projectScopeTmp, '.codex', 'hooks.json'));
  if (projectHooks.hooks.PreToolUse[0].hooks[0].command !== 'node ./node_modules/sneakoscope/bin/sks.mjs hook pre-tool') throw new Error('selftest: project install hook command missing');
  const sourceHookTmp = tmpdir();
  await writeJsonAtomic(path.join(sourceHookTmp, 'package.json'), { name: 'sneakoscope', version: '0.0.0' });
  await ensureDir(path.join(sourceHookTmp, 'bin'));
  await ensureDir(path.join(sourceHookTmp, 'src', 'core'));
  await writeTextAtomic(path.join(sourceHookTmp, 'bin', 'sks.mjs'), '#!/usr/bin/env node\n');
  await writeTextAtomic(path.join(sourceHookTmp, 'src', 'core', 'init.mjs'), '');
  await writeTextAtomic(path.join(sourceHookTmp, 'src', 'core', 'hooks-runtime.mjs'), '');
  await initProject(sourceHookTmp, { installScope: 'global', globalCommand: '/usr/local/bin/sks' });
  const sourceHooks = await readJson(path.join(sourceHookTmp, '.codex', 'hooks.json'));
  if (sourceHooks.hooks.PreToolUse[0].hooks[0].command !== 'node ./bin/sks.mjs hook pre-tool') throw new Error('selftest: source repo hook command should use local bin');
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
  if (!versionStatus.ok || versionStatus.enabled || versionStatus.hook_installed) throw new Error('selftest: versioning hook should stay disabled after init');
  let versionHookText = await safeReadText(versionStatus.hook_path);
  if (versionHookText.includes('versioning pre-commit')) throw new Error('selftest: init installed versioning pre-commit');
  const versionHookAttempt = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'versioning', 'hook', '--json'], { cwd: versionTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (versionHookAttempt.code === 0 || !versionHookAttempt.stdout.includes('pre_commit_hooks_unsupported')) throw new Error('selftest: versioning hook command should be blocked');
  const versionBlockedStatus = await versioningStatus(versionTmp);
  if (versionBlockedStatus.enabled || versionBlockedStatus.hook_installed) throw new Error('selftest: blocked versioning hook changed status');
  versionHookText = await safeReadText(versionBlockedStatus.hook_path);
  if (versionHookText.includes('versioning pre-commit')) throw new Error('selftest: blocked versioning hook installed pre-commit command');
  await writeTextAtomic(path.join(versionTmp, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-05-08\n\n### Fixed\n\n- Initial version selftest fixture.\n');
  await writeTextAtomic(path.join(versionTmp, 'README.md'), 'version selftest\n');
  await runProcess('git', ['add', 'README.md', 'CHANGELOG.md'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const preCommitVerify = await runVersionPreCommit(versionTmp);
  if (!preCommitVerify.ok || !preCommitVerify.skipped || preCommitVerify.reason !== 'disabled_by_policy') throw new Error('selftest: pre-commit path should stay disabled by policy');
  const firstVersionBump = await bumpProjectVersion(versionTmp);
  if (!firstVersionBump.ok || firstVersionBump.version !== '0.1.1' || !firstVersionBump.changed) throw new Error('selftest: first version bump did not advance patch version');
  const bumpedPackage = await readJson(path.join(versionTmp, 'package.json'));
  const bumpedLock = await readJson(path.join(versionTmp, 'package-lock.json'));
  const bumpedChangelog = await safeReadText(path.join(versionTmp, 'CHANGELOG.md'));
  if (bumpedPackage.version !== '0.1.1' || bumpedLock.version !== '0.1.1' || bumpedLock.packages[''].version !== '0.1.1') throw new Error('selftest: package lock versions not synced');
  if (!bumpedChangelog.includes('## [0.1.1]') || !bumpedChangelog.includes('explicit SKS version bump')) throw new Error('selftest: version bump did not sync changelog section');
  const firstCached = await runProcess('git', ['diff', '--cached', '--name-only'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (!firstCached.stdout.includes('package.json') || !firstCached.stdout.includes('package-lock.json') || !firstCached.stdout.includes('CHANGELOG.md')) throw new Error('selftest: version files not staged');
  await runProcess('git', ['commit', '--no-verify', '-m', 'first versioned commit'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  await writeJsonAtomic(versionStatus.state_path, { schema_version: 1, last_version: '0.1.5', updated_at: nowIso(), pid: process.pid, changed: true });
  await writeTextAtomic(path.join(versionTmp, 'CHANGELOG.md'), 'collision selftest\n');
  await runProcess('git', ['add', 'CHANGELOG.md'], { cwd: versionTmp, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const collisionBump = await bumpProjectVersion(versionTmp);
  if (!collisionBump.ok || collisionBump.version !== '0.1.6') throw new Error('selftest: version collision state did not bump above last seen version');
  const localOnlyTmp = tmpdir();
  await ensureDir(path.join(localOnlyTmp, '.git'));
  await writeTextAtomic(path.join(localOnlyTmp, 'AGENTS.md'), 'existing local rules\n');
  await initProject(localOnlyTmp, { localOnly: true });
  const localExclude = await safeReadText(path.join(localOnlyTmp, '.git', 'info', 'exclude'));
  if (!localExclude.includes('.codex/') || !localExclude.includes('AGENTS.md')) throw new Error('selftest: local-only git excludes missing');
  if (await exists(path.join(localOnlyTmp, '.gitignore'))) throw new Error('selftest: local-only wrote shared .gitignore');
  const localAgents = await safeReadText(path.join(localOnlyTmp, 'AGENTS.md'));
  if (localAgents.trim() !== 'existing local rules') throw new Error('selftest: local-only modified existing AGENTS.md');
  const localManifest = await readJson(path.join(localOnlyTmp, '.sneakoscope', 'manifest.json'));
  if (!localManifest.git?.local_only) throw new Error('selftest: local-only manifest missing');
  const gitignoreTmp = tmpdir();
  await writeTextAtomic(path.join(gitignoreTmp, '.gitignore'), 'node_modules/\n.sneakoscope/\n');
  await initProject(gitignoreTmp, {});
  const gitignoreText = await safeReadText(path.join(gitignoreTmp, '.gitignore'));
  if (!gitignoreText.includes('node_modules/') || !gitignoreText.includes('# BEGIN Sneakoscope Codex generated files') || !gitignoreText.includes('.codex/') || !gitignoreText.includes('.agents/') || !gitignoreText.includes('AGENTS.md')) throw new Error('selftest: shared .gitignore did not preserve existing entries and add SKS patterns');
  await initProject(gitignoreTmp, {});
  const gitignoreTextSecond = await safeReadText(path.join(gitignoreTmp, '.gitignore'));
  if ((gitignoreTextSecond.match(/BEGIN Sneakoscope Codex generated files/g) || []).length !== 1) throw new Error('selftest: shared .gitignore managed block duplicated');
  const managedAgentsTmp = tmpdir();
  await ensureDir(path.join(managedAgentsTmp, '.git'));
  await writeTextAtomic(path.join(managedAgentsTmp, 'AGENTS.md'), '<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->\nold managed rules\n<!-- END Sneakoscope Codex GX MANAGED BLOCK -->\n');
  await initProject(managedAgentsTmp, { localOnly: true });
  const managedAgents = await safeReadText(path.join(managedAgentsTmp, 'AGENTS.md'));
  if (!managedAgents.includes('TriWiki is the context-tracking SSOT') || managedAgents.includes('old managed rules')) throw new Error('selftest: local-only did not refresh managed AGENTS.md block');
  if (!isTransientNpmBinPath('/tmp/.npm/_npx/abc/node_modules/.bin/sks')) throw new Error('selftest: npx bin path not recognized as transient');
  if (!isTransientNpmBinPath('/tmp/.npm-cache/_cacache/tmp/git-cloneabc/bin/sks.mjs')) throw new Error('selftest: npm cache git clone path not recognized as transient');
  if (isTransientNpmBinPath('/usr/local/bin/sks')) throw new Error('selftest: stable global bin marked transient');
  const oldPath = process.env.PATH;
  const oldSksBin = process.env.SKS_BIN;
  const fakeNpxBin = path.join(tmp, '.npm', '_npx', 'abc', 'node_modules', '.bin');
  await ensureDir(fakeNpxBin);
  await writeJsonAtomic(path.join(fakeNpxBin, 'sks'), { fake: true });
  try {
    process.env.PATH = fakeNpxBin;
    delete process.env.SKS_BIN;
    const discovered = await discoverGlobalSksCommand();
    if (isTransientNpmBinPath(discovered)) throw new Error('selftest: transient npx bin selected as global command');
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldSksBin === undefined) delete process.env.SKS_BIN;
    else process.env.SKS_BIN = oldSksBin;
  }
  const shimTmp = tmpdir();
  const shimDir = path.join(shimTmp, 'bin');
  const shimResult = await ensureSksCommandDuringInstall({ force: true, pathEnv: shimDir, home: shimTmp, target: path.join(packageRoot(), 'bin', 'sks.mjs'), nodeBin: process.execPath });
  if (shimResult.status !== 'created' || !(await exists(path.join(shimDir, process.platform === 'win32' ? 'sks.cmd' : 'sks')))) throw new Error('selftest: sks command shim not created');
  const globalSkillsTmp = tmpdir();
  const globalSkillsResult = await ensureGlobalCodexSkillsDuringInstall({ force: true, home: globalSkillsTmp });
  if (globalSkillsResult.status !== 'installed') throw new Error(`selftest: global Codex App skills not installed: ${globalSkillsResult.status}`);
  const globalSkillStatus = await checkRequiredSkills(globalSkillsTmp, path.join(globalSkillsTmp, '.agents', 'skills'));
  if (!globalSkillStatus.ok) throw new Error(`selftest: global Codex App skills missing: ${globalSkillStatus.missing.join(', ')}`);
  if (await exists(path.join(globalSkillsTmp, '.agents', 'skills', 'computer-use', 'SKILL.md'))) throw new Error('selftest: global generated skills shadow the first-party computer-use plugin');
  const codexSkillMirrorExists = await exists(path.join(tmp, '.codex', 'skills', 'research-discovery', 'SKILL.md'));
  if (codexSkillMirrorExists) throw new Error('selftest: generated .codex/skills mirror still installed');
  const codexAppSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'research-discovery', 'SKILL.md'));
  if (!codexAppSkillExists) throw new Error('selftest: Codex App skill not installed');
  for (const skillName of new Set(DOLLAR_SKILL_NAMES)) {
    const dollarSkillExists = await exists(path.join(tmp, '.agents', 'skills', skillName, 'SKILL.md'));
    if (!dollarSkillExists) throw new Error(`selftest: ${skillName} skill not installed`);
  }
  if (await exists(path.join(tmp, '.agents', 'skills', 'computer-use', 'SKILL.md'))) throw new Error('selftest: project generated skills shadow the first-party computer-use plugin');
  const promptPipelineSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'prompt-pipeline', 'SKILL.md'));
  if (!promptPipelineSkillExists) throw new Error('selftest: prompt pipeline skill not installed');
  const promptPipelineText = await safeReadText(path.join(tmp, '.agents', 'skills', 'prompt-pipeline', 'SKILL.md'));
  if (!promptPipelineText.includes('TriWiki context-tracking SSOT')) throw new Error('selftest: prompt pipeline missing TriWiki context-tracking SSOT');
  if (!promptPipelineText.includes('Codex App pipeline activation:') || !promptPipelineText.includes('sks hook user-prompt-submit') || !promptPipelineText.includes('hookSpecificOutput.additionalContext')) throw new Error('selftest: prompt pipeline missing Codex App pipeline activation fallback');
  const teamSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'team', 'SKILL.md'));
  if (!teamSkillText.includes('Codex App pipeline activation:') || !teamSkillText.includes('sks pipeline status') || !teamSkillText.includes('mission/pipeline artifacts')) throw new Error('selftest: Team skill missing pipeline activation fallback');
  if (!promptPipelineText.includes('before every route stage') || !promptPipelineText.includes('sks wiki refresh')) throw new Error('selftest: prompt pipeline missing per-stage TriWiki policy');
  if (!promptPipelineText.includes('single design decision authority') || !promptPipelineText.includes('imagegen') || !promptPipelineText.includes('getdesign-reference') || !promptPipelineText.includes(AWESOME_DESIGN_MD_REFERENCE.url) || !promptPipelineText.includes('not parallel authorities')) throw new Error('selftest: prompt pipeline missing design SSOT/source-input routing');
  if (!promptPipelineText.includes(CODEX_APP_IMAGE_GENERATION_DOC_URL) || !promptPipelineText.includes(CODEX_IMAGEGEN_REQUIRED_POLICY)) throw new Error('selftest: prompt pipeline missing Codex App image generation policy');
  if (!promptPipelineText.includes('From-Chat-IMG') || !promptPipelineText.includes('Do not assume ordinary image prompts are chat captures')) throw new Error('selftest: prompt pipeline missing explicit From-Chat-IMG gating');
  const fromChatImgSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'from-chat-img', 'SKILL.md'));
  if (!fromChatImgSkillText.includes('normal Team pipeline') || !fromChatImgSkillText.includes('Codex Computer Use visual inspection') || !fromChatImgSkillText.includes(CODEX_COMPUTER_USE_ONLY_POLICY) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT) || !fromChatImgSkillText.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest: from-chat-img skill missing Team/Computer Use-only inspection checklist guidance');
  if (fromChatImgSkillText.includes('Computer Use/browser visual inspection')) throw new Error('selftest: from-chat-img skill still allows browser visual inspection wording');
  const fromChatImgSkillMeta = await safeReadText(path.join(tmp, '.agents', 'skills', 'from-chat-img', 'agents', 'openai.yaml'));
  if (!fromChatImgSkillMeta.includes('model_reasoning_effort: xhigh')) throw new Error('selftest: from-chat-img skill metadata is not xhigh');
  for (const supportSkill of ['reasoning-router', 'pipeline-runner', 'context7-docs', 'seo-geo-optimizer', 'reflection', 'design-system-builder', 'design-ui-editor', 'getdesign-reference', 'imagegen', 'image-ux-review', 'visual-review', 'ui-ux-review']) {
    if (!(await exists(path.join(tmp, '.agents', 'skills', supportSkill, 'SKILL.md')))) throw new Error(`selftest: ${supportSkill} skill not installed`);
  }
  const imagegenSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'imagegen', 'SKILL.md'));
  if (!imagegenSkillText.includes(CODEX_APP_IMAGE_GENERATION_DOC_URL) || !imagegenSkillText.includes('$imagegen') || !imagegenSkillText.includes('gpt-image-2') || !imagegenSkillText.includes('Direct API fallback does not satisfy SKS route evidence') || !imagegenSkillText.includes(CODEX_IMAGEGEN_REQUIRED_POLICY)) throw new Error('selftest: imagegen skill missing official Codex App image generation priority');
  const imageUxReviewSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'image-ux-review', 'SKILL.md'));
  if (!imageUxReviewSkillText.includes('gpt-image-2') || !imageUxReviewSkillText.includes('$imagegen') || !imageUxReviewSkillText.includes('generated annotated review image') || !imageUxReviewSkillText.includes('Text-only screenshot critique cannot satisfy this route') || !imageUxReviewSkillText.includes(IMAGE_UX_REVIEW_GATE_ARTIFACT) || !imageUxReviewSkillText.includes(IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT) || !imageUxReviewSkillText.includes(CODEX_IMAGEGEN_REQUIRED_POLICY)) throw new Error('selftest: image-ux-review skill missing gpt-image-2 generated-image review gate guidance');
  const getdesignSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'getdesign-reference', 'SKILL.md')); if (!getdesignSkillText.includes(AWESOME_DESIGN_MD_REFERENCE.url) || !getdesignSkillText.includes('only design decision SSOT') || !getdesignSkillText.includes('source inputs')) throw new Error('selftest: getdesign-reference skill missing design SSOT source-input guidance');
  const designSystemBuilderSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'design-system-builder', 'SKILL.md')); if (!designSystemBuilderSkillText.includes(AWESOME_DESIGN_MD_REFERENCE.url) || !designSystemBuilderSkillText.includes('Fuse those inputs into one design.md SSOT') || !designSystemBuilderSkillText.includes('competing authorities')) throw new Error('selftest: design-system-builder skill missing fused design SSOT guidance');
  const designSysPromptText = await safeReadText(path.join(packageRoot(), 'docs', 'Design-Sys-Prompt.md')); if (!designSysPromptText.includes('Design SSOT contract') || !designSysPromptText.includes('builder prompt') || !designSysPromptText.includes('not a competing design authority')) throw new Error('selftest: Design-Sys-Prompt missing design SSOT contract');
  if (!(await exists(path.join(tmp, '.agents', 'skills', 'reasoning-router', 'agents', 'openai.yaml')))) throw new Error('selftest: skill metadata missing');
  const hookGuardPayload = JSON.stringify({ cwd: tmp, tool_name: 'apply_patch', command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' });
  const hookGuardResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'pre-tool'], { cwd: tmp, input: hookGuardPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const hookGuardJson = JSON.parse(hookGuardResult.stdout);
  if (hookGuardJson.decision !== 'block' || !String(hookGuardJson.reason || '').includes('harness guard')) throw new Error('selftest: hook did not block harness tampering');
  const camelHookGuardPayload = JSON.stringify({ cwd: tmp, toolName: 'apply_patch', toolInput: { command: '*** Update File: .agents/skills/team/SKILL.md\n+tamper\n' } });
  const camelHookGuardResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'pre-tool'], { cwd: tmp, input: camelHookGuardPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const camelHookGuardJson = JSON.parse(camelHookGuardResult.stdout);
  if (camelHookGuardJson.decision !== 'block') throw new Error('selftest: hook did not block camelCase Codex tool payload');
  await setCurrent(tmp, { mode: 'QALOOP', phase: 'QALOOP_RUNNING_NO_QUESTIONS', route: 'QALoop', implementation_allowed: true });
  const codexGitPermissionResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'permission-request'], { cwd: tmp, input: JSON.stringify({ cwd: tmp, command: 'git push origin dev', action: 'Codex App Git Actions Push' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const codexGitPermissionJson = JSON.parse(codexGitPermissionResult.stdout);
  if (codexGitPermissionJson.hookSpecificOutput?.decision?.behavior === 'deny') throw new Error('selftest: Codex App git push permission was denied during no-question mode');
  const codexGitForcePermissionResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'permission-request'], { cwd: tmp, input: JSON.stringify({ cwd: tmp, command: 'git push --force origin dev', action: 'Codex App Git Actions Push' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  const codexGitForcePermissionJson = JSON.parse(codexGitForcePermissionResult.stdout);
  if (codexGitForcePermissionJson.hookSpecificOutput?.decision?.behavior !== 'deny') throw new Error('selftest: force-push permission should stay denied during no-question mode');
  if (new Set(DOLLAR_COMMANDS.map((c) => c.command)).size !== DOLLAR_COMMANDS.length) throw new Error('selftest: duplicate dollar commands');
  if (!DOLLAR_COMMAND_ALIASES.some((alias) => alias.canonical === '$QA-LOOP' && alias.app_skill === '$qa-loop')) throw new Error('selftest: $QA-LOOP picker skill missing');
  if (!DOLLAR_COMMAND_ALIASES.some((alias) => alias.canonical === '$Team' && alias.app_skill === '$from-chat-img')) throw new Error('selftest: $From-Chat-IMG picker skill missing');
  if (!DOLLAR_COMMAND_ALIASES.some((alias) => alias.canonical === '$Image-UX-Review' && alias.app_skill === '$visual-review')) throw new Error('selftest: $Image-UX-Review picker alias missing');
  if (!DOLLAR_COMMANDS.some((entry) => entry.command === '$From-Chat-IMG')) throw new Error('selftest: $From-Chat-IMG missing from dollar command list');
  if (!DOLLAR_COMMANDS.some((entry) => entry.command === '$Image-UX-Review') || !DOLLAR_COMMANDS.some((entry) => entry.command === '$UX-Review')) throw new Error('selftest: Image UX Review missing from dollar command list');
  if (DOLLAR_COMMAND_ALIASES.some((alias) => ['$agent-team', '$qaloop', '$wiki-refresh', '$wikirefresh'].includes(alias.app_skill))) throw new Error('selftest: duplicate picker aliases still present');
  if (routePrompt('$agent-team run specialists')) throw new Error('selftest: deprecated $agent-team route still resolved');
  if (routePrompt('$QA-LOOP run UI E2E')?.id !== 'QALoop' || routePrompt('$QALoop deployed smoke')) throw new Error('selftest: QA-LOOP route is not standardized to $QA-LOOP');
  if (routePrompt('[$qa-loop](/tmp/qa-loop/SKILL.md) localhost UI 검증, Codex Computer Use만 사용')?.id !== 'QALoop') throw new Error('selftest: markdown-linked $QA-LOOP was hijacked by heuristic routing');
  if (stripVisibleDecisionAnswerBlocks('qa-loop [GOAL_PRECISE: local QA QA_SCOPE: ui_e2e_only TARGET_BASE_URL: http://localhost:3000] 다시 실행').includes('GOAL_PRECISE')) throw new Error('selftest: visible decision answer block sanitizer did not remove slot payload');
  if (routePrompt('[$research](/tmp/research/SKILL.md) Codex Computer Use 도구 노출 문제를 QA루프 관점에서 연구')?.id !== 'Research') throw new Error('selftest: markdown-linked $Research was not treated as explicit route');
  if (routePrompt('$WikiRefresh 갱신')) throw new Error('selftest: deprecated $WikiRefresh route still resolved');
  if (routePrompt('$MAD-SKS Supabase MCP main 작업')?.id !== 'MadSKS') throw new Error('selftest: $MAD-SKS route did not resolve');
  if (routePrompt('$MAD-SKS 버튼 라벨만 바꿔줘')?.id === 'DFix') throw new Error('selftest: $MAD-SKS tiny label fix incorrectly routed to DFix');
  if (routePrompt('$MAD-SKS $Team Supabase MCP main 작업')?.id !== 'Team') throw new Error('selftest: $MAD-SKS did not compose with $Team');
  if (routePrompt('$MAD-SKS $Team 버튼 라벨만 바꿔줘')?.id !== 'Team') throw new Error('selftest: $MAD-SKS $Team tiny fix did not stay on Team route');
  if (routePrompt('$DB Supabase 점검 $MAD-SKS')?.id !== 'DB') throw new Error('selftest: trailing $MAD-SKS changed primary route');
  if (routePrompt('Fix the typo in README')?.id !== 'DFix') throw new Error('selftest: inferred typo Direct Fix did not route to DFix');
  if (routePrompt('Update the package version to 1.2.3')?.id !== 'DFix') throw new Error('selftest: inferred package-version Direct Fix did not route to DFix');
  if (routePrompt('package.json version만 1.2.3으로 바꿔줘')?.id !== 'DFix') throw new Error('selftest: inferred package.json version Direct Fix did not route to DFix');
  if (routePrompt('How do I fix the typo in README?')?.id !== 'Answer') throw new Error('selftest: how-to Direct Fix question did not route to Answer');
  if (routePrompt('How do I change README title?')?.id !== 'Answer') throw new Error('selftest: how-to README title question did not route to Answer');
  if (routePrompt('How do I make a settings page?')?.id !== 'Answer') throw new Error('selftest: how-to create question did not route to Answer');
  if (routePrompt('How to create a new form component?')?.id !== 'Answer') throw new Error('selftest: how-to form component question did not route to Answer');
  if (routePrompt('How can I build a modal?')?.id !== 'Answer') throw new Error('selftest: how-can-I build question did not route to Answer');
  if (routePrompt('Make a button')?.id !== 'Team') throw new Error('selftest: create-style button work did not route to Team');
  if (routePrompt('Make a button that submits the form')?.id !== 'Team') throw new Error('selftest: form button creation did not route to Team');
  if (routePrompt('Change button to submit the form')?.id !== 'Team') throw new Error('selftest: form button behavior change did not route to Team');
  if (routePrompt('버튼이 폼 제출하게 바꿔줘')?.id !== 'Team') throw new Error('selftest: Korean form button behavior change did not route to Team');
  if (routePrompt('Can you change the button to submit the form?')?.id !== 'Team') throw new Error('selftest: polite form button behavior request did not route to Team');
  if (routePrompt('Change button label to Submit')?.id !== 'DFix') throw new Error('selftest: button label Direct Fix did not route to DFix');
  if (routePrompt('Change button text to Submit')?.id !== 'DFix') throw new Error('selftest: button text Direct Fix did not route to DFix');
  if (routePrompt('Can you change the button label to Save?')?.id !== 'DFix') throw new Error('selftest: polite button label Direct Fix did not route to DFix');
  if (routePrompt('Make README generator work')?.id !== 'Team') throw new Error('selftest: README generator implementation did not route to Team');
  const imageUxRoute = routePrompt('$Image-UX-Review localhost 화면 검수');
  if (imageUxRoute?.id !== 'ImageUXReview') throw new Error('selftest: $Image-UX-Review did not route to ImageUXReview');
  if (routePrompt('$UX-Review 스크린샷 gpt-image-2 콜아웃 리뷰')?.id !== 'ImageUXReview') throw new Error('selftest: $UX-Review did not route to ImageUXReview');
  if (routePrompt('UI UX를 gpt-image-2 이미지 생성 콜아웃으로 리뷰해줘')?.id !== 'ImageUXReview') throw new Error('selftest: image-generation UI/UX review prompt did not route to ImageUXReview');
  if (routeRequiresSubagents(imageUxRoute, '$Image-UX-Review localhost 화면 검수')) throw new Error('selftest: ImageUXReview route should not require subagents');
  if (!reflectionRequiredForRoute(imageUxRoute)) throw new Error('selftest: ImageUXReview route should require reflection');
  const madStandaloneTmp = tmpdir();
  await initProject(madStandaloneTmp, {});
  const madStandalonePayload = JSON.stringify({ cwd: madStandaloneTmp, prompt: '$MAD-SKS main 권한 열어줘' });
  const madStandaloneResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'user-prompt-submit'], { cwd: madStandaloneTmp, input: madStandalonePayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (madStandaloneResult.code !== 0) throw new Error(`selftest: standalone MAD-SKS hook exited ${madStandaloneResult.code}: ${madStandaloneResult.stderr}`);
  const madStandaloneState = await readJson(stateFile(madStandaloneTmp), {});
  if (madStandaloneState.mode !== 'MADSKS' || madStandaloneState.mad_sks_active !== true || madStandaloneState.mad_sks_gate_file !== 'mad-sks-gate.json' || madStandaloneState.normal_db_writes_allowed !== true || madStandaloneState.live_server_writes_allowed !== true || madStandaloneState.migration_apply_allowed !== true) throw new Error('selftest: standalone MAD-SKS auto-seal did not activate live full-access scoped permissions');
  const madStandaloneWrite = 'cre' + 'ate table mad_selftest (id uuid primary key);';
  const madStandaloneCreateDecision = await checkDbOperation(madStandaloneTmp, madStandaloneState, { ['tool' + '_name']: 'mcp__data' + 'base__execute_' + 'sql', ['s' + 'ql']: madStandaloneWrite }, { duringNoQuestion: false });
  if (madStandaloneCreateDecision.action !== 'allow') throw new Error('selftest: standalone MAD-SKS did not allow ordinary DDL');
  const madModifierTmp = tmpdir();
  await initProject(madModifierTmp, {});
  const madModifierPayload = JSON.stringify({ cwd: madModifierTmp, prompt: '$MAD-SKS $Team 회전 아스키 아트는 제일 처음 인증 안됐을때만 codex cli처럼 애니메이션으로 보이게 하고 tmux에서는 정적 3d 아스키 아트로 보여줘' });
  const madModifierResult = await runProcess(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), 'hook', 'user-prompt-submit'], { cwd: madModifierTmp, input: madModifierPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (madModifierResult.code !== 0) throw new Error(`selftest: MAD-SKS Team hook exited ${madModifierResult.code}: ${madModifierResult.stderr}`);
  const madModifierState = await readJson(stateFile(madModifierTmp), {});
  if (madModifierState.mode !== 'TEAM' || madModifierState.mad_sks_active !== true || madModifierState.mad_sks_gate_file !== 'team-gate.json' || madModifierState.normal_db_writes_allowed !== true || madModifierState.live_server_writes_allowed !== true || madModifierState.migration_apply_allowed !== true) throw new Error('selftest: MAD-SKS Team auto-seal did not activate live full-access scoped permissions');
  if (routePrompt('위키 갱신해줘')?.id !== 'Wiki') throw new Error('selftest: wiki refresh text did not route to Wiki');
  const koreanReadmeInstallPrompt = '리드미에 Codex App에서도 $ 표기 쓰는 법을 알려줘야지. 설치단계에서 바로 보이게 해줘야지';
  if (routePrompt(koreanReadmeInstallPrompt)?.id !== 'Team') throw new Error('selftest: Korean README implementation prompt did not route to Team by default');
  if (looksLikeAnswerOnlyRequest(koreanReadmeInstallPrompt)) throw new Error('selftest: Korean README implementation prompt still looked answer-only');
  if (routePrompt('왜 팀 커맨드 없어졌어 병렬처리까지 제대로 작업해줘')?.id !== 'Team') throw new Error('selftest: Korean Team/parallel implementation prompt did not route to Team');
  if (routePrompt('$From-Chat-IMG 채팅내역 이미지와 첨부 원본 이미지로 수정 작업 지시서 작성')?.id !== 'Team') throw new Error('selftest: $From-Chat-IMG did not route to Team');
  if (routePrompt('From-Chat-IMG 채팅내역 이미지와 원본 첨부 이미지 분석해서 작업 지시서 만들어줘')?.id !== 'Team') throw new Error('selftest: bare From-Chat-IMG signal did not route to Team');
  if (routePrompt('채팅 이미지랑 첨부 이미지 분석 방식 설명해줘')?.id === 'Team') throw new Error('selftest: ordinary chat-image question activated Team without From-Chat-IMG');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$Team')) throw new Error('selftest: dollar-commands missing Team default routing guidance');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$From-Chat-IMG')) throw new Error('selftest: dollar-commands missing From-Chat-IMG guidance');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$MAD-SKS')) throw new Error('selftest: dollar-commands missing MAD-SKS scoped override guidance');
  if (!DOLLAR_DEFAULT_PIPELINE_TEXT.includes('$Image-UX-Review')) throw new Error('selftest: dollar-commands missing Image UX Review guidance');
  if (!COMMAND_CATALOG.some((c) => c.name === 'context7') || !COMMAND_CATALOG.some((c) => c.name === 'pipeline') || !COMMAND_CATALOG.some((c) => c.name === 'qa-loop') || !COMMAND_CATALOG.some((c) => c.name === 'image-ux-review') || !COMMAND_CATALOG.some((c) => c.name === 'root') || !COMMAND_CATALOG.some((c) => c.name === 'openclaw')) throw new Error('selftest: context7/pipeline/qa-loop/image-ux-review/root/openclaw commands missing from catalog');
  const openClawTmp = tmpdir();
  const openClawResult = await installOpenClawSkill({ targetDir: path.join(openClawTmp, 'skills', OPENCLAW_SKILL_NAME) });
  if (!openClawResult.ok) throw new Error(`selftest: OpenClaw skill install blocked: ${openClawResult.reason}`);
  const openClawSkillText = await safeReadText(path.join(openClawResult.target_dir, 'SKILL.md'));
  const openClawManifestText = await safeReadText(path.join(openClawResult.target_dir, 'manifest.yaml'));
  const openClawConfigText = await safeReadText(path.join(openClawResult.target_dir, 'openclaw-agent-config.example.yaml'));
  if (!openClawSkillText.includes('sks root') || !openClawSkillText.includes('$Team') || !openClawSkillText.includes('OpenClaw agent must have the built-in `shell` tool enabled') || !openClawSkillText.includes('SKS_OPENCLAW=1')) throw new Error('selftest: OpenClaw skill missing SKS agent guidance');
  if (!openClawManifestText.includes('generated_by: sneakoscope') || !openClawManifestText.includes(`version: ${PACKAGE_VERSION}`)) throw new Error('selftest: OpenClaw manifest missing generated marker or version');
  if (!openClawConfigText.includes(`- ${OPENCLAW_SKILL_NAME}`) || !openClawConfigText.includes('- shell') || !openClawConfigText.includes('SKS_OPENCLAW')) throw new Error('selftest: OpenClaw agent config example missing skill, shell tool, or OpenClaw env');
  const registryDollarCommands = DOLLAR_COMMANDS.map((c) => c.command);
  const manifest = await readJson(path.join(tmp, '.sneakoscope', 'manifest.json'));
  const policy = await readJson(path.join(tmp, '.sneakoscope', 'policy.json'));
  const manifestDollarCommands = manifest.prompt_pipeline?.dollar_commands || [];
  const policyDollarCommands = policy.prompt_pipeline?.dollar_commands || [];
  if (JSON.stringify(manifestDollarCommands) !== JSON.stringify(registryDollarCommands)) throw new Error('selftest: manifest dollar command drift');
  if (JSON.stringify(policyDollarCommands) !== JSON.stringify(registryDollarCommands)) throw new Error('selftest: policy dollar command drift');
  if (!manifest.harness_guard?.immutable_to_llm_edits || !policy.harness_guard?.immutable_to_llm_edits) throw new Error('selftest: harness guard missing from manifest/policy');
  if (manifest.llm_wiki?.ssot !== 'triwiki' || policy.llm_wiki?.ssot !== 'triwiki') throw new Error('selftest: TriWiki context tracking not recorded in manifest/policy');
  const codexAppQuickRefExists = await exists(path.join(tmp, '.codex', 'SNEAKOSCOPE.md'));
  if (!codexAppQuickRefExists) throw new Error('selftest: Codex App quick reference missing');
  const codexAppQuickRefText = await safeReadText(path.join(tmp, '.codex', 'SNEAKOSCOPE.md'));
  if (!codexAppQuickRefText.includes('dollar-commands')) throw new Error('selftest: quickref commands');
  if (!codexAppQuickRefText.includes('Context Tracking') || !codexAppQuickRefText.includes('TriWiki')) throw new Error('selftest: quickref TriWiki');
  if (!codexAppQuickRefText.includes('Before each route phase') || !codexAppQuickRefText.includes('every stage')) throw new Error('selftest: quickref stage policy');
  for (const { command } of DOLLAR_COMMANDS) {
    if (!codexAppQuickRefText.includes(command)) throw new Error(`selftest: Codex App quick reference missing ${command}`);
  }
  const hookGoalTmp = tmpdir();
  await initProject(hookGoalTmp, {});
  const hookBin = path.join(packageRoot(), 'bin', 'sks.mjs');
  await selftestCodexCommitHooks();
  const hookImageUxTmp = tmpdir();
  await initProject(hookImageUxTmp, {});
  const hookImageUxPayload = JSON.stringify({ cwd: hookImageUxTmp, prompt: '$Image-UX-Review localhost 화면을 gpt-image-2 콜아웃 리뷰로 검수해줘' });
  const hookImageUxResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookImageUxTmp, input: hookImageUxPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookImageUxResult.code !== 0) throw new Error(`selftest: $Image-UX-Review hook exited ${hookImageUxResult.code}: ${hookImageUxResult.stderr}`);
  const hookImageUxJson = JSON.parse(hookImageUxResult.stdout);
  const imageUxContext = hookImageUxJson.hookSpecificOutput?.additionalContext || '';
  if (!imageUxContext.includes('$Image-UX-Review route prepared') || !imageUxContext.includes('Codex App $imagegen/gpt-image-2')) throw new Error('selftest: $Image-UX-Review hook did not prepare imagegen loop context');
  const hookImageUxState = await readJson(stateFile(hookImageUxTmp), {});
  if (hookImageUxState.mode !== 'IMAGE_UX_REVIEW' || hookImageUxState.stop_gate !== IMAGE_UX_REVIEW_GATE_ARTIFACT || hookImageUxState.subagents_required !== false || hookImageUxState.reflection_required !== true) throw new Error('selftest: $Image-UX-Review hook did not set direct image UX review state');
  const imageUxMissionDir = missionDir(hookImageUxTmp, hookImageUxState.mission_id);
  const imageUxGate = await readJson(path.join(imageUxMissionDir, IMAGE_UX_REVIEW_GATE_ARTIFACT));
  const imageUxGeneratedLedger = await readJson(path.join(imageUxMissionDir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT));
  if (imageUxGate.passed || imageUxGate.imagegen_review_images_generated || !imageUxGate.blockers?.includes('source_screenshots_not_captured_yet') || !imageUxGate.blockers?.includes('no_source_screenshots_for_imagegen_review')) throw new Error('selftest: Image UX review gate did not block missing source/generated review images');
  if (imageUxGeneratedLedger.provider?.model !== 'gpt-image-2' || imageUxGeneratedLedger.passed) throw new Error('selftest: Image UX generated review ledger did not record required gpt-image-2 blocker state');
  const imageUxStatusResult = await runProcess(process.execPath, [hookBin, 'image-ux-review', 'status', 'latest', '--json'], { cwd: hookImageUxTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (imageUxStatusResult.code !== 0) throw new Error(`selftest: sks image-ux-review status failed: ${imageUxStatusResult.stderr || imageUxStatusResult.stdout}`);
  const imageUxStatus = JSON.parse(imageUxStatusResult.stdout);
  if (imageUxStatus.ok || imageUxStatus.generated_review_ledger?.provider?.model !== 'gpt-image-2' || !imageUxStatus.files?.gate?.endsWith(IMAGE_UX_REVIEW_GATE_ARTIFACT)) throw new Error('selftest: sks image-ux-review status did not report gpt-image-2 gate blockers');
  const hookResearchMarkdownTmp = tmpdir();
  await initProject(hookResearchMarkdownTmp, {});
  const hookResearchTeamPayload = JSON.stringify({ cwd: hookResearchMarkdownTmp, prompt: '$Team existing active work' });
  const hookResearchTeamResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookResearchMarkdownTmp, input: hookResearchTeamPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookResearchTeamResult.code !== 0) throw new Error(`selftest: active Team setup before markdown $Research hook exited ${hookResearchTeamResult.code}: ${hookResearchTeamResult.stderr}`);
  const hookResearchTeamState = await readJson(stateFile(hookResearchMarkdownTmp), {});
  const hookResearchMarkdownPayload = JSON.stringify({ cwd: hookResearchMarkdownTmp, prompt: '논문 [$research](x) 팀 커밋 푸쉬 연구' });
  const hookResearchMarkdownResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookResearchMarkdownTmp, input: hookResearchMarkdownPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookResearchMarkdownResult.code !== 0) throw new Error(`selftest: markdown $Research hook exited ${hookResearchMarkdownResult.code}: ${hookResearchMarkdownResult.stderr}`);
  const hookResearchMarkdownJson = JSON.parse(hookResearchMarkdownResult.stdout);
  const hookResearchMarkdownContext = hookResearchMarkdownJson.hookSpecificOutput?.additionalContext || '';
  if (!hookResearchMarkdownContext.includes('$Research route prepared')) throw new Error('selftest: markdown research hook');
  if (hookResearchMarkdownContext.includes(`Active Team mission ${hookResearchTeamState.mission_id}`)) throw new Error('selftest: stale Team context');
  if (!String(hookResearchMarkdownJson.systemMessage || '').includes('Research route') || String(hookResearchMarkdownJson.systemMessage || '').includes('QA-LOOP route')) throw new Error('selftest: research hook message');
  const hookResearchMarkdownState = await readJson(stateFile(hookResearchMarkdownTmp), {});
  if (hookResearchMarkdownState.mode !== 'RESEARCH' || hookResearchMarkdownState.route !== 'Research' || hookResearchMarkdownState.mission_id === hookResearchTeamState.mission_id || hookResearchMarkdownState.stop_gate !== 'research-gate.json' || !hookResearchMarkdownState.pipeline_plan_ready) throw new Error('selftest: research hook state');
  const hookResearchMissionDir = missionDir(hookResearchMarkdownTmp, hookResearchMarkdownState.mission_id);
  if (!(await exists(path.join(hookResearchMissionDir, PIPELINE_PLAN_ARTIFACT)))) throw new Error('selftest: research hook plan');
  const rss = 'research-source-skill.md';
  const gos = 'genius-opinion-summary.md';
  for (const artifact of [rss, 'source-ledger.json', 'scout-ledger.json', 'debate-ledger.json', 'falsification-ledger.json']) {
    if (!(await exists(path.join(hookResearchMissionDir, artifact)))) throw new Error(`selftest: hook research ${artifact}`);
  }
  const hookPayload = JSON.stringify({ cwd: hookGoalTmp, prompt: '$Goal 로그인 세션 만료 UX 개선' });
  const hookResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalTmp, input: hookPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookResult.code !== 0) throw new Error(`selftest: $Goal hook exited ${hookResult.code}: ${hookResult.stderr}`);
  const hookJson = JSON.parse(hookResult.stdout);
  if ('statusMessage' in hookJson || 'additionalContext' in hookJson) throw new Error('selftest: hook emitted Codex schema-invalid top-level fields');
  const goalContext = hookJson.hookSpecificOutput?.additionalContext || '';
  if (!goalContext.includes('$Goal route prepared') || !goalContext.includes('/goal create')) throw new Error('selftest: $Goal hook did not prepare native goal bridge');
  if (hookJson.hookSpecificOutput?.hookEventName !== 'UserPromptSubmit') throw new Error('selftest: $Goal hook did not emit official UserPromptSubmit additionalContext');
  if (!String(hookJson.systemMessage || '').includes('Goal workflow bridge')) throw new Error('selftest: $Goal hook missing visible status message');
  const hookState = await readJson(stateFile(hookGoalTmp), {});
  if (hookState.phase !== 'GOAL_READY' || hookState.mode !== 'GOAL') throw new Error('selftest: $Goal hook did not set ready state');
  if (!(await exists(path.join(missionDir(hookGoalTmp, hookState.mission_id), GOAL_WORKFLOW_ARTIFACT)))) throw new Error('selftest: $Goal hook did not write goal workflow artifact');
  const hookGoalDelegationTmp = tmpdir();
  await initProject(hookGoalDelegationTmp, {});
  const hookGoalDelegationPayload = JSON.stringify({ cwd: hookGoalDelegationTmp, prompt: '$Goal $Team 발표자료 만들어줘' });
  const hookGoalDelegationResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalDelegationTmp, input: hookGoalDelegationPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookGoalDelegationResult.code !== 0) throw new Error(`selftest: $Goal implementation delegation hook exited ${hookGoalDelegationResult.code}: ${hookGoalDelegationResult.stderr}`);
  const hookGoalDelegationJson = JSON.parse(hookGoalDelegationResult.stdout);
  const hookGoalDelegationContext = hookGoalDelegationJson.hookSpecificOutput?.additionalContext || '';
  const hookGoalDelegationBridgeMatch = hookGoalDelegationContext.match(/Goal bridge mission: (M-[A-Za-z0-9-]+)/);
  if (!hookGoalDelegationBridgeMatch || !hookGoalDelegationContext.includes('Delegated execution route: $Team')) throw new Error('selftest: $Goal implementation prompt did not prepare a bridge plus Team delegation');
  if (hookGoalDelegationContext.includes('MANDATORY ambiguity-removal gate activated') || !hookGoalDelegationContext.includes('$Team route prepared')) throw new Error('selftest: $Goal implementation delegation did not prepare direct Team route');
  const hookGoalDelegationState = await readJson(stateFile(hookGoalDelegationTmp), {});
  if (hookGoalDelegationState.mode !== 'TEAM' || hookGoalDelegationState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || hookGoalDelegationState.implementation_allowed === false || !hookGoalDelegationState.team_plan_ready) throw new Error('selftest: $Goal implementation delegation did not leave direct Team ready');
  if (!(await exists(path.join(missionDir(hookGoalDelegationTmp, hookGoalDelegationBridgeMatch[1]), GOAL_WORKFLOW_ARTIFACT)))) throw new Error('selftest: $Goal implementation delegation did not write bridge workflow artifact');
  const activeGoalMissionId = hookState.mission_id;
  const hookGoalOverlayPayload = JSON.stringify({ cwd: hookGoalTmp, prompt: '$Team 발표자료 만들어줘' });
  const hookGoalOverlayResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookGoalTmp, input: hookGoalOverlayPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookGoalOverlayResult.code !== 0) throw new Error(`selftest: active Goal overlay hook exited ${hookGoalOverlayResult.code}: ${hookGoalOverlayResult.stderr}`);
  const hookGoalOverlayJson = JSON.parse(hookGoalOverlayResult.stdout);
  const hookGoalOverlayContext = hookGoalOverlayJson.hookSpecificOutput?.additionalContext || '';
  if (hookGoalOverlayContext.includes('MANDATORY ambiguity-removal gate activated') || !hookGoalOverlayContext.includes('$Team route prepared')) throw new Error('selftest: active Goal hijacked a plain Korean implementation prompt instead of preparing direct Team');
  if (!hookGoalOverlayContext.includes(`Active Goal overlay: existing Goal mission ${activeGoalMissionId}`) || !hookGoalOverlayContext.includes('goal-workflow.json')) throw new Error('selftest: active Goal overlay context was not included with the new route');
  const hookGoalOverlayState = await readJson(stateFile(hookGoalTmp), {});
  if (hookGoalOverlayState.mission_id === activeGoalMissionId || hookGoalOverlayState.mode !== 'TEAM' || hookGoalOverlayState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || hookGoalOverlayState.implementation_allowed === false || !hookGoalOverlayState.team_plan_ready) throw new Error('selftest: active Goal overlay did not leave a new direct Team mission current');
  if (!(await exists(path.join(missionDir(hookGoalTmp, hookGoalOverlayState.mission_id), 'team-plan.json')))) throw new Error('selftest: active Goal overlay Team mission did not write team-plan.json');
  const hookUpdateCurrentTmp = tmpdir();
  await initProject(hookUpdateCurrentTmp, {});
  const hookUpdateCurrentEnv = { SKS_DISABLE_UPDATE_CHECK: '0', SKS_NPM_VIEW_SNEAKOSCOPE_VERSION: '9.9.9', SKS_INSTALLED_SKS_VERSION: '9.9.9' };
  const hookUpdateCurrentPayload = JSON.stringify({ cwd: hookUpdateCurrentTmp, prompt: '상태 확인해줘' });
  const hookUpdateCurrentResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateCurrentTmp,
    input: hookUpdateCurrentPayload,
    env: hookUpdateCurrentEnv,
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateCurrentResult.code !== 0) throw new Error(`selftest: current update hook exited ${hookUpdateCurrentResult.code}: ${hookUpdateCurrentResult.stderr}`);
  const hookUpdateCurrentJson = JSON.parse(hookUpdateCurrentResult.stdout);
  const hookUpdateCurrentContext = hookUpdateCurrentJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdateCurrentContext).includes('Update SKS now') || String(hookUpdateCurrentContext).includes('Skip update for this conversation')) throw new Error('selftest: hook prompted for update even though installed SKS is current');
  const hookUpdateCurrentState = await readJson(path.join(hookUpdateCurrentTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateCurrentState.pending_offer) throw new Error('selftest: current installed SKS left a pending update offer');
  const hookRuntimeExpected = await selftestRuntimeVersion();
  if (hookUpdateCurrentState.current !== '9.9.9' || hookUpdateCurrentState.runtime_current !== hookRuntimeExpected || hookUpdateCurrentState.installed_current !== '9.9.9') throw new Error(`selftest: hook did not record effective installed SKS version: ${JSON.stringify({ expected: { current: '9.9.9', runtime_current: hookRuntimeExpected, installed_current: '9.9.9', loaded_runtime_current: PACKAGE_VERSION }, actual: hookUpdateCurrentState })}`);
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
    env: hookUpdateCurrentEnv,
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdatePendingResult.code !== 0) throw new Error(`selftest: stale pending update hook exited ${hookUpdatePendingResult.code}: ${hookUpdatePendingResult.stderr}`);
  const hookUpdatePendingJson = JSON.parse(hookUpdatePendingResult.stdout);
  const hookUpdatePendingContext = hookUpdatePendingJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdatePendingContext).includes('user accepted update') || String(hookUpdatePendingContext).includes('Before doing other work')) throw new Error('selftest: current installed SKS accepted a stale pending update offer');
  const hookUpdatePendingState = await readJson(path.join(hookUpdatePendingTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdatePendingState.pending_offer) throw new Error('selftest: stale pending update offer was not cleared after installed SKS became current');
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
    env: hookUpdateCurrentEnv,
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateSkippedResult.code !== 0) throw new Error(`selftest: stale skipped update hook exited ${hookUpdateSkippedResult.code}: ${hookUpdateSkippedResult.stderr}`);
  const hookUpdateSkippedJson = JSON.parse(hookUpdateSkippedResult.stdout);
  const hookUpdateSkippedContext = hookUpdateSkippedJson.hookSpecificOutput?.additionalContext || '';
  if (String(hookUpdateSkippedContext).includes('was skipped for this conversation')) throw new Error('selftest: current installed SKS kept stale skipped update context');
  const hookUpdateSkippedState = await readJson(path.join(hookUpdateSkippedTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateSkippedState.skipped) throw new Error('selftest: stale skipped update state was not cleared after installed SKS became current');
  const hookUpdateOldTmp = tmpdir();
  await initProject(hookUpdateOldTmp, {});
  const hookUpdateOldPayload = JSON.stringify({ cwd: hookUpdateOldTmp, prompt: '상태 확인해줘' });
  const hookUpdateOldResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateOldTmp,
    input: hookUpdateOldPayload,
    env: { ...hookUpdateCurrentEnv, SKS_INSTALLED_SKS_VERSION: '0.0.0' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateOldResult.code !== 0) throw new Error(`selftest: stale update hook exited ${hookUpdateOldResult.code}: ${hookUpdateOldResult.stderr}`);
  const hookUpdateOldJson = JSON.parse(hookUpdateOldResult.stdout);
  const hookUpdateOldContext = hookUpdateOldJson.hookSpecificOutput?.additionalContext || '';
  if (!String(hookUpdateOldContext).includes('Update SKS now') || !String(hookUpdateOldContext).includes('Skip update for this conversation')) throw new Error('selftest: hook did not prompt when installed SKS is stale');
  const hookUpdateOldState = await readJson(path.join(hookUpdateOldTmp, '.sneakoscope', 'state', 'update-check.json'), {});
  if (hookUpdateOldState.pending_offer?.latest !== '9.9.9') throw new Error('selftest: stale installed SKS did not persist pending update offer');
  const hookUpdateAcceptPayload = JSON.stringify({ cwd: hookUpdateOldTmp, prompt: 'Update SKS now' });
  const hookUpdateAcceptResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], {
    cwd: hookUpdateOldTmp,
    input: hookUpdateAcceptPayload,
    env: { ...hookUpdateCurrentEnv, SKS_INSTALLED_SKS_VERSION: '0.0.0' },
    timeoutMs: 15000,
    maxOutputBytes: 256 * 1024
  });
  if (hookUpdateAcceptResult.code !== 0) throw new Error(`selftest: accepted update hook exited ${hookUpdateAcceptResult.code}: ${hookUpdateAcceptResult.stderr}`);
  const hookUpdateAcceptJson = JSON.parse(hookUpdateAcceptResult.stdout);
  const hookUpdateAcceptContext = hookUpdateAcceptJson.hookSpecificOutput?.additionalContext || '';
  if (!String(hookUpdateAcceptContext).includes('npm i -g sneakoscope@9.9.9 --registry https://registry.npmjs.org/')) throw new Error('selftest: exact update cmd');
  if (String(hookUpdateAcceptContext).includes('sks setup') || String(hookUpdateAcceptContext).includes('sks doctor') || String(hookUpdateAcceptContext).includes('npm i -D sneakoscope')) throw new Error('selftest: update cmd scope');
  const hookKoreanSksTmp = tmpdir();
  await initProject(hookKoreanSksTmp, {});
  const hookKoreanSksPayload = JSON.stringify({ cwd: hookKoreanSksTmp, prompt: koreanReadmeInstallPrompt });
  const hookKoreanSksResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookKoreanSksTmp, input: hookKoreanSksPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookKoreanSksResult.code !== 0) throw new Error(`selftest: Korean SKS hook exited ${hookKoreanSksResult.code}: ${hookKoreanSksResult.stderr}`);
  const hookKoreanSksJson = JSON.parse(hookKoreanSksResult.stdout);
  const hookKoreanSksContext = hookKoreanSksJson.hookSpecificOutput?.additionalContext || '';
  if (!hookKoreanSksContext.includes('$Team route prepared') || hookKoreanSksContext.includes('GOAL_PRECISE: 이번 작업의 최종 목표') || hookKoreanSksContext.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest: Korean prompt did not prepare direct Team route');
  if (!hookKoreanSksContext.includes('Route: $Team')) throw new Error('selftest: Korean implementation prompt did not promote to Team route');
  if (hookKoreanSksContext.includes('SKS answer-only pipeline active')) throw new Error('selftest: Korean implementation prompt still used answer-only pipeline');
  const hookKoreanSksState = await readJson(stateFile(hookKoreanSksTmp), {});
  if (hookKoreanSksState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || hookKoreanSksState.implementation_allowed !== true || !hookKoreanSksState.ambiguity_gate_passed || !hookKoreanSksState.team_plan_ready) throw new Error('selftest: Korean Team auto-seal did not materialize Team');
  if (!(await exists(path.join(missionDir(hookKoreanSksTmp, hookKoreanSksState.mission_id), 'team-plan.json')))) throw new Error('selftest: Korean Team auto-seal did not write team-plan.json');
  const hookPaymentTeamTmp = tmpdir();
  await initProject(hookPaymentTeamTmp, {});
  const hookPaymentTeamPayload = JSON.stringify({ cwd: hookPaymentTeamTmp, prompt: '$Team 결제 재시도 정책과 로그인 세션 만료 버그 수정 executor:2 user:1' });
  const hookPaymentTeamResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookPaymentTeamTmp, input: hookPaymentTeamPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookPaymentTeamResult.code !== 0) throw new Error(`selftest: payment/auth Team hook exited ${hookPaymentTeamResult.code}: ${hookPaymentTeamResult.stderr}`);
  const hookPaymentTeamJson = JSON.parse(hookPaymentTeamResult.stdout);
  const hookPaymentTeamContext = hookPaymentTeamJson.hookSpecificOutput?.additionalContext || '';
  if (!hookPaymentTeamContext.includes('$Team route prepared') || hookPaymentTeamContext.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest: predictable payment/auth Team prompt did not prepare direct Team route');
  if (hookPaymentTeamContext.includes('PAYMENT_RETRY_POLICY') || hookPaymentTeamContext.includes('AUTH_PROTOCOL_CHANGE_ALLOWED')) throw new Error('selftest: predictable payment/auth policy defaults were asked instead of inferred');
  const hookPaymentTeamState = await readJson(stateFile(hookPaymentTeamTmp), {});
  if (hookPaymentTeamState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || hookPaymentTeamState.implementation_allowed !== true || !hookPaymentTeamState.ambiguity_gate_passed || !hookPaymentTeamState.team_plan_ready) throw new Error('selftest: predictable payment/auth Team did not materialize after auto-seal');
  if (!(await exists(path.join(missionDir(hookPaymentTeamTmp, hookPaymentTeamState.mission_id), 'team-plan.json')))) throw new Error('selftest: predictable payment/auth Team auto-seal did not write team-plan.json');
  const hookTeamTmp = tmpdir();
  await initProject(hookTeamTmp, {});
  const hookTeamPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '$Team 발표자료 만들어줘 executor:2 user:1' });
  const hookTeamResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: hookTeamPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookTeamResult.code !== 0) throw new Error(`selftest: $Team hook exited ${hookTeamResult.code}: ${hookTeamResult.stderr}`);
  const hookTeamJson = JSON.parse(hookTeamResult.stdout);
  if (hookTeamJson.hookSpecificOutput?.additionalContext?.includes('MANDATORY ambiguity-removal gate activated') || hookTeamJson.hookSpecificOutput?.additionalContext?.includes('VISIBLE RESPONSE CONTRACT')) throw new Error('selftest: $Team hook still forced ambiguity questions');
  if (!hookTeamJson.hookSpecificOutput?.additionalContext?.includes('$Team route prepared')) throw new Error('selftest: $Team hook did not prepare direct Team route');
  const hookTeamState = await readJson(stateFile(hookTeamTmp), {});
  if (hookTeamState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || hookTeamState.implementation_allowed === false || !hookTeamState.team_plan_ready) throw new Error('selftest: $Team hook did not prepare direct Team mission');
  if (!hookTeamState.pipeline_plan_ready || !(await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), PIPELINE_PLAN_ARTIFACT)))) throw new Error('selftest: $Team hook did not write a pipeline plan');
  if (!(await exists(path.join(missionDir(hookTeamTmp, hookTeamState.mission_id), 'team-plan.json')))) throw new Error('selftest: Team plan was not created directly');
  const hookForbiddenModelResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: JSON.stringify({ cwd: hookTeamTmp, prompt: '$Team should be blocked before route work', model: 'gpt-5.5', metadata: { client: { modelId: 'gpt-5.0-forbidden' } } }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (hookForbiddenModelResult.code !== 0) throw new Error(`selftest: forbidden model hook exited ${hookForbiddenModelResult.code}: ${hookForbiddenModelResult.stderr}`);
  const hookForbiddenModelJson = JSON.parse(hookForbiddenModelResult.stdout);
  if (hookForbiddenModelJson.decision !== 'block' || !String(hookForbiddenModelJson.reason || '').includes('gpt-5.5') || !String(hookForbiddenModelJson.reason || '').includes('gpt-5.0-forbidden')) throw new Error('selftest: hook did not block forbidden client model metadata');
  const hookTeamPendingResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: JSON.stringify({ cwd: hookTeamTmp, prompt: '$Team 새 작업으로 넘어가' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookTeamPendingResult.code !== 0) throw new Error(`selftest: pending clarification hook exited ${hookTeamPendingResult.code}: ${hookTeamPendingResult.stderr}`);
  const hookTeamPendingJson = JSON.parse(hookTeamPendingResult.stdout);
  const hookTeamPendingState = await readJson(stateFile(hookTeamTmp), {});
  const hookTeamPendingContext = hookTeamPendingJson.hookSpecificOutput?.additionalContext || '';
  if (hookTeamPendingState.mission_id === hookTeamState.mission_id || hookTeamPendingContext.includes('Required questions still pending') || hookTeamPendingContext.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest: direct Team follow-up was blocked by stale clarification behavior');
  if (hookTeamPendingState.phase !== 'TEAM_PARALLEL_ANALYSIS_SCOUTING' || !hookTeamPendingState.team_plan_ready) throw new Error('selftest: direct Team follow-up did not prepare a fresh Team mission');
  const pptClarificationTmp = tmpdir();
  await initProject(pptClarificationTmp, {});
  const hookPptClarificationResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: pptClarificationTmp, input: JSON.stringify({ cwd: pptClarificationTmp, prompt: '$PPT 투자 제안서 만들어줘' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookPptClarificationResult.code !== 0) throw new Error(`selftest: PPT clarification hook exited ${hookPptClarificationResult.code}: ${hookPptClarificationResult.stderr}`);
  const hookPptClarificationState = await readJson(stateFile(pptClarificationTmp), {});
  const hookPptClarificationJson = JSON.parse(hookPptClarificationResult.stdout);
  const hookPptContext = hookPptClarificationJson.hookSpecificOutput?.additionalContext || '';
  const hookPptSchema = await readJson(path.join(missionDir(pptClarificationTmp, hookPptClarificationState.mission_id), 'required-answers.schema.json'));
  if (hookPptClarificationState.phase !== 'PPT_AUDIENCE_STRATEGY_READY' || hookPptClarificationState.implementation_allowed !== true || hookPptSchema.slots.length !== 0) throw new Error('selftest: PPT hook did not auto-seal without visible questions');
  if (hookPptContext.includes('Required questions') || hookPptContext.includes('VISIBLE RESPONSE CONTRACT') || hookPptContext.includes('MANDATORY ambiguity-removal gate')) throw new Error('selftest: PPT hook still exposed prequestion wording');
  if (!(await exists(path.join(missionDir(pptClarificationTmp, hookPptClarificationState.mission_id), 'ppt-audience-strategy.json')))) throw new Error('selftest: PPT auto-seal did not materialize audience strategy');
  const nonGoalsSlot = hookPptSchema.slots.find((s) => s.id === 'NON_GOALS');
  if (nonGoalsSlot && !nonGoalsSlot.allow_empty) throw new Error('selftest: NON_GOALS does not allow an empty array answer');
  if (!nonGoalsSlot && !Array.isArray(hookPptSchema.inferred_answers?.NON_GOALS)) throw new Error('selftest: NON_GOALS was neither asked nor inferred');
  const textParsedAnswers = parseAnswersText({ slots: [{ id: 'INTENT_TARGET', type: 'string', required: true }] }, 'INTENT_TARGET: compact contract sealing');
  if (textParsedAnswers.INTENT_TARGET !== 'compact contract sealing') throw new Error('selftest: text answer parser did not parse slot-id answers');
  const textParsedImplicitAnswer = parseAnswersText({ slots: [{ id: 'INTENT_TARGET', type: 'string', required: true }] }, 'compact contract sealing');
  if (textParsedImplicitAnswer.INTENT_TARGET !== 'compact contract sealing') throw new Error('selftest: text answer parser did not infer the only missing slot');
  const honestLoopTmp = tmpdir();
  await initProject(honestLoopTmp, {});
  const { id: honestLoopId, dir: honestLoopDir } = await createMission(honestLoopTmp, { mode: 'sks', prompt: 'honest loopback selftest' });
  await writeJsonAtomic(path.join(honestLoopDir, 'decision-contract.json'), { sealed_hash: 'selftest', answers: { GOAL_PRECISE: 'selftest' } });
  await setCurrent(honestLoopTmp, { mission_id: honestLoopId, route: 'SKS', route_command: '$SKS', mode: 'SKS', phase: 'SKS_CLARIFICATION_CONTRACT_SEALED', implementation_allowed: true, clarification_required: false, ambiguity_gate_passed: true, stop_gate: 'honest_mode' });
  const honestLoopResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nSelftest 경로의 Honest Mode loopback 동작을 검증했습니다.\n**솔직모드**\n검증: selftest ran\n남은 gap: CHANGELOG.md 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestLoopResult.code !== 0) throw new Error(`selftest: honest loopback hook exited ${honestLoopResult.code}: ${honestLoopResult.stderr}`);
  const honestLoopJson = JSON.parse(honestLoopResult.stdout);
  if (honestLoopJson.decision !== 'block' || !String(honestLoopJson.reason || '').includes('post-ambiguity execution phase')) throw new Error('selftest: Honest Mode gap did not trigger loopback');
  const honestLoopState = await readJson(stateFile(honestLoopTmp), {});
  if (honestLoopState.phase !== 'SKS_HONEST_LOOPBACK_AFTER_CLARIFICATION' || honestLoopState.implementation_allowed !== true || honestLoopState.clarification_required !== false || honestLoopState.ambiguity_gate_passed !== true) throw new Error('selftest: honest loopback did not preserve post-ambiguity execution state');
  if (!(await exists(path.join(honestLoopDir, 'honest-loopback.json')))) throw new Error('selftest: honest-loopback artifact missing');
  const honestCleanResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nCHANGELOG 확인과 selftest 통과 상태로 loopback을 닫았습니다.\n**솔직모드**\n검증: CHANGELOG.md check and selftest passed\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestCleanResult.code !== 0) throw new Error(`selftest: clean honest hook exited ${honestCleanResult.code}: ${honestCleanResult.stderr}`);
  const honestCleanJson = JSON.parse(honestCleanResult.stdout);
  if (honestCleanJson.decision === 'block') throw new Error('selftest: clean Honest Mode was blocked after loopback was resolved');
  const honestCleanState = await readJson(stateFile(honestLoopTmp), {});
  if (honestCleanState.honest_loop_required !== false || honestCleanState.phase !== 'SKS_HONEST_COMPLETE') throw new Error('selftest: honest loopback was not marked resolved');
  const honestMissingSummaryResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**솔직모드**\n검증: selftest 통과\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestMissingSummaryResult.code !== 0) throw new Error(`selftest: missing-summary honest hook exited ${honestMissingSummaryResult.code}: ${honestMissingSummaryResult.stderr}`);
  const honestMissingSummaryJson = JSON.parse(honestMissingSummaryResult.stdout);
  if (honestMissingSummaryJson.decision !== 'block' || !String(honestMissingSummaryJson.reason || '').includes('completion summary')) throw new Error('selftest: Honest Mode without completion summary was accepted');
  const honestMissingSummaryRepeatResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**솔직모드**\n검증: selftest 통과\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestMissingSummaryRepeatResult.code !== 0) throw new Error(`selftest: repeated missing-summary honest hook exited ${honestMissingSummaryRepeatResult.code}: ${honestMissingSummaryRepeatResult.stderr}`);
  const honestMissingSummaryRepeatJson = JSON.parse(honestMissingSummaryRepeatResult.stdout);
  if (honestMissingSummaryRepeatJson.decision === 'block' || !String(honestMissingSummaryRepeatJson.systemMessage || '').includes('repeat guard')) throw new Error('selftest: repeated completion-summary stop prompt was not suppressed');
  const honestBlockedAsExpectedResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\nlegacy QA report 차단 확인을 검증했습니다.\n**솔직모드**\n검증: selftest 통과, legacy `qa-report.md` 차단 확인\n제약: registry publish excluded' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestBlockedAsExpectedResult.code !== 0) throw new Error(`selftest: blocked-as-expected honest hook exited ${honestBlockedAsExpectedResult.code}: ${honestBlockedAsExpectedResult.stderr}`);
  const honestBlockedAsExpectedJson = JSON.parse(honestBlockedAsExpectedResult.stdout);
  if (honestBlockedAsExpectedJson.decision === 'block') throw new Error('selftest: blocked-as-expected evidence was treated as an unresolved gap');
  const honestNoActiveGateResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**Completion Summary**\nWhat changed: verified route-gate closure evidence handling.\n**SKS Honest Mode**\nVerified: pipeline status returned `No active blocking route gate detected`; post-reflection work blocking was verified by selftest.\nRemaining gaps: none' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestNoActiveGateResult.code !== 0) throw new Error(`selftest: no-active-gate honest hook exited ${honestNoActiveGateResult.code}: ${honestNoActiveGateResult.stderr}`);
  const honestNoActiveGateJson = JSON.parse(honestNoActiveGateResult.stdout);
  if (honestNoActiveGateJson.decision === 'block') throw new Error('selftest: no-active-blocking status was treated as an unresolved gap');
  const honestNotBlockerResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**Completion Summary**\nWhat changed: verified non-blocker wording in final closeout.\n**SKS Honest Mode**\nVerified: selftest passed.\nRemaining gaps: none. Unrelated dirty worktree entries are not a blocker for this scoped task.' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestNotBlockerResult.code !== 0) throw new Error(`selftest: not-blocker honest hook exited ${honestNotBlockerResult.code}: ${honestNotBlockerResult.stderr}`);
  const honestNotBlockerJson = JSON.parse(honestNotBlockerResult.stdout);
  if (honestNotBlockerJson.decision === 'block') throw new Error('selftest: non-blocker boundary wording was treated as unresolved gap');
  const honestSummaryCaseResult = await runProcess(process.execPath, [hookBin, 'hook', 'stop'], { cwd: honestLoopTmp, input: JSON.stringify({ cwd: honestLoopTmp, last_assistant_message: '**작업 요약**\n[src/cli/main.mjs]: selftest에 요약 없으면 차단, 요약 있으면 통과 케이스 추가.\n**솔직모드**\n검증: selftest 통과.\n남은 gap: 없음' }), env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (honestSummaryCaseResult.code !== 0) throw new Error(`selftest: summary-case honest hook exited ${honestSummaryCaseResult.code}: ${honestSummaryCaseResult.stderr}`);
  const honestSummaryCaseJson = JSON.parse(honestSummaryCaseResult.stdout);
  if (honestSummaryCaseJson.decision === 'block') throw new Error('selftest: summary block/pass wording was treated as unresolved gap');
  const hookQaTmp = tmpdir();
  await initProject(hookQaTmp, {});
  const hookQaPayload = JSON.stringify({ cwd: hookQaTmp, prompt: '$QA-LOOP run API E2E against local dev' });
  const hookQaResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookQaTmp, input: hookQaPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
  if (hookQaResult.code !== 0) throw new Error(`selftest: $QA-LOOP hook exited ${hookQaResult.code}: ${hookQaResult.stderr}`);
  const hookQaJson = JSON.parse(hookQaResult.stdout);
  const hookQaContext = hookQaJson.hookSpecificOutput?.additionalContext || '';
  if (!hookQaContext.includes('Route contract auto-sealed') || hookQaContext.includes('MANDATORY ambiguity-removal gate activated') || hookQaContext.includes('Required questions:') || hookQaContext.includes('QA_SCOPE:') || hookQaContext.includes('UI_COMPUTER_USE_ACK:')) throw new Error('selftest: $QA-LOOP hook did not auto-seal without visible answer slots');
  if (!hookQaContext.includes('Codex Computer Use') || !hookQaContext.includes('Playwright') || !hookQaContext.includes('Chrome MCP')) throw new Error('selftest: $QA-LOOP hook did not state Computer Use-only UI policy');
  if (hookQaContext.includes('Browser Use 또는 Computer Use') || hookQaContext.includes('Browser/Computer Use evidence')) throw new Error('selftest: $QA-LOOP hook still allows Browser Use as UI evidence');
  const hookQaState = await readJson(stateFile(hookQaTmp), {});
  if (hookQaState.phase !== 'QALOOP_CLARIFICATION_CONTRACT_SEALED' || hookQaState.implementation_allowed !== true || hookQaState.clarification_required !== false || !hookQaState.ambiguity_gate_passed) throw new Error('selftest: $QA-LOOP hook did not auto-seal the ambiguity gate');
  const hookQaSchema = await readJson(path.join(missionDir(hookQaTmp, hookQaState.mission_id), 'required-answers.schema.json'));
  if (hookQaSchema.slots.length !== 0 || hookQaSchema.inferred_answers?.QA_SCOPE !== 'api_e2e_only') throw new Error('selftest: $QA-LOOP schema did not infer QA answers without visible slots');
  const qaMissionDir = missionDir(hookQaTmp, hookQaState.mission_id);
  const initialQaGate = await readJson(path.join(qaMissionDir, 'qa-gate.json'));
  const qaReportFile = initialQaGate.qa_report_file;
  if (!isQaReportFilename(qaReportFile)) throw new Error(`selftest: QA report filename is not date/version-prefixed: ${qaReportFile}`);
  if ((await exists(path.join(qaMissionDir, 'qa-report.md')))) throw new Error('selftest: legacy QA report filename was created');
  if (!(await exists(path.join(qaMissionDir, qaReportFile))) || !(await exists(path.join(qaMissionDir, 'qa-ledger.json'))) || !(await exists(path.join(qaMissionDir, 'qa-gate.json')))) throw new Error('selftest: QA artifacts missing after answer');
  const legacyQaTmp = tmpdir();
  await writeJsonAtomic(path.join(legacyQaTmp, 'qa-gate.json'), { ...defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } }, { reportFile: 'qa-report.md' }), passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, post_fix_verification_complete: true, honest_mode_complete: true });
  await writeJsonAtomic(path.join(legacyQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(legacyQaTmp, 'qa-report.md'), '# legacy\n');
  const legacyQaGate = await evaluateQaGate(legacyQaTmp);
  if (legacyQaGate.passed || !legacyQaGate.reasons.includes('qa_report_filename_prefix_invalid')) throw new Error('selftest: legacy QA report filename was accepted');
  const unresolvedQaTmp = tmpdir();
  await writeJsonAtomic(path.join(unresolvedQaTmp, 'qa-gate.json'), { ...defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } }), passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, unresolved_findings: 0, unresolved_fixable_findings: 1, post_fix_verification_complete: true, honest_mode_complete: true });
  const unresolvedQaGateFile = (await readJson(path.join(unresolvedQaTmp, 'qa-gate.json'))).qa_report_file;
  await writeJsonAtomic(path.join(unresolvedQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(unresolvedQaTmp, unresolvedQaGateFile), '# unresolved\n');
  const unresolvedQaGate = await evaluateQaGate(unresolvedQaTmp);
  if (unresolvedQaGate.passed || !unresolvedQaGate.reasons.includes('unresolved_fixable_findings_remaining')) throw new Error('selftest: unresolved fixable QA finding was accepted');
  const forbiddenQaTmp = tmpdir();
  const forbiddenQaGate = defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'ui_e2e_only', TARGET_BASE_URL: 'http://localhost:3000', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } });
  await writeJsonAtomic(path.join(forbiddenQaTmp, 'qa-gate.json'), { ...forbiddenQaGate, passed: true, qa_report_written: true, qa_ledger_complete: true, checklist_completed: true, safety_reviewed: true, credentials_not_persisted: true, ui_computer_use_evidence: true, ui_evidence_source: 'playwright', post_fix_verification_complete: true, honest_mode_complete: true, evidence: ['Playwright screenshot evidence'] });
  await writeJsonAtomic(path.join(forbiddenQaTmp, 'qa-ledger.json'), { checklist: [] });
  await writeTextAtomic(path.join(forbiddenQaTmp, forbiddenQaGate.qa_report_file), '# forbidden\n');
  const forbiddenQaGateResult = await evaluateQaGate(forbiddenQaTmp);
  if (forbiddenQaGateResult.passed || !forbiddenQaGateResult.reasons.includes('ui_evidence_source_not_codex_computer_use') || !forbiddenQaGateResult.reasons.includes('forbidden_browser_automation_evidence')) throw new Error('selftest: forbidden browser automation QA evidence was accepted');
  const promptQa = buildQaLoopPrompt({ id: 'selftest', mission: { prompt: 'QA and fix' }, contract: { answers: { QA_CORRECTIVE_POLICY: 'apply_safe_fixes_and_reverify' } }, cycle: 1, previous: '', reportFile: qaReportFile });
  if (!promptQa.includes('dogfood as human proxy') || !promptQa.includes('fix safe code/test/docs now') || !promptQa.includes('post_fix_verification_complete')) throw new Error('selftest: QA-LOOP dogfood prompt');
  if (!promptQa.includes(CODEX_COMPUTER_USE_ONLY_POLICY) || !promptQa.includes('Chrome MCP') || !promptQa.includes('Playwright') || !promptQa.includes('Browser Use')) throw new Error('selftest: QA-LOOP prompt did not enforce Computer Use-only UI evidence');
  if (promptQa.includes('Browser/Computer Use evidence')) throw new Error('selftest: QA-LOOP prompt still allows Browser/Computer UI evidence');
  const pkgQa = defaultQaGate({ sealed_hash: 'selftest', answers: { QA_SCOPE: 'all_available', TARGET_BASE_URL: 'none', API_BASE_URL: 'same_as_target', TARGET_ENVIRONMENT: 'local_dev_server', DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never' } });
  if (pkgQa.ui_e2e_required || pkgQa.api_e2e_required || !pkgQa.ui_computer_use_evidence) throw new Error('selftest: package QA target gate');
  const qaRunResult = await runProcess(process.execPath, [hookBin, 'qa-loop', 'run', 'latest', '--mock'], { cwd: hookQaTmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (qaRunResult.code !== 0) throw new Error(`selftest: qa-loop mock run exited ${qaRunResult.code}: ${qaRunResult.stderr}`);
  const qaGate = await readJson(path.join(qaMissionDir, 'qa-gate.evaluated.json'));
  if (!qaGate.passed) throw new Error('selftest: qa-loop mock gate did not pass');
  const hookDfixTmp = tmpdir();
  await initProject(hookDfixTmp, {});
  const hookDfixPayload = JSON.stringify({ cwd: hookDfixTmp, prompt: '$DFix 버튼 라벨 바꿔줘' });
  const hookDfixResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookDfixTmp, input: hookDfixPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (hookDfixResult.code !== 0) throw new Error(`selftest: $DFix hook exited ${hookDfixResult.code}: ${hookDfixResult.stderr}`);
  const hookDfixJson = JSON.parse(hookDfixResult.stdout);
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('MANDATORY ambiguity-removal gate activated')) throw new Error('selftest: $DFix incorrectly triggered ambiguity gate');
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('SKS skill-first pipeline active')) throw new Error('selftest: $DFix entered the general SKS prompt pipeline');
  if (hookDfixJson.hookSpecificOutput?.additionalContext?.includes('Mission:')) throw new Error('selftest: $DFix created route mission state');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix ultralight pipeline active')) throw new Error('selftest: $DFix hook missing ultralight pipeline guidance');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('Task list:')) throw new Error('selftest: $DFix hook missing micro task list');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix 완료 요약')) throw new Error('selftest: $DFix hook missing no-record final marker guidance');
  if (!hookDfixJson.hookSpecificOutput?.additionalContext?.includes('DFix 솔직모드')) throw new Error('selftest: $DFix hook missing lightweight Honest Mode guidance');
  if (!hookDfixJson.systemMessage?.includes('DFix ultralight')) throw new Error('selftest: $DFix hook missing ultralight system message');
  if (await exists(path.join(hookDfixTmp, '.sneakoscope', 'state', 'light-route-stop.json'))) throw new Error('selftest: $DFix hook created persistent light-route state');
  const hookDfixState = await readJson(stateFile(hookDfixTmp), {});
  if (String(hookDfixState.phase || '').includes('CLARIFICATION_AWAITING_ANSWERS')) throw new Error('selftest: $DFix state entered clarification gate');
  const explicitDfixDirectTmp = tmpdir();
  await initProject(explicitDfixDirectTmp, {});
  const explicitDfixDirectPayload = JSON.stringify({ cwd: explicitDfixDirectTmp, prompt: '$DFix Update the docs config wording to Direct Fix' });
  const explicitDfixDirectResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: explicitDfixDirectTmp, input: explicitDfixDirectPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (explicitDfixDirectResult.code !== 0) throw new Error(`selftest: explicit Direct Fix docs/config hook exited ${explicitDfixDirectResult.code}: ${explicitDfixDirectResult.stderr}`);
  const explicitDfixDirectJson = JSON.parse(explicitDfixDirectResult.stdout);
  const explicitDfixDirectContext = explicitDfixDirectJson.hookSpecificOutput?.additionalContext || '';
  if (!explicitDfixDirectContext.includes('DFix ultralight pipeline active')) throw new Error('selftest: explicit Direct Fix docs/config request did not use ultralight hook');
  if (explicitDfixDirectContext.includes('SKS skill-first pipeline active') || explicitDfixDirectContext.includes('Mission:')) throw new Error('selftest: explicit Direct Fix docs/config request leaked general pipeline context');
  if (await exists(path.join(explicitDfixDirectTmp, '.sneakoscope', 'state', 'light-route-stop.json'))) throw new Error('selftest: explicit Direct Fix docs/config hook created persistent light-route state');
  const inferredDfixPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '버튼 라벨 바꿔줘' });
  const inferredDfixResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: inferredDfixPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (inferredDfixResult.code !== 0) throw new Error(`selftest: inferred DFix hook exited ${inferredDfixResult.code}: ${inferredDfixResult.stderr}`);
  const inferredDfixJson = JSON.parse(inferredDfixResult.stdout);
  const inferredDfixContext = inferredDfixJson.hookSpecificOutput?.additionalContext || '';
  if (!inferredDfixContext.includes('DFix ultralight pipeline active')) throw new Error('selftest: inferred DFix did not use ultralight route');
  if (inferredDfixContext.includes('SKS skill-first pipeline active') || inferredDfixContext.includes('Active Team mission') || inferredDfixContext.includes('Mission:')) throw new Error('selftest: inferred DFix leaked general pipeline or active Team context');
  const answerPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '이 파이프라인은 왜 이렇게 동작해?' });
  const answerResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: answerPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (answerResult.code !== 0) throw new Error(`selftest: answer-only hook exited ${answerResult.code}: ${answerResult.stderr}`);
  const answerJson = JSON.parse(answerResult.stdout);
  const answerContext = answerJson.hookSpecificOutput?.additionalContext || '';
  if (!answerContext.includes('SKS answer-only pipeline active')) throw new Error('selftest: question prompt did not use Answer route');
  if (answerContext.includes('MANDATORY ambiguity-removal gate activated') || answerContext.includes('SKS skill-first pipeline active') || answerContext.includes('Active Team mission') || answerContext.includes('Mission:')) throw new Error('selftest: Answer route leaked execution pipeline or active Team context');
  if (!answerJson.systemMessage?.includes('answer-only')) throw new Error('selftest: Answer route missing system message');
  const wikiPayload = JSON.stringify({ cwd: hookTeamTmp, prompt: '$Wiki 갱신' });
  const wikiResult = await runProcess(process.execPath, [hookBin, 'hook', 'user-prompt-submit'], { cwd: hookTeamTmp, input: wikiPayload, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (wikiResult.code !== 0) throw new Error(`selftest: Wiki hook exited ${wikiResult.code}: ${wikiResult.stderr}`);
  const wikiJson = JSON.parse(wikiResult.stdout);
  const wikiContext = wikiJson.hookSpecificOutput?.additionalContext || '';
  if (!wikiContext.includes('SKS wiki pipeline active') || !wikiContext.includes('sks wiki refresh')) throw new Error('selftest: $Wiki hook did not inject wiki route');
  if (wikiContext.includes('MANDATORY ambiguity-removal gate activated') || wikiContext.includes('Mission:')) throw new Error('selftest: Wiki route created ambiguity mission state');
  if (!wikiJson.systemMessage?.includes('wiki refresh')) throw new Error('selftest: Wiki route missing system message');
  const codexConfigText = await safeReadText(path.join(tmp, '.codex', 'config.toml'));
  const missingCodexConfigFlags = missingGeneratedCodexAppFeatureFlags(codexConfigText);
  if (missingCodexConfigFlags.length || hasDeprecatedCodexHooksFeatureFlag(codexConfigText)) throw new Error(`selftest: generated Codex App feature flags missing or deprecated: ${missingCodexConfigFlags.join(', ')}`);
  assertCodexWarn(codexConfigText, 'generated Codex App config');
  if (!hasContext7ConfigText(codexConfigText)) throw new Error('selftest: Context7 MCP not configured');
  if (!codexConfigText.includes('[profiles.sks-task-low]') || !codexConfigText.includes('[profiles.sks-task-medium]') || !codexConfigText.includes('[profiles.sks-logic-high]') || !codexConfigText.includes('[profiles.sks-fast-high]') || !codexConfigText.includes('[profiles.sks-research-xhigh]') || !codexConfigText.includes('[profiles.sks-research]') || !codexConfigText.includes('[profiles.sks-mad-high]')) throw new Error('selftest: GPT-5.5 reasoning profiles not configured');
  if (!hasResearchProfileConfig(codexConfigText)) throw new Error('selftest: generated Research xhigh profiles not configured');
  if (!/\[profiles\.sks-mad-high\][\s\S]*?approval_policy = "never"[\s\S]*?sandbox_mode = "danger-full-access"/.test(codexConfigText)) throw new Error('selftest: generated sks-mad-high profile is not full access');
  if (!codexConfigText.includes('[agents.analysis_scout]')) throw new Error('selftest: analysis_scout agent not configured');
  if (!codexConfigText.includes('[agents.team_consensus]')) throw new Error('selftest: team_consensus agent not configured');
  const preservedConfigTmp = tmpdir();
  await ensureDir(path.join(preservedConfigTmp, '.codex'));
  await writeTextAtomic(path.join(preservedConfigTmp, '.codex', 'config.toml'), 'model = "gpt-5.5"\nmodel_reasoning_effort = "high"\nservice_tier = "fast"\n\n[notice]\nfast_default_opt_out = true\nkeep = true\n\n[features]\ncodex_hooks = true\nfast_mode_ui = false\ncodex_git_commit = false\ncomputer_use = false\napps = false\nplugins = false\ncustom_preview = true\n\n[user.fast_mode]\nvisible = true\n');
  await initProject(preservedConfigTmp, {});
  const preservedConfig = await safeReadText(path.join(preservedConfigTmp, '.codex', 'config.toml'));
  if (!/^model = "gpt-5\.5"/m.test(preservedConfig) || !preservedConfig.includes('service_tier = "fast"') || !preservedConfig.includes('fast_mode = true') || !preservedConfig.includes('fast_mode_ui = true') || !preservedConfig.includes('[user.fast_mode]') || !preservedConfig.includes('visible = true') || !preservedConfig.includes('enabled = true') || !preservedConfig.includes('default_profile = "sks-fast-high"') || !/\[profiles\.sks-fast-high\][\s\S]*?service_tier = "fast"/.test(preservedConfig)) throw new Error('selftest: Codex config merge dropped or failed to enable Fast mode defaults and GPT-5.5');
  assertCodexWarn(preservedConfig, 'merged Codex config');
  if (preservedConfig.includes('fast_default_opt_out = true') || !preservedConfig.includes('keep = true')) throw new Error('selftest: Codex config merge did not remove stale Fast opt-out notice while preserving other notice keys');
  const missingPreservedFlags = missingGeneratedCodexAppFeatureFlags(preservedConfig);
  if (missingPreservedFlags.length || hasDeprecatedCodexHooksFeatureFlag(preservedConfig) || !preservedConfig.includes('custom_preview = true') || !preservedConfig.includes('[profiles.sks-fast-high]') || !hasResearchProfileConfig(preservedConfig)) throw new Error(`selftest: Codex config merge did not add required app feature flags, Research profiles, preserve existing feature flags, or remove deprecated codex_hooks: ${missingPreservedFlags.join(', ')}`);
  if (hasTopLevelCodexModeLock(preservedConfig)) throw new Error('selftest: Codex config merge left top-level legacy model/reasoning locks that hide Fast mode UI');
  const appFeatureTmp = tmpdir();
  const fakeCodexApp = path.join(appFeatureTmp, 'Codex.app');
  const fakeCodexBinDir = path.join(appFeatureTmp, 'bin');
  await ensureDir(fakeCodexApp);
  await ensureDir(fakeCodexBinDir);
  await ensureDir(path.join(appFeatureTmp, '.codex'));
  const codexAppFixtureConfigText = codexConfigText.replace(/(?:^|\n)\[marketplaces\.[^\]\r\n]+\][\s\S]*?(?=\n\[[^\]]+\]|\s*$)/g, '\n').replace(/\n{3,}/g, '\n\n');
  await writeTextAtomic(path.join(appFeatureTmp, '.codex', 'config.toml'), codexAppFixtureConfigText);
  const fakeDefaultPluginCacheNames = ['browser', 'chrome', 'computer-use', 'latex', 'documents', 'presentations', 'spreadsheets'];
  for (const name of fakeDefaultPluginCacheNames) await ensureDir(path.join(appFeatureTmp, '.codex', 'plugins', 'cache', name));
  const fakeCodex = path.join(fakeCodexBinDir, 'codex');
  await writeTextAtomic(fakeCodex, '#!/bin/sh\nif [ "$1" = "mcp" ] && [ "$2" = "list" ]; then printf "%s\\n" "computer-use enabled" "browser-use enabled"; exit 0; fi\nif [ "$1" = "features" ] && [ "$2" = "list" ]; then cat <<EOF\napps                                    stable             true\nbrowser_use                             stable             true\nbrowser_use_external                    stable             true\ncodex_git_commit                        under development  true\ncomputer_use                            stable             true\nfast_mode                               stable             true\nguardian_approval                       stable             true\nhooks                                   stable             true\nimage_generation                        stable             true\nin_app_browser                          stable             true\nplugins                                 stable             true\nremote_control                          under development  true\ntool_suggest                            stable             true\nEOF\nexit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(fakeCodex, 0o755);
  const codexAppFixtureOpts = { codex: { bin: fakeCodex, version: 'codex-cli 99.0.0' }, home: appFeatureTmp, cwd: appFeatureTmp, env: { SKS_CODEX_APP_PATH: fakeCodexApp } };
  const codexAppFeatureStatus = await codexAppIntegrationStatus(codexAppFixtureOpts);
  if (!codexAppFeatureStatus.ok || !codexAppFeatureStatus.features?.required_flags_ok || !codexAppFeatureStatus.features?.codex_git_commit || !codexAppFeatureStatus.features?.remote_control || !codexAppFeatureStatus.features?.git_actions?.ok || !codexAppFeatureStatus.features?.fast_mode_config?.ok) throw new Error('selftest: codex-app check did not accept required app feature flags, git actions, remote_control, and unlocked Fast UI config');
  const codexAppOldCliStatus = await codexAppIntegrationStatus({ codex: { bin: fakeCodex, version: 'codex-cli 0.129.0' }, home: appFeatureTmp, cwd: appFeatureTmp, env: { SKS_CODEX_APP_PATH: fakeCodexApp } });
  if (codexAppOldCliStatus.ok || codexAppOldCliStatus.features?.git_actions?.ok || !codexAppOldCliStatus.guidance.some((line) => line.includes('git commit/push actions are blocked'))) throw new Error('selftest: codex-app check did not block commit/push actions on old Codex CLI remote-control');
  const missingDefaultPluginTmp = tmpdir();
  await ensureDir(path.join(missingDefaultPluginTmp, '.codex'));
  const codexConfigWithoutMarketplaceSources = codexConfigText.replace(/(?:^|\n)\[marketplaces\.[^\]\r\n]+\][\s\S]*?(?=\n\[[^\]]+\]|\s*$)/g, '').trim();
  await writeTextAtomic(path.join(missingDefaultPluginTmp, '.codex', 'config.toml'), `${codexConfigWithoutMarketplaceSources}\n`);
  const codexAppMissingDefaultPluginStatus = await codexAppIntegrationStatus({ codex: { bin: fakeCodex, version: 'codex-cli 99.0.0' }, home: missingDefaultPluginTmp, cwd: missingDefaultPluginTmp, env: { SKS_CODEX_APP_PATH: fakeCodexApp } });
  if (codexAppMissingDefaultPluginStatus.ok || codexAppMissingDefaultPluginStatus.plugins?.default_plugins?.ok || codexAppMissingDefaultPluginStatus.plugins?.picker?.ok || !codexAppMissingDefaultPluginStatus.plugins?.default_plugins?.missing_installed?.includes('browser@openai-bundled') || !codexAppMissingDefaultPluginStatus.guidance.some((line) => line.includes('default plugin source'))) throw new Error('selftest: codex-app check did not block missing default plugin source');
  await ensureDir(path.join(appFeatureTmp, '.agents', 'skills', 'browser'));
  await writeTextAtomic(path.join(appFeatureTmp, '.agents', 'skills', 'browser', 'SKILL.md'), stalePluginSkillContent('browser'));
  const codexAppShadowStatus = await codexAppIntegrationStatus(codexAppFixtureOpts);
  if (codexAppShadowStatus.ok || codexAppShadowStatus.plugins?.picker?.ok || codexAppShadowStatus.plugins?.skill_shadows?.blocking?.[0]?.name !== 'browser' || codexAppShadowStatus.plugins?.skill_shadows?.generated?.[0]?.name !== 'browser' || !codexAppShadowStatus.guidance.some((line) => line.includes('plugin picker generated skill shadow'))) throw new Error('selftest: codex-app check did not block generated skill shadow that can hide @ plugin picker entries');
  await fsp.rm(path.join(appFeatureTmp, '.agents', 'skills', 'browser'), { recursive: true, force: true });
  await ensureDir(path.join(appFeatureTmp, '.agents', 'skills', 'browser'));
  await writeTextAtomic(path.join(appFeatureTmp, '.agents', 'skills', 'browser', 'SKILL.md'), '---\nname: browser\ndescription: User custom skill, not generated by SKS.\n---\n');
  const codexAppCustomShadowStatus = await codexAppIntegrationStatus(codexAppFixtureOpts);
  if (codexAppCustomShadowStatus.ok || codexAppCustomShadowStatus.plugins?.picker?.ok || codexAppCustomShadowStatus.plugins?.skill_shadows?.custom?.[0]?.name !== 'browser' || codexAppCustomShadowStatus.plugins?.skill_shadows?.generated?.length || !codexAppCustomShadowStatus.guidance.some((line) => line.includes('user-owned reserved skill name')) || codexAppCustomShadowStatus.guidance.some((line) => line.includes('plugin picker generated skill shadow'))) throw new Error('selftest: codex-app check did not distinguish user-owned reserved plugin skill names from generated shadows');
  await fsp.rm(path.join(appFeatureTmp, '.agents', 'skills', 'browser'), { recursive: true, force: true });
  const fakeCodexMissing = path.join(fakeCodexBinDir, 'codex-missing-git-commit');
  await writeTextAtomic(fakeCodexMissing, '#!/bin/sh\nif [ "$1" = "mcp" ] && [ "$2" = "list" ]; then printf "%s\\n" "computer-use enabled" "browser-use enabled"; exit 0; fi\nif [ "$1" = "features" ] && [ "$2" = "list" ]; then cat <<EOF\napps                                    stable             true\nbrowser_use                             stable             true\nbrowser_use_external                    stable             true\ncodex_git_commit                        under development  false\ncomputer_use                            stable             true\nfast_mode                               stable             true\nguardian_approval                       stable             true\nhooks                                   stable             true\nimage_generation                        stable             true\nin_app_browser                          stable             true\nplugins                                 stable             true\nremote_control                          under development  true\ntool_suggest                            stable             true\nEOF\nexit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(fakeCodexMissing, 0o755);
  const codexAppMissingFeatureStatus = await codexAppIntegrationStatus({ codex: { bin: fakeCodexMissing, version: 'codex-cli 99.0.0' }, home: appFeatureTmp, env: { SKS_CODEX_APP_PATH: fakeCodexApp } });
  if (codexAppMissingFeatureStatus.ok || codexAppMissingFeatureStatus.features?.required_flags_ok || codexAppMissingFeatureStatus.features?.codex_git_commit || codexAppMissingFeatureStatus.features?.git_actions?.ok) throw new Error('selftest: codex-app check did not block disabled codex_git_commit feature flag');
  const fakeCodexMissingImageGen = path.join(fakeCodexBinDir, 'codex-missing-imagegen');
  await writeTextAtomic(fakeCodexMissingImageGen, '#!/bin/sh\nif [ "$1" = "mcp" ] && [ "$2" = "list" ]; then printf "%s\\n" "computer-use enabled" "browser-use enabled"; exit 0; fi\nif [ "$1" = "features" ] && [ "$2" = "list" ]; then cat <<EOF\napps                                    stable             true\nbrowser_use                             stable             true\nbrowser_use_external                    stable             true\ncodex_git_commit                        under development  true\ncomputer_use                            stable             true\nfast_mode                               stable             true\nguardian_approval                       stable             true\nhooks                                   stable             true\nimage_generation                        stable             false\nin_app_browser                          stable             true\nplugins                                 stable             true\nremote_control                          under development  true\ntool_suggest                            stable             true\nEOF\nexit 0; fi\necho "unexpected codex $*" >&2\nexit 2\n');
  await fsp.chmod(fakeCodexMissingImageGen, 0o755);
  const codexAppMissingImageGenStatus = await codexAppIntegrationStatus({ codex: { bin: fakeCodexMissingImageGen, version: 'codex-cli 99.0.0' }, home: appFeatureTmp, env: { SKS_CODEX_APP_PATH: fakeCodexApp } });
  if (codexAppMissingImageGenStatus.ok || codexAppMissingImageGenStatus.features?.required_flags_ok || codexAppMissingImageGenStatus.features?.image_generation || !codexAppMissingImageGenStatus.guidance.some((line) => line.includes('image_generation'))) throw new Error('selftest: codex-app check did not block disabled image_generation for imagegen pipelines');
  const autoReviewHome = path.join(tmp, 'auto-review-home');
  const autoReviewEnv = { HOME: autoReviewHome };
  const autoReviewEnabled = await enableAutoReview({ env: autoReviewEnv, high: true });
  if (!autoReviewEnabled.enabled || autoReviewEnabled.profile_name !== 'sks-auto-review-high' || !autoReviewEnabled.high_profile) throw new Error('selftest: auto-review high profile was not enabled');
  const autoReviewConfig = await safeReadText(path.join(autoReviewHome, '.codex', 'config.toml'));
  if (!autoReviewConfig.includes('approvals_reviewer = "auto_review"') || autoReviewConfig.includes('approvals_reviewer = "guardian_subagent"') || !autoReviewConfig.includes('[profiles.sks-auto-review-high]')) throw new Error('selftest: auto-review config not written');
  const autoReviewDisabled = await disableAutoReview({ env: autoReviewEnv });
  if (autoReviewDisabled.enabled || autoReviewDisabled.approvals_reviewer !== 'user') throw new Error('selftest: auto-review disable did not restore user reviewer');
  const autoReviewDisabledConfig = await safeReadText(path.join(autoReviewHome, '.codex', 'config.toml'));
  if (autoReviewDisabledConfig.includes('approvals_reviewer = "guardian_subagent"')) throw new Error('selftest: auto-review disable left legacy reviewer values');
  const analysisAgentExists = await exists(path.join(tmp, '.codex', 'agents', 'analysis-scout.toml'));
  if (!analysisAgentExists) throw new Error('selftest: analysis scout agent not installed');
  const teamAgentExists = await exists(path.join(tmp, '.codex', 'agents', 'team-consensus.toml'));
  if (!teamAgentExists) throw new Error('selftest: team consensus agent not installed');
  const teamSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'team', 'SKILL.md'));
  if (!teamSkillExists) throw new Error('selftest: $Team skill not installed');
  const honestSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'honest-mode', 'SKILL.md'));
  if (!honestSkillExists) throw new Error('selftest: honest-mode skill not installed');
  const autoResearchSkillExists = await exists(path.join(tmp, '.agents', 'skills', 'autoresearch-loop', 'SKILL.md'));
  if (!autoResearchSkillExists) throw new Error('selftest: autoresearch-loop skill not installed');
  const requiredSkillsStatus = await checkRequiredSkills(tmp);
  if (!requiredSkillsStatus.ok) throw new Error(`selftest: required skills missing: ${requiredSkillsStatus.missing.join(', ')}`);
  const c7Status = await checkContext7(tmp);
  if (!c7Status.ok || !c7Status.project.ok) throw new Error('selftest: Context7 check failed for project config');
  if (hasContext7ConfigText('[mcp_servers.other]\ncommand = "npx"\n')) throw new Error('selftest: missing Context7 config passed structural check');
  const mockContext7Path = path.join(tmp, 'mock-context7.mjs');
  await writeTextAtomic(mockContext7Path, `process.stdin.setEncoding('utf8');\nlet buf='';\nfunction send(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');}\nprocess.stdin.on('data',(chunk)=>{buf+=chunk;for(;;){const i=buf.indexOf('\\n');if(i<0)break;const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;const msg=JSON.parse(line);if(!msg.id)continue;if(msg.method==='initialize')send(msg.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'Mock Context7',version:'0.0.0'}});else if(msg.method==='tools/list')send(msg.id,{tools:[{name:'resolve-library-id'},{name:'query-docs'}]});else if(msg.method==='tools/call'&&msg.params.name==='resolve-library-id')send(msg.id,{content:[{type:'text',text:'Context7-compatible library ID: /mock/lib'}]});else if(msg.method==='tools/call'&&msg.params.name==='query-docs')send(msg.id,{content:[{type:'text',text:'mock docs for '+msg.params.arguments.libraryId}]});else send(msg.id,{content:[{type:'text',text:'unknown'}],isError:true});}});\n`);
  const mockContext7Docs = await context7Docs('Mock Lib', { command: process.execPath, args: [mockContext7Path], query: 'hooks', timeoutMs: 5000 });
  if (!mockContext7Docs.ok || mockContext7Docs.docs_tool !== 'query-docs' || mockContext7Docs.library_id !== '/mock/lib') throw new Error('selftest: local Context7 MCP client did not resolve/query docs');
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
  if (incompleteGateStop?.decision !== 'block' || !String(incompleteGateStop.reason || '').includes('triwiki_validated')) throw new Error('selftest: incomplete Team gate was not blocked');
  const routeGateTmp = tmpdir();
  await initProject(routeGateTmp, {});
  const { id: gateId, dir: gateDir } = await createMission(routeGateTmp, { mode: 'team', prompt: 'Context7 gate test' });
  await writeJsonAtomic(path.join(gateDir, 'team-roster.json'), { schema_version: 1, mission_id: gateId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(gateDir, 'team-gate.json'), passedTeamGate);
  await setCurrent(routeGateTmp, { mission_id: gateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: true, stop_gate: 'team-gate.json' });
  const gateState = await readJson(stateFile(routeGateTmp), {});
  const missingC7Stop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingC7Stop?.decision !== 'block' || !String(missingC7Stop.reason || '').includes('Context7')) throw new Error('selftest: Stop hook did not block missing Context7 evidence');
  const rosterArtifactGateTmp = tmpdir();
  await initProject(rosterArtifactGateTmp, {});
  const { id: rosterArtifactGateId, dir: rosterArtifactGateDir } = await createMission(rosterArtifactGateTmp, { mode: 'team', prompt: 'team roster artifact gate test' });
  await writeJsonAtomic(path.join(rosterArtifactGateDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false });
  await setCurrent(rosterArtifactGateTmp, { mission_id: rosterArtifactGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, stop_gate: 'team-gate.json' });
  const rosterArtifactGateState = await readJson(stateFile(rosterArtifactGateTmp), {});
  const missingRosterArtifactStop = await evaluateStop(rosterArtifactGateTmp, rosterArtifactGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingRosterArtifactStop?.decision !== 'block' || !String(missingRosterArtifactStop.reason || '').includes('team-roster.json')) throw new Error('selftest: Team gate did not block missing team roster artifact');
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
  if (missingRuntimeGraphStop?.decision !== 'block' || !String(missingRuntimeGraphStop.reason || '').includes(TEAM_GRAPH_ARTIFACT)) throw new Error('selftest: Team gate did not block missing runtime graph artifacts');
  const fromChatCoverageTmp = tmpdir();
  await initProject(fromChatCoverageTmp, {});
  const { id: fromChatCoverageId, dir: fromChatCoverageDir } = await createMission(fromChatCoverageTmp, { mode: 'team', prompt: '$From-Chat-IMG coverage gate test' });
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-roster.json'), { schema_version: 1, mission_id: fromChatCoverageId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false, from_chat_img_required: true });
  await setCurrent(fromChatCoverageTmp, { mission_id: fromChatCoverageId, mode: 'TEAM', route: 'Team', route_command: '$From-Chat-IMG', phase: 'TEAM_REVIEW', context7_required: false, from_chat_img_required: true, stop_gate: 'team-gate.json' });
  const fromChatCoverageState = await readJson(stateFile(fromChatCoverageTmp), {});
  const missingFromChatCoverageFieldStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatCoverageFieldStop?.decision !== 'block' || !String(missingFromChatCoverageFieldStop.reason || '').includes('from_chat_img_request_coverage')) throw new Error('selftest: From-Chat-IMG coverage field did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, session_cleanup: false, from_chat_img_required: true, from_chat_img_request_coverage: true });
  const missingFromChatCoverageArtifactStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatCoverageArtifactStop?.decision !== 'block' || !String(missingFromChatCoverageArtifactStop.reason || '').includes(FROM_CHAT_IMG_COVERAGE_ARTIFACT)) throw new Error('selftest: From-Chat-IMG coverage artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_COVERAGE_ARTIFACT), { ...passedFromChatImgCoverageLedger, unresolved_items: ['ambiguous request'] });
  const unresolvedFromChatCoverageStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (unresolvedFromChatCoverageStop?.decision !== 'block' || !String(unresolvedFromChatCoverageStop.reason || '').includes(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:unresolved_items`)) throw new Error('selftest: From-Chat-IMG unresolved items did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_COVERAGE_ARTIFACT), passedFromChatImgCoverageLedger);
  const missingFromChatChecklistStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatChecklistStop?.decision !== 'block' || !String(missingFromChatChecklistStop.reason || '').includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT)) throw new Error('selftest: From-Chat-IMG checklist artifact did not block Team gate');
  await writeTextAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_CHECKLIST_ARTIFACT), passedFromChatImgChecklist.replace('- [x] req-1', '- [ ] req-1'));
  const uncheckedFromChatChecklistStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (uncheckedFromChatChecklistStop?.decision !== 'block' || !String(uncheckedFromChatChecklistStop.reason || '').includes(`${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}:unchecked_items`)) throw new Error('selftest: From-Chat-IMG unchecked checklist item did not block Team gate');
  await writeTextAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_CHECKLIST_ARTIFACT), passedFromChatImgChecklist);
  const missingFromChatTempTriWikiStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatTempTriWikiStop?.decision !== 'block' || !String(missingFromChatTempTriWikiStop.reason || '').includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT)) throw new Error('selftest: From-Chat-IMG temporary TriWiki artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), { ...passedFromChatImgTempTriWiki, expires_after_sessions: FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS + 1 });
  const invalidFromChatTempTriWikiStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (invalidFromChatTempTriWikiStop?.decision !== 'block' || !String(invalidFromChatTempTriWikiStop.reason || '').includes(`${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}:expires_after_sessions`)) throw new Error('selftest: From-Chat-IMG temporary TriWiki TTL did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), passedFromChatImgTempTriWiki);
  const missingFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingFromChatQaLoopStop?.decision !== 'block' || !String(missingFromChatQaLoopStop.reason || '').includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest: From-Chat-IMG scoped QA-LOOP artifact did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, unresolved_findings: 1 });
  const unresolvedFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (unresolvedFromChatQaLoopStop?.decision !== 'block' || !String(unresolvedFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:unresolved_findings`)) throw new Error('selftest: From-Chat-IMG scoped QA-LOOP findings did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, work_order_item_ids_covered: [] });
  const uncoveredFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (uncoveredFromChatQaLoopStop?.decision !== 'block' || !String(uncoveredFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:work_order_item_ids_covered`)) throw new Error('selftest: From-Chat-IMG scoped QA-LOOP work item coverage did not block Team gate');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), { ...passedFromChatImgQaLoop, computer_use_evidence_source: 'playwright', evidence: ['Playwright visual verification'] });
  const forbiddenFromChatQaLoopStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (forbiddenFromChatQaLoopStop?.decision !== 'block' || !String(forbiddenFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:computer_use_evidence_source`) || !String(forbiddenFromChatQaLoopStop.reason || '').includes(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:forbidden_browser_automation_evidence`)) throw new Error('selftest: From-Chat-IMG scoped QA-LOOP accepted forbidden browser automation evidence');
  await writeJsonAtomic(path.join(fromChatCoverageDir, FROM_CHAT_IMG_QA_LOOP_ARTIFACT), passedFromChatImgQaLoop);
  await writeJsonAtomic(path.join(fromChatCoverageDir, 'team-gate.json'), { ...passedTeamGate, from_chat_img_required: true, from_chat_img_request_coverage: true });
  const coveredFromChatStop = await evaluateStop(fromChatCoverageTmp, fromChatCoverageState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (coveredFromChatStop?.decision !== 'block' || String(coveredFromChatStop.reason || '').includes('from-chat-img') || !String(coveredFromChatStop.reason || '').includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest: valid From-Chat-IMG artifacts did not hand off to session cleanup gate');
  await recordContext7Evidence(routeGateTmp, gateState, { tool_name: 'mcp__context7__resolve_library_id', library: 'react' });
  const resolveOnlyStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (resolveOnlyStop?.decision !== 'block') throw new Error('selftest: resolve-only Context7 evidence unblocked route');
  await recordContext7Evidence(routeGateTmp, gateState, { tool_name: 'mcp__context7__query_docs', library_id: '/facebook/react' });
  const missingCleanupStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingCleanupStop?.decision !== 'block' || !String(missingCleanupStop.reason || '').includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest: Team route did not block missing session cleanup gate');
  await writeJsonAtomic(path.join(gateDir, TEAM_SESSION_CLEANUP_ARTIFACT), passedTeamSessionCleanup);
  const missingReflectionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingReflectionStop?.decision !== 'block' || !String(missingReflectionStop.reason || '').includes('reflection')) throw new Error('selftest: full route did not block missing reflection gate');
  const missingReflectionNoQuestionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: true });
  if (missingReflectionNoQuestionStop?.decision !== 'block' || !String(missingReflectionNoQuestionStop.reason || '').includes('reflection')) throw new Error('selftest: no-question route did not block missing reflection gate');
  await writeTextAtomic(path.join(gateDir, REFLECTION_ARTIFACT), '# Post-Route Reflection\n\nNo issue selftest.\n');
  await writeJsonAtomic(path.join(gateDir, REFLECTION_GATE), { schema_version: 1, passed: true, mission_id: gateId, route: '$Team', reflection_artifact: true, lessons_recorded: false, no_issue_acknowledged: true, triwiki_recorded: false, wiki_refreshed_or_packed: true, wiki_validated: true, created_at: nowIso() });
  const c7Unblocked = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (c7Unblocked?.decision === 'block') throw new Error('selftest: full Context7 evidence did not unblock route gate');
  await appendJsonlBounded(path.join(gateDir, 'team-transcript.jsonl'), { ts: new Date(Date.now() + 5000).toISOString(), agent: 'parent_orchestrator', phase: 'IMPLEMENTATION', type: 'status', message: 'work after reflection selftest' });
  const staleReflectionStop = await evaluateStop(routeGateTmp, gateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (staleReflectionStop?.decision !== 'block' || !String(staleReflectionStop.reason || '').includes('work_after_reflection')) throw new Error('selftest: post-reflection work did not stale the reflection gate');
  const subagentGateTmp = tmpdir();
  await initProject(subagentGateTmp, {});
  const { id: subagentGateId, dir: subagentGateDir } = await createMission(subagentGateTmp, { mode: 'team', prompt: 'subagent evidence gate test' });
  await writeJsonAtomic(path.join(subagentGateDir, 'team-roster.json'), { schema_version: 1, mission_id: subagentGateId, confirmed: true, source: 'selftest' });
  await writeJsonAtomic(path.join(subagentGateDir, 'team-gate.json'), passedTeamGate);
  await setCurrent(subagentGateTmp, { mission_id: subagentGateId, mode: 'TEAM', route: 'Team', route_command: '$Team', phase: 'TEAM_REVIEW', context7_required: false, subagents_required: true, stop_gate: 'team-gate.json' });
  const subagentGateState = await readJson(stateFile(subagentGateTmp), {});
  const missingSubagentStop = await evaluateStop(subagentGateTmp, subagentGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (missingSubagentStop?.decision !== 'block' || !String(missingSubagentStop.reason || '').includes('subagent')) throw new Error('selftest: Stop hook did not block missing subagent evidence');
  await recordSubagentEvidence(subagentGateTmp, subagentGateState, { tool_name: 'spawn_agent', agent_type: 'worker' });
  await writeJsonAtomic(path.join(subagentGateDir, TEAM_SESSION_CLEANUP_ARTIFACT), passedTeamSessionCleanup);
  await writeTextAtomic(path.join(subagentGateDir, REFLECTION_ARTIFACT), '# Post-Route Reflection\n\nNo issue selftest.\n');
  await writeJsonAtomic(path.join(subagentGateDir, REFLECTION_GATE), { schema_version: 1, passed: true, mission_id: subagentGateId, route: '$Team', reflection_artifact: true, lessons_recorded: false, no_issue_acknowledged: true, triwiki_recorded: false, wiki_refreshed_or_packed: true, wiki_validated: true, created_at: nowIso() });
  const subagentUnblocked = await evaluateStop(subagentGateTmp, subagentGateState, { last_assistant_message: 'SKS Honest Mode verification evidence gap' }, { noQuestion: false });
  if (subagentUnblocked?.decision === 'block') throw new Error('selftest: subagent evidence did not unblock route gate');
  const { id: teamId, dir: teamDir } = await createMission(tmp, { mode: 'team', prompt: '병렬 구현 팀 테스트' });
  const teamPlan = buildTeamPlan(teamId, '병렬 구현 팀 테스트');
  await writeJsonAtomic(path.join(teamDir, 'team-plan.json'), teamPlan);
  if (teamPlan.agent_session_count !== 5) throw new Error('selftest: team default sessions not 5');
  if (teamPlan.role_counts.executor !== 3 || teamPlan.role_counts.user !== 1 || teamPlan.role_counts.reviewer !== 5) throw new Error('selftest: team default role counts invalid');
  const teamPlanFeatureFlags = teamPlan.codex_config_required?.features || {};
  const missingTeamPlanFeatureFlags = missingGeneratedCodexAppFeatureFlags(teamPlanFeatureFlags);
  if (missingTeamPlanFeatureFlags.length || teamPlanFeatureFlags.codex_hooks === true) throw new Error(`selftest: team plan Codex config missing required app flags or still uses deprecated codex_hooks: ${missingTeamPlanFeatureFlags.join(', ')}`);
  if (!teamPlan.review_gate?.passed || teamPlan.review_gate.required_reviewer_lanes !== 5) throw new Error('selftest: team review policy gate did not pass default plan');
  if (teamPlan.codex_config_required?.service_tier !== 'fast' || teamPlan.reasoning?.service_tier !== 'fast') throw new Error('selftest: team plan did not require Fast service tier');
  if (!teamPlan.goal_continuation?.enabled || teamPlan.goal_continuation?.mode !== 'ambient_codex_native_goal_overlay') throw new Error('selftest: Team plan did not include ambient Goal continuation');
  if (!teamPlan.roster.analysis_team.every((agent) => agent.service_tier === 'fast' && agent.reasoning_effort && agent.reasoning_profile)) throw new Error('selftest: analysis scouts missing dynamic Fast reasoning metadata');
  const simpleTeamPlan = buildTeamPlan(teamId, '$Team 간단한 코드 수정');
  if (!simpleTeamPlan.roster.analysis_team.some((agent) => agent.reasoning_effort === 'low')) throw new Error('selftest: simple Team prompt did not allow low-reasoning scouts');
  const toolingTeamPlan = buildTeamPlan(teamId, '$Team tmux CLI tool-calling runtime fix');
  if (!toolingTeamPlan.roster.analysis_team.some((agent) => agent.reasoning_effort === 'medium')) throw new Error('selftest: tool-heavy Team prompt did not assign medium-reasoning scouts');
  const researchTeamPlan = buildTeamPlan(teamId, '$Team external library research and current docs update');
  if (!researchTeamPlan.roster.analysis_team.some((agent) => agent.reasoning_effort === 'high')) throw new Error('selftest: research/docs Team prompt did not assign high-reasoning scouts');
  const underProvisionedReviewCount = 2;
  const blockedReviewGate = evaluateTeamReviewPolicyGate({ roleCounts: { reviewer: underProvisionedReviewCount }, agentSessions: 3, roster: { validation_team: [{ id: 'reviewer_1', role: 'reviewer' }] } });
  if (blockedReviewGate.passed || !blockedReviewGate.blockers.includes('validation_team_reviewers_below_required')) throw new Error('selftest: team review policy gate did not block under-provisioned review');
  if (teamPlan.phases[0]?.id !== 'team_roster_confirmation' || teamPlan.phases[1]?.id !== 'parallel_analysis_scouting' || teamPlan.phases[2]?.id !== 'triwiki_refresh') throw new Error('selftest: team plan is not roster-first then scout-first');
  if (teamPlan.roster.debate_team.length !== 3 || !teamPlan.roster.debate_team.some((agent) => agent.id === 'debate_user_1') || !teamPlan.roster.development_team.some((agent) => agent.id === 'executor_3')) throw new Error('selftest: team roster missing default agents');
  if (teamPlan.roster.analysis_team.length !== teamPlan.role_counts.executor || !teamPlan.roster.analysis_team.some((agent) => agent.id === 'analysis_scout_3')) throw new Error('selftest: team analysis scout roster missing default agents');
  if (!teamPlan.required_artifacts.includes('team-roster.json') || !teamPlan.required_artifacts.includes('team-analysis.md') || !teamPlan.required_artifacts.includes(TEAM_SESSION_CLEANUP_ARTIFACT)) throw new Error('selftest: team plan missing required artifacts');
  if (teamPlan.team_runtime?.graph_artifact !== TEAM_GRAPH_ARTIFACT || !teamPlan.required_artifacts.includes(TEAM_RUNTIME_TASKS_ARTIFACT) || !teamPlan.required_artifacts.includes(TEAM_DECOMPOSITION_ARTIFACT) || !teamPlan.required_artifacts.includes(TEAM_INBOX_DIR)) throw new Error('selftest: team plan missing runtime graph metadata/artifacts');
  if (!teamPlan.phases.some((phase) => phase.id === 'runtime_task_graph_compile')) throw new Error('selftest: team plan missing runtime task graph compile phase');
  const teamRuntime = await writeTeamRuntimeArtifacts(teamDir, teamPlan, { contractHash: 'selftest' });
  const teamRuntimeValidation = await validateTeamRuntimeArtifacts(teamDir);
  if (!teamRuntimeValidation.ok) throw new Error(`selftest: team runtime graph validation failed: ${teamRuntimeValidation.issues.join(', ')}`);
  if (!teamRuntime.runtime.tasks.every((task) => (task.depends_on || []).every((dep) => String(dep).startsWith('task-')))) throw new Error('selftest: team runtime graph dependencies are not concrete task ids');
  if (!Object.keys(teamRuntime.inboxes || {}).length || !teamRuntime.report.inboxes.length) throw new Error('selftest: team runtime graph did not write worker inboxes');
  if (teamPlan.context_tracking?.ssot !== 'triwiki' || !teamPlan.required_artifacts.includes('.sneakoscope/wiki/context-pack.json')) throw new Error('selftest: team plan missing TriWiki context tracking');
  if (!teamPlan.context_tracking?.stage_policy?.includes('before_each_route_stage_read_relevant_context_pack')) throw new Error('selftest: team plan missing per-stage TriWiki policy');
  if (!teamPlan.invariants.some((item) => item.includes('chat-history screenshots'))) throw new Error('selftest: team invariants missing chat capture matching');
  if (!teamPlan.invariants.some((item) => item.includes('request coverage'))) throw new Error('selftest: team invariants missing From-Chat-IMG request coverage');
  if (!teamPlan.phases.some((phase) => String(phase.goal || '').includes('refreshes/validates TriWiki before implementation handoff'))) throw new Error('selftest: team plan missing mid-pipeline TriWiki refresh');
  const fromChatTeamPlan = buildTeamPlan(teamId, '$From-Chat-IMG 채팅 기록 이미지와 첨부 원본 이미지로 고객 요청 작업 지시서 작성');
  if (fromChatTeamPlan.prompt_command !== '$From-Chat-IMG') throw new Error('selftest: From-Chat-IMG team plan did not preserve prompt command');
  if (!fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_COVERAGE_ARTIFACT)) throw new Error('selftest: From-Chat-IMG team plan missing coverage ledger artifact');
  if (!fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT) || !fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT) || !fromChatTeamPlan.required_artifacts.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT)) throw new Error('selftest: From-Chat-IMG team plan missing checklist/temp TriWiki/QA artifacts');
  if (!fromChatTeamPlan.phases.some((phase) => phase.id === 'from_chat_img_coverage_reconciliation')) throw new Error('selftest: From-Chat-IMG team plan missing coverage reconciliation phase');
  if (!fromChatTeamPlan.invariants.some((item) => item.includes('unresolved_items=[]'))) throw new Error('selftest: From-Chat-IMG team plan missing zero-unresolved invariant');
  if (!fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_CHECKLIST_ARTIFACT)) || !fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT)) || !fromChatTeamPlan.invariants.some((item) => item.includes(FROM_CHAT_IMG_QA_LOOP_ARTIFACT))) throw new Error('selftest: From-Chat-IMG team plan missing checklist/temp TriWiki/QA invariants');
  const teamWorkflow = teamWorkflowMarkdown(teamPlan);
  if (!teamWorkflow.includes('SSOT: triwiki') || !teamWorkflow.includes('Analysis Scouts') || !teamWorkflow.includes('sks wiki validate')) throw new Error('selftest: team workflow missing scout-first TriWiki context tracking');
  if (!teamWorkflow.includes('sks team open-tmux')) throw new Error('selftest: team workflow missing existing-mission tmux open command');
  if (!teamWorkflow.includes(TEAM_GRAPH_ARTIFACT) || !teamWorkflow.includes(TEAM_INBOX_DIR)) throw new Error('selftest: team workflow missing runtime graph/inbox guidance');
  if (!teamWorkflow.includes('before every stage') || !teamWorkflow.includes('after findings/artifact changes')) throw new Error('selftest: team workflow missing per-stage TriWiki policy');
  const customTeamPlan = buildTeamPlan(teamId, '병렬 구현 팀 테스트', { agentSessions: 5 });
  if (customTeamPlan.agent_session_count !== 5) throw new Error('selftest: custom team sessions not honored');
  if (parseTeamCreateArgs(['--agents', '4', '작업']).agentSessions !== 5) throw new Error('selftest: team --agents parsing');
  const maxAgentParsed = parseTeamCreateArgs(['--max-agents', '작업']);
  if (maxAgentParsed.agentSessions !== 6 || maxAgentParsed.roleCounts.executor !== 6) throw new Error('selftest: team --max-agents parsing');
  const maxTextParsed = parseTeamSpecText('가용가능한 최대 agents로 분석하고 구현');
  if (maxTextParsed.agentSessions !== 6 || maxTextParsed.roleCounts.executor !== 6) throw new Error('selftest: team max-agent text parsing');
  const roleParsed = parseTeamCreateArgs(['executor:5', 'reviewer:6', 'user:1', '작업']);
  if (roleParsed.roleCounts.executor !== 5 || roleParsed.roleCounts.reviewer !== 6 || roleParsed.agentSessions !== 6 || roleParsed.prompt !== '작업') throw new Error('selftest: team role-count parsing');
  const openTmuxFlagParsed = parseTeamCreateArgs(['--open-tmux', '작업']);
  if (openTmuxFlagParsed.prompt !== '작업') throw new Error('selftest: team --open-tmux leaked into prompt');
  const noOpenTmuxFlagParsed = parseTeamCreateArgs(['--no-open-tmux', '작업']);
  if (noOpenTmuxFlagParsed.prompt !== '작업') throw new Error('selftest: team --no-open-tmux leaked into prompt');
  const roleTeamPlan = buildTeamPlan(teamId, '역할 팀 테스트', { roleCounts: roleParsed.roleCounts });
  if (roleTeamPlan.roster.debate_team.length !== 5) throw new Error('selftest: executor role count not reflected in debate team size');
  if (roleTeamPlan.roster.analysis_team.length !== 5) throw new Error('selftest: executor role count not reflected in analysis scout team');
  if (roleTeamPlan.roster.development_team.filter((agent) => agent.role === 'executor').length !== 5) throw new Error('selftest: executor role count not reflected in development team');
  if (!roleTeamPlan.roster.debate_team.some((agent) => /inconvenience/.test(agent.persona))) throw new Error('selftest: user friction persona missing from debate team');
  const tmuxTeam = await launchTmuxTeamView({ root: tmp, missionId: teamId, plan: roleTeamPlan, json: true });
  if (!tmuxTeam.agents?.length || !tmuxTeam.agents.some((entry) => entry.agent === 'analysis_scout_1') || !tmuxTeam.agents.every((entry) => String(entry.command || '').includes('team lane') && String(entry.command || '').includes('--agent'))) throw new Error('selftest: Team tmux view did not expose agent live lanes');
  if (!roleTeamPlan.roster.analysis_team.every((agent) => tmuxTeam.agents.some((entry) => entry.agent === agent.id))) throw new Error('selftest: Team tmux view collapsed numbered analysis scout lanes');
  if (!tmuxTeam.overview?.command?.includes('team watch') || !tmuxTeam.lanes?.some((entry) => entry.role === 'overview') || !tmuxTeam.lanes?.some((entry) => entry.agent === 'analysis_scout_1')) throw new Error('selftest: Team tmux view did not expose orchestration overview plus agent lanes');
  if (tmuxTeam.split_ui?.mode !== 'single_window_split_panes' || tmuxTeam.split_ui?.layout !== 'main-vertical' || tmuxTeam.split_ui?.right_side_only !== true || tmuxTeam.split_ui?.live_updates !== true) throw new Error('selftest: tmux UI');
  if (String(tmuxTeam.overview?.command || '').includes('SNEAKOSCOPE CODEX') || !String(tmuxTeam.overview?.command || '').includes('Follow: team watch')) throw new Error('selftest: Team tmux pane banner is too noisy or missing compact follow hint');
  if (teamLaneStyle('analysis_scout_1').role !== 'scout' || teamLaneStyle('executor_1').role !== 'execution' || teamLaneStyle('reviewer_1').role !== 'review') throw new Error('selftest: Team tmux role palette did not classify lane roles');
  if (!String(tmuxTeam.cleanup_policy || '').includes('mark-complete') || !tmuxTeam.lanes.every((entry) => entry.style?.color && entry.title)) throw new Error('selftest: Team tmux view did not expose color/title metadata and cleanup policy');
  if (tmuxTeam.session !== `sks-team-${teamId}` || !tmuxTeam.attach_command?.includes(`sks-team-${teamId}`)) throw new Error('selftest: Team tmux session is not named for visibility');
  const fakeTmuxDir = path.join(tmp, 'fake-tmux');
  await ensureDir(fakeTmuxDir);
  const fakeTmuxLog = path.join(fakeTmuxDir, 'tmux.log');
  const fakeTmuxBin = path.join(fakeTmuxDir, 'tmux');
  await writeTextAtomic(fakeTmuxBin, `#!/usr/bin/env node\nconst{appendFileSync:a}=require('fs'),e=process.env,r=process.argv.slice(2),c=r[0];if(e.SKS_FAKE_TMUX_LOG)a(e.SKS_FAKE_TMUX_LOG,r.join(' ')+'\\n');if(c==='new-session')console.log('%1');else if(c==='split-window')console.log(e.SKS_FAKE_TMUX_SPLIT_ID||'%2');else if(c==='list-windows')console.log('@1');else if(c==='display-message')console.log(e.SKS_FAKE_TMUX_DISPLAY||'sks-existing-selftest\\t@1\\t%1');else if(c==='list-sessions')console.log(e.SKS_FAKE_TMUX_SESSIONS||'');else if(c==='list-panes'){let t=r[r.indexOf('-t')+1]||'';console.log(t[0]=='%'&&r.join(' ').includes('pane_dead')?'0\\t'+t:e.SKS_FAKE_TMUX_LIST||'')}\n`);
  await fsp.chmod(fakeTmuxBin, 0o755);
  const previousFakeTmuxLog = process.env.SKS_FAKE_TMUX_LOG;
  const previousPath = process.env.PATH;
  process.env.SKS_FAKE_TMUX_LOG = fakeTmuxLog;
  process.env.PATH = `${fakeTmuxDir}${path.delimiter}${previousPath || ''}`;
  const recreatedTmux = await createTmuxSession({ root: tmp, session: 'sks-existing-selftest', tmux: { bin: fakeTmuxBin }, codex: { bin: process.execPath } }, [
    { cwd: tmp, command: 'pwd', role: 'overview' },
    { cwd: tmp, command: 'pwd', role: 'lane' }
  ], { recreate: true });
  const fakeTmuxLogText = await safeReadText(fakeTmuxLog);
  if (!recreatedTmux.ok || !fakeTmuxLogText.includes('kill-session -t sks-existing-selftest') || !fakeTmuxLogText.includes('new-session') || !fakeTmuxLogText.includes('split-window')) throw new Error('selftest: tmux recreate did not replace stale existing session with split panes');
  if (!recreatedTmux.dynamic_resize?.enabled || !fakeTmuxLogText.includes('list-windows -t sks-existing-selftest -F #{window_id}') || !fakeTmuxLogText.includes('set-window-option -t @1 window-size latest') || !fakeTmuxLogText.includes('set-hook -t sks-existing-selftest client-resized') || !fakeTmuxLogText.includes('resize-window -t @1 -A')) throw new Error('selftest: tmux dynamic resize hooks were not installed for split panes');
  if (recreatedTmux.layout !== 'tiled' || Number(recreatedTmux.initial_size?.width || 0) < 120 || Number(recreatedTmux.initial_size?.height || 0) < 36) throw new Error('selftest: tmux dynamic resize metadata missing normalized initial size/layout');
  await ensureDir(path.join(tmp, '.sneakoscope', 'state'));
  await writeJsonAtomic(path.join(tmp, '.sneakoscope', 'state', 'tmux-sessions.json'), {
    schema_version: 1,
    sessions: {
      'sks-existing-selftest': {
        session: 'sks-existing-selftest',
        root: tmp,
        panes: [{ pane_id: '%1', role: 'codex', title: 'Codex CLI' }]
      }
    }
  });
  await writeTextAtomic(fakeTmuxLog, '');
  process.env.SKS_FAKE_TMUX_DISPLAY = 'sks-existing-selftest\t@1\t%1';
  process.env.SKS_FAKE_TMUX_LIST = '';
  process.env.SKS_FAKE_TMUX_SPLIT_ID = '%80';
  const cockpitOpen = await reconcileTmuxTeamCockpit({
    root: tmp,
    missionId: teamId,
    plan: roleTeamPlan,
    dashboard: { agents: { analysis_scout_1: { status: 'assigned' } } },
    control: { status: 'running' },
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const cockpitOpenLog = await safeReadText(fakeTmuxLog);
  if (!cockpitOpen.ok || cockpitOpen.opened_lane_count !== 2 || cockpitOpen.main_pane_id !== '%1' || cockpitOpen.relayout?.layout_name !== 'main-vertical' || !cockpitOpenLog.includes('display-message -p') || !cockpitOpenLog.includes('split-window -h -t %1') || !cockpitOpenLog.includes('set-option -pt %80 @sks_team_managed 1') || !cockpitOpenLog.includes('select-pane -t %1') || !cockpitOpenLog.includes('select-layout -t @1 main-vertical')) throw new Error('selftest: split');
  await writeTextAtomic(fakeTmuxLog, '');
  process.env.SKS_FAKE_TMUX_SPLIT_ID = '%90';
  process.env.SKS_FAKE_TMUX_LIST = `%81\tscout: analysis_scout_1\tnode\t1\t${teamId}\tanalysis_scout_1\tscout\n%82\tscout: analysis_scout_1\tnode\t1\t${teamId}\tanalysis_scout_1\tscout\n%84\tscout: analysis_scout_old\tnode\t1\told-team-mission\tanalysis_scout_old\tscout`;
  const cockpitDedupe = await reconcileTmuxTeamCockpit({
    root: tmp,
    missionId: teamId,
    plan: roleTeamPlan,
    dashboard: { agents: { analysis_scout_1: { status: 'assigned' } } },
    control: { status: 'running' },
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const cockpitDedupeLog = await safeReadText(fakeTmuxLog);
  if (!cockpitDedupe.ok || cockpitDedupe.closed_lane_count !== 2 || !cockpitDedupeLog.includes('kill-pane -t %82') || !cockpitDedupeLog.includes('kill-pane -t %84') || cockpitDedupeLog.includes('kill-pane -t %81')) throw new Error('selftest: tmux cockpit did not prune duplicate or stale managed panes');
  await writeTextAtomic(fakeTmuxLog, '');
  process.env.SKS_FAKE_TMUX_LIST = `%81\tscout: analysis_scout_1\tnode\t1\t${teamId}\tanalysis_scout_1\tscout`;
  const cockpitTerminal = await reconcileTmuxTeamCockpit({
    root: tmp,
    missionId: teamId,
    plan: roleTeamPlan,
    dashboard: { agents: { analysis_scout_1: { status: 'completed' } } },
    control: { status: 'running' },
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const cockpitTerminalLog = await safeReadText(fakeTmuxLog);
  if (!cockpitTerminal.ok || cockpitTerminal.closed_lane_count !== 1 || cockpitTerminal.opened_lane_count !== 0 || !cockpitTerminalLog.includes('kill-pane -t %81')) throw new Error('selftest: tmux cockpit did not close terminal agent pane');
  await writeTextAtomic(fakeTmuxLog, '');
  const staleTeamId = 'M-20260512-000000-old1';
  const missionDirOnlyTeamId = 'M-20260512-000000-dir1';
  await ensureDir(path.join(tmp, '.sneakoscope', 'missions', missionDirOnlyTeamId));
  await writeJsonAtomic(path.join(tmp, '.sneakoscope', 'state', 'tmux-team-sessions.json'), {
    schema_version: 1,
    missions: {
      [staleTeamId]: {
        mission_id: staleTeamId,
        session: `sks-team-${staleTeamId}`,
        root: tmp,
        panes: [{ pane_id: '%201', title: 'scout: analysis_scout_1' }]
      },
      [teamId]: {
        mission_id: teamId,
        session: 'sks-existing-selftest',
        root: tmp,
        panes: [{ pane_id: '%204', title: 'scout: analysis_scout_1' }]
      }
    }
  });
  process.env.SKS_FAKE_TMUX_LIST = [
    'sks-existing-selftest\t@1\t%1\tCodex CLI\tnode\t\t\t\t',
    `sks-team-${staleTeamId}\t@70\t%201\tscout: analysis_scout_1\tnode\t\t\t\t`,
    `sks-existing-selftest\t@1\t%202\treview: stale_review\tnode\t1\t${staleTeamId}\tstale_review\treview`,
    `sks-team-${missionDirOnlyTeamId}\t@71\t%205\treview: reviewer_1\tnode\t\t\t\t`,
    'unrelated-session\t@9\t%203\tscout: analysis_scout_1\tnode\t\t\t\t',
    `sks-existing-selftest\t@1\t%204\tscout: analysis_scout_1\tnode\t1\t${teamId}\tanalysis_scout_1\tscout`
  ].join('\n');
  const cockpitSweep = await sweepTmuxTeamSurfaces({
    root: tmp,
    keepMissionId: teamId,
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const cockpitSweepLog = await safeReadText(fakeTmuxLog);
  if (!cockpitSweep.ok || cockpitSweep.closed_lane_count !== 3 || !cockpitSweepLog.includes('kill-pane -t %201') || !cockpitSweepLog.includes('kill-pane -t %202') || !cockpitSweepLog.includes('kill-pane -t %205') || cockpitSweepLog.includes('kill-pane -t %203') || cockpitSweepLog.includes('kill-pane -t %204') || cockpitSweepLog.includes('kill-pane -t %1')) throw new Error('selftest: tmux sweep did not close only stale recorded Team panes');
  await writeTextAtomic(fakeTmuxLog, '');
  const codexLbSuffix = defaultTmuxSessionName(tmp);
  const codexLbKeepSession = `sks-codex-lb-keep-${codexLbSuffix}`;
  const codexLbCurrentSession = `sks-codex-lb-current-${codexLbSuffix}`;
  process.env.SKS_FAKE_TMUX_DISPLAY = `${codexLbCurrentSession}\t@1\t%1`;
  process.env.SKS_FAKE_TMUX_SESSIONS = [
    `sks-codex-lb-old-${codexLbSuffix}\t0\t100\t100`,
    `sks-codex-lb-attached-${codexLbSuffix}\t1\t101\t101`,
    `${codexLbKeepSession}\t0\t102\t102`,
    `${codexLbCurrentSession}\t0\t103\t103`,
    'sks-codex-lb-other-sks-other-00000000\t0\t104\t104'
  ].join('\n');
  const codexLbSweep = await sweepCodexLbTmuxSessions({
    root: tmp,
    keepSession: codexLbKeepSession,
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const codexLbSweepLog = await safeReadText(fakeTmuxLog);
  if (!codexLbSweep.ok || codexLbSweep.closed_session_count !== 1 || !codexLbSweepLog.includes(`kill-session -t sks-codex-lb-old-${codexLbSuffix}`) || codexLbSweepLog.includes(`kill-session -t sks-codex-lb-attached-${codexLbSuffix}`) || codexLbSweepLog.includes(`kill-session -t ${codexLbKeepSession}`) || codexLbSweepLog.includes(`kill-session -t ${codexLbCurrentSession}`) || codexLbSweepLog.includes('kill-session -t sks-codex-lb-other')) throw new Error('selftest: codex-lb tmux sweep did not close only stale detached sessions for this repo');
  await writeTextAtomic(fakeTmuxLog, '');
  process.env.SKS_FAKE_TMUX_DISPLAY = 'sks-existing-selftest\t@1\t%1';
  const fakePanes = `%81\tscout: analysis_scout_1\tnode\t1\t${teamId}\tanalysis_scout_1\tscout\n%82\tscout: analysis_scout_2\tnode\t1\t${teamId}\tanalysis_scout_2\tscout\n%83\tuser pane\tzsh\t\t\t\t`;
  process.env.SKS_FAKE_TMUX_LIST = fakePanes;
  const cockpitClose = await reconcileTmuxTeamCockpit({
    root: tmp,
    missionId: teamId,
    plan: roleTeamPlan,
    dashboard: { agents: { analysis_scout_2: { status: 'assigned' } } },
    control: { status: 'cleanup_requested' },
    close: true,
    tmux: { bin: fakeTmuxBin },
    env: { ...process.env, TMUX: '/tmp/tmux-selftest/default,1,0' }
  });
  const cockpitCloseLog = await safeReadText(fakeTmuxLog);
  if (!cockpitClose.ok || cockpitClose.closed_lane_count !== 2 || !cockpitCloseLog.includes('kill-pane -t %81') || !cockpitCloseLog.includes('kill-pane -t %82') || cockpitCloseLog.includes('kill-pane -t %83')) throw new Error('selftest: cleanup');
  delete process.env.SKS_FAKE_TMUX_DISPLAY;
  delete process.env.SKS_FAKE_TMUX_LIST;
  delete process.env.SKS_FAKE_TMUX_SESSIONS;
  delete process.env.SKS_FAKE_TMUX_SPLIT_ID;
  await writeTextAtomic(fakeTmuxLog, '');
  const madCockpit = await launchMadTmuxUi(['--workspace', 'sks-mad-selftest-ui', '--no-attach'], { root: tmp, tmux: { ok: true, bin: fakeTmuxBin, version: '3.4' }, codex: { bin: process.execPath }, app: { ok: true, guidance: [] }, missionId: 'M-MAD-SELFTEST' });
  const madTmuxLogText = await safeReadText(fakeTmuxLog);
  if (!madCockpit.created || madCockpit.mode !== 'mad_session' || madCockpit.opened?.panes?.length !== 1 || !madTmuxLogText.includes('new-session') || madTmuxLogText.includes('split-window')) throw new Error('selftest: MAD tmux launch should create one pane and leave split panes to Team lanes');
  if (previousFakeTmuxLog === undefined) delete process.env.SKS_FAKE_TMUX_LOG;
  else process.env.SKS_FAKE_TMUX_LOG = previousFakeTmuxLog;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  const codexLaunchArgs = defaultCodexLaunchArgs({ SKS_CODEX_REASONING: 'low' }).join(' ');
  if (!codexLaunchArgs.includes('service_tier="fast"') || !codexLaunchArgs.includes('model_reasoning_effort="low"')) throw new Error('selftest: Codex tmux launch args do not force Fast service tier plus dynamic reasoning');
  await initTeamLive(teamId, teamDir, '역할 팀 테스트', { agentSessions: roleTeamPlan.agent_session_count, roleCounts: roleTeamPlan.role_counts, roster: roleTeamPlan.roster });
  const teamWatch = await renderTeamWatch(teamDir, { missionId: teamId });
  if (!roleTeamPlan.roster.analysis_team.every((agent) => teamWatch.includes(`- ${agent.id}:`))) throw new Error('selftest: Team watch overview collapsed numbered analysis scout lanes');
  if (routeReasoning(routePrompt('$Research frontier idea'), '$Research frontier idea').effort !== 'xhigh') throw new Error('selftest: research reasoning not xhigh');
  if (routeReasoning(routePrompt('$From-Chat-IMG 채팅 이미지 작업'), '$From-Chat-IMG 채팅 이미지 작업').effort !== 'xhigh') throw new Error('selftest: From-Chat-IMG reasoning not xhigh');
  if (routeReasoning(routePrompt('$Computer-Use localhost UI smoke'), '$Computer-Use localhost UI smoke').effort !== 'low') throw new Error('selftest: Computer Use fast lane reasoning not low');
  if (routeReasoning(routePrompt('$DB migration'), '$DB migration').effort !== 'high') throw new Error('selftest: logical reasoning not high');
  if (routeReasoning(routePrompt('$Team 간단한 코드 수정'), '$Team 간단한 코드 수정').effort !== 'low') throw new Error('selftest: simple Team reasoning not low');
  if (routeReasoning(routePrompt('$Team tmux CLI tool-calling fix'), '$Team tmux CLI tool-calling fix').effort !== 'medium') throw new Error('selftest: tool-heavy Team reasoning not medium');
  if (routeReasoning(routePrompt('$Team library research current docs'), '$Team library research current docs').effort !== 'high') throw new Error('selftest: research/docs Team reasoning not high');
  const lowReasoning = routeReasoning({ id: 'LowSmoke', reasoningPolicy: 'low' }, 'small metadata read');
  if (lowReasoning.effort !== 'low' || lowReasoning.profile !== 'sks-task-low') throw new Error('selftest: low reasoning did not route to sks-task-low');
  const forensicEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-IMG', route: 'from-chat-img', prompt: '$From-Chat-IMG screenshot match' });
  if (forensicEffort.selected_effort !== 'forensic_vision' || !validateEffortDecision(forensicEffort).ok) throw new Error('selftest: From-Chat-IMG effort did not select forensic_vision');
  const lowEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-LOW', is_deterministic: true, has_verified_skill: true });
  if (lowEffort.selected_effort !== 'low') throw new Error('selftest: deterministic verified skill did not select low effort');
  const recoveryEffort = selectEffort({ mission_id: 'selftest', task_id: 'TASK-RECOVERY', failure_count: 2 });
  if (recoveryEffort.selected_effort !== 'recovery') throw new Error('selftest: repeated failure did not select recovery effort');
  const invalidLedger = createWorkOrderLedger({ missionId: 'selftest', route: 'team', sourcesComplete: true, requests: [{ verbatim: 'do it', status: 'verified' }] });
  if (validateWorkOrderLedger(invalidLedger).ok) throw new Error('selftest: work-order ledger accepted verified item without evidence');
  const validLedger = createWorkOrderLedger({ missionId: 'selftest', route: 'team', sourcesComplete: true, requests: [{ verbatim: 'do it', implementation_tasks: ['TASK-001'], status: 'verified', implementation_evidence: ['file:src/core/routes.mjs'], verification_evidence: ['selftest'] }] });
  if (!validateWorkOrderLedger(validLedger).ok) throw new Error('selftest: valid work-order ledger rejected');
  const unresolvedVisualMap = buildFromChatImgVisualMap({ missionId: 'selftest', sources: [{ id: 'chat-img-1', type: 'chat_image', relevant: true, accounted_for: true }], regions: [{ image_id: 'chat-img-1', region_id: 'R01', status: 'uncertain' }] });
  if (validateFromChatImgVisualMap(unresolvedVisualMap).ok) throw new Error('selftest: unresolved From-Chat-IMG visual region accepted');
  const validVisualMap = buildFromChatImgVisualMap({ missionId: 'selftest', sources: [{ id: 'chat-img-1', type: 'chat_image', relevant: true, accounted_for: true }], regions: [{ image_id: 'chat-img-1', region_id: 'R01', observed_detail: 'button', matched_customer_request_ids: ['REQ-001'], confidence: 0.9, status: 'mapped' }] });
  if (!validateFromChatImgVisualMap(validVisualMap).ok) throw new Error('selftest: valid From-Chat-IMG visual map rejected');
  const dogfoodBlocked = createDogfoodReport({ scenario: 'selftest', computer_use_available: false, browser_available: false, cycles: 1, findings: [classifyDogfoodFinding({ id: 'DF-001', classification: 'fixable', description: 'broken' })], post_fix_verification_complete: false });
  if (validateDogfoodReport(dogfoodBlocked).ok) throw new Error('selftest: dogfood report accepted unresolved fixable finding');
  const dogfoodPassed = createDogfoodReport({ scenario: 'selftest', computer_use_available: true, browser_available: true, cycles: 2, findings: [classifyDogfoodFinding({ id: 'DF-001', classification: 'fixable', description: 'fixed', post_fix_verification: 'passed' })], post_fix_verification_complete: true });
  if (!validateDogfoodReport(dogfoodPassed).ok) throw new Error('selftest: dogfood report rejected post-fix verification');
  const skillCandidate = createSkillCandidate({ id: 'skill.from-chat-img.visual-work-order.v1', status: 'active', triggers: ['$From-Chat-IMG'], successful_runs: 3, files: ['.agents/skills/from-chat-img/SKILL.md'] });
  if (!validateSkillCandidate(skillCandidate).ok) throw new Error('selftest: active skill candidate rejected');
  const injection = decideSkillInjection({ route: 'from-chat-img', task_signature: 'reference images', skills: [skillCandidate, { ...skillCandidate, id: 'deprecated', status: 'deprecated' }] });
  if (!validateSkillInjectionDecision(injection).ok || injection.injected.length !== 1) throw new Error('selftest: skill injection did not respect active/top-K filtering');
  const skillDream = await skillDreamFixture(path.join(tmp, 'skill-dream-fixture'));
  if (!skillDream.passed) throw new Error('selftest: skill dreaming did not keep used skills, recommend unused generated skills, and preserve custom skills');
  const promptContext = buildPromptContext({ stable: ['stable'], policies: ['policy'], dynamic: ['dynamic'] });
  if (promptContext.blocks[0]?.cache_region !== 'stable_prefix' || promptContext.blocks.at(-1)?.cache_region !== 'dynamic_suffix') throw new Error('selftest: prompt context did not place dynamic context last');
  const repeatedMistake = await recordMistake(teamDir, { route: 'from-chat-img', gate: 'visual-map', reason: 'unmatched-reference' });
  const repeatedMistake2 = await recordMistake(teamDir, { route: 'from-chat-img', gate: 'visual-map', reason: 'unmatched-reference' });
  if (!repeatedMistake.ledger.entries.length || !repeatedMistake2.ledger.entries[0].prevention) throw new Error('selftest: repeated mistake did not attach prevention');
  if (routeReasoning(routePrompt('$DFix button label'), '$DFix button label').effort !== 'medium') throw new Error('selftest: simple reasoning not medium');
  if (routePrompt('이 파이프라인은 왜 이렇게 동작해?')?.id !== 'Answer') throw new Error('selftest: question prompt did not route to Answer');
  if (routePrompt('React useEffect 최신 문서 기준으로 설명해줘')?.id !== 'Answer') throw new Error('selftest: docs question did not route to Answer');
  if (routePrompt('질문을 하더라도 진짜 질문인지 아니면 질문형태를 띄는 암묵적인 지시인지를 반드시 파악해야해')?.id !== 'Team') throw new Error('selftest: question-shaped directive did not route to Team');
  if (routePrompt('근데 왜 팀원 구성을 안하고 작업을 하는 경우가 이렇게 많지?')?.id !== 'Team') throw new Error('selftest: question-shaped Team complaint did not route to Team');
  if (routePrompt('$DF button label')) throw new Error('selftest: deprecated $DF route still resolved');
  if (routePrompt('implement feature')?.id !== 'Team') throw new Error('selftest: implementation prompt did not default to Team');
  const broadMadTeamGoalPrompt = 'sks --mad tmux multi pane scout reasoning commit push $team $goal';
  if (routePrompt(broadMadTeamGoalPrompt)?.id !== 'Team') throw new Error('selftest: broad MAD/Team/Goal tmux request was misrouted away from Team');
  if (routePrompt('$SKS implement feature')?.id !== 'Team') throw new Error('selftest: $SKS implementation prompt did not promote to Team');
  if (routePrompt('$From-Chat-IMG 채팅 기록 이미지와 첨부 이미지로 고객사 요청 수정 작업 수행해줘')?.id !== 'Team') throw new Error('selftest: explicit chat capture client work did not promote to Team');
  if (routePrompt('$Computer-Use localhost 화면 빠르게 검증해줘')?.id !== 'ComputerUse') throw new Error('selftest: $Computer-Use did not route to ComputerUse fast lane');
  if (routePrompt('$CU localhost 화면 빠르게 검증해줘')?.id !== 'ComputerUse') throw new Error('selftest: $CU did not route to ComputerUse fast lane');
  if (routePrompt('computer use 사용하는 파이프라인은 마지막에 triwiki honest mode만 실행되게 조정해줘')?.id !== 'ComputerUse') throw new Error('selftest: Computer Use pipeline request was misrouted away from fast lane');
  if (routePrompt('triwiki나 honest mode가 마지막에만 실행되게 computer use 파이프라인 조정해줘')?.id !== 'ComputerUse') throw new Error('selftest: Computer Use directive was hijacked by Wiki route');
  if (routePrompt('$SKS show me available workflows')?.id !== 'SKS') throw new Error('selftest: $SKS workflow discovery should remain SKS');
  if (routeRequiresSubagents(routePrompt('이 파이프라인은 왜 이렇게 동작해?'), '이 파이프라인은 왜 이렇게 동작해?')) throw new Error('selftest: Answer route requires subagents');
  if (!routeRequiresSubagents(routePrompt('implement feature'), 'implement feature')) throw new Error('selftest: default Team implementation route does not require subagents');
  if (!routeRequiresSubagents(routePrompt('$Team implement feature'), '$Team implement feature')) throw new Error('selftest: Team route does not require subagents');
  if (routeRequiresSubagents(routePrompt('$Computer-Use localhost UI smoke'), '$Computer-Use localhost UI smoke')) throw new Error('selftest: Computer Use fast lane requires subagents');
  if (!routeRequiresSubagents(routePrompt('$Goal implement feature'), '$Goal implement feature')) throw new Error('selftest: Goal implementation route does not require subagents');
  if (routeRequiresSubagents(routePrompt('$Help commands'), '$Help commands')) throw new Error('selftest: Help route incorrectly requires subagents');
  if (!reflectionRequiredForRoute(routePrompt('$Team implement feature'))) throw new Error('selftest: Team route does not require reflection');
  if (reflectionRequiredForRoute(routePrompt('$Computer-Use localhost UI smoke'))) throw new Error('selftest: Computer Use fast lane requires full-route reflection');
  if (!reflectionRequiredForRoute(routePrompt('$DB migration'))) throw new Error('selftest: DB route does not require reflection');
  if (reflectionRequiredForRoute(routePrompt('$DFix button label'))) throw new Error('selftest: DFix route incorrectly requires reflection');
  if (reflectionRequiredForRoute(routePrompt('이 파이프라인은 왜 이렇게 동작해?'))) throw new Error('selftest: Answer route incorrectly requires reflection');
  if (!teamPlan.phases.some((phase) => phase.id === 'parallel_implementation')) throw new Error('selftest: team plan missing implementation phase');
  await initTeamLive(teamId, teamDir, '병렬 구현 팀 테스트', { roleCounts: roleParsed.roleCounts });
  await appendTeamEvent(teamDir, { agent: 'analysis_scout_1', phase: 'parallel_analysis_scouting', message: 'selftest mapped repo slice' });
  await appendTeamEvent(teamDir, { agent: 'team_consensus', phase: 'planning_debate', message: 'selftest mapped options' });
  const teamDashboard = await readTeamDashboard(teamDir);
  if (teamDashboard?.agent_session_count !== 6 || teamDashboard?.role_counts?.executor !== 5 || teamDashboard?.role_counts?.reviewer !== 6) throw new Error('selftest: team dashboard session/role budget missing');
  await writeTeamDashboardState(teamDir, { missionId: teamId, mission: { id: teamId, mode: 'team' }, effort: 'high', phase: 'verification' });
  const teamDashboardState = await readJson(path.join(teamDir, ARTIFACT_FILES.team_dashboard_state), {});
  if (!validateTeamDashboardState(teamDashboardState).ok || !renderTeamDashboardState(teamDashboardState).includes('Mission / Goal View')) throw new Error('selftest: Team dashboard state missing required cockpit panes');
  if (teamDashboard?.context_tracking?.ssot !== 'triwiki') throw new Error('selftest: team dashboard missing TriWiki context tracking');
  if (!teamDashboard?.phases?.includes('parallel_analysis_scouting')) throw new Error('selftest: team dashboard missing analysis scout phase');
  if (!teamDashboard?.latest_messages?.some((entry) => entry.agent === 'analysis_scout_1')) throw new Error('selftest: team live dashboard missing analysis scout event');
  if (!teamDashboard?.latest_messages?.some((entry) => entry.agent === 'team_consensus')) throw new Error('selftest: team live dashboard missing agent event');
  const teamLive = await readTeamLive(teamDir);
  if (!teamLive.includes('Analysis scouts') || !teamLive.includes('selftest mapped repo slice')) throw new Error('selftest: team live transcript missing analysis scout section/event');
  if (!teamLive.includes('sks team open-tmux')) throw new Error('selftest: team live transcript missing existing-mission tmux open command');
  if (!teamLive.includes('selftest mapped options')) throw new Error('selftest: team live transcript missing event');
  if (!teamLive.includes('Context tracking SSOT: TriWiki')) throw new Error('selftest: team live transcript missing TriWiki context tracking');
  if (!(await readTeamTranscriptTail(teamDir, 1)).join('\n').includes('selftest mapped options')) throw new Error('selftest: team transcript tail missing event');
  const teamLane = await renderTeamAgentLane(teamDir, { missionId: teamId, agent: 'analysis_scout_1', lines: 4, color: false });
  if (!teamLane.includes('selftest mapped repo slice')) throw new Error('selftest: team agent lane missing event context');
  const missingChatLaneParts = [
    ['codex chat heading', '## Codex Chat'],
    ['lane speaker', 'me (analysis_scout_1)'],
    ['status role metadata', '[status/scout]'],
    ['agent event body', 'selftest mapped repo slice']
  ].filter(([, needle]) => !teamLane.includes(needle)).map(([label]) => label);
  if (missingChatLaneParts.length || teamLane.includes('## Global Tail')) {
    const reason = [
      missingChatLaneParts.length ? `missing ${missingChatLaneParts.join(', ')}` : null,
      teamLane.includes('## Global Tail') ? 'unexpected global tail' : null
    ].filter(Boolean).join('; ');
    throw new Error(`selftest: chat lane (${reason})\n${teamLane.slice(0, 1600)}`);
  }
  if (!teamLane.includes('╭─') || !teamLane.includes('│ selftest mapped repo slice') || !teamLane.includes('╰─')) {
    throw new Error(`selftest: team chat lane did not render framed chat blocks\n${teamLane.slice(0, 1600)}`);
  }
  const teamLaneColor = await renderTeamAgentLane(teamDir, { missionId: teamId, agent: 'analysis_scout_1', lines: 4, color: true });
  if (!/\x1b\[[0-9;]+m/.test(teamLaneColor) || !teamLaneColor.includes('Lane color:')) throw new Error('selftest: team chat lane did not render ANSI color metadata/output');
  const teamLaneCli = await runProcess(process.execPath, [hookBin, 'team', 'lane', teamId, '--agent', 'analysis_scout_1', '--lines', '4'], { cwd: tmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
  if (teamLaneCli.code !== 0 || !String(teamLaneCli.stdout || '').includes('SKS Team Agent Lane') || !String(teamLaneCli.stdout || '').includes('analysis_scout_1')) throw new Error('selftest: sks team lane CLI did not render an agent lane');
  await writeTextAtomic(path.join(teamDir, 'team-analysis.md'), '- claim: analysis scout mapped route registry | source: src/core/routes.mjs | risk: high | confidence: supported\n');
  const buttonUxSchema = buildQuestionSchema('$Team 버튼 UX 수정');
  const buttonUxSlotIds = buttonUxSchema.slots.map((s) => s.id);
  if (buttonUxSlotIds.includes('UI_STATE_BEHAVIOR') || buttonUxSlotIds.includes('VISUAL_REGRESSION_REQUIRED')) throw new Error('selftest: predictable UI defaults should be inferred, not asked');
  if (buttonUxSlotIds.length) throw new Error(`selftest: clear small UI work should auto-seal, got ${buttonUxSlotIds.join(',')}`);
  if (buttonUxSchema.inferred_answers.UI_STATE_BEHAVIOR !== 'infer_from_task_context_and_existing_design_system; preserve existing loading/error/empty/retry behavior unless explicitly requested; add only standard states required by the touched surface') throw new Error('selftest: UI state default inference missing');
  if (buttonUxSchema.inferred_answers.VISUAL_REGRESSION_REQUIRED !== 'yes_if_available') throw new Error('selftest: visual regression default inference missing');
  const predictableAuthCliSchema = buildQuestionSchema('회전 아스키 아트는 제일 처음 인증 안됐을때만 codex cli처럼 애니메이션으로 보이게 하고 tmux에서는 정적 3d 아스키 아트로 보여줘');
  const predictableAuthCliSlotIds = predictableAuthCliSchema.slots.map((s) => s.id);
  if (predictableAuthCliSlotIds.length) throw new Error(`selftest: clear auth-worded CLI rendering work should auto-seal, got ${predictableAuthCliSlotIds.join(',')}`);
  if (!predictableAuthCliSchema.inferred_answers.RISK_BOUNDARY?.includes('no destructive commands or live data writes')) throw new Error('selftest: predictable auth-worded CLI work did not infer conservative risk boundary');
  const vagueSchema = buildQuestionSchema('뭔가 개선해줘');
  const vagueSlotIds = vagueSchema.slots.map((s) => s.id);
  if (vagueSlotIds.length !== 0) throw new Error(`selftest: vague work should auto-seal inferred defaults without visible questions, got ${vagueSlotIds.join(',')}`);
  if (!vagueSchema.inferred_answers?.GOAL_PRECISE || !vagueSchema.inferred_answers?.ACCEPTANCE_CRITERIA) throw new Error('selftest: vague work did not infer core contract defaults');
  if (vagueSchema.ambiguity_assessment?.method !== 'weighted_clarity_interview' || !vagueSchema.ambiguity_assessment?.adversarial_lenses?.includes('challenge_framing')) throw new Error('selftest: ambiguity schema missing weighted clarity / planning lenses');
  const pptRoute = routePrompt('$PPT 투자자용 피치덱 만들어줘');
  if (pptRoute?.id !== 'PPT') throw new Error('selftest: $PPT did not route to presentation pipeline');
  if (JSON.stringify(pptRoute.requiredSkills) !== JSON.stringify(PPT_PIPELINE_SKILL_ALLOWLIST)) throw new Error(`selftest: PPT route required skills are not allowlisted: ${pptRoute.requiredSkills.join(',')}`);
  if (!pptRoute.requiredSkills.includes('imagegen')) throw new Error('selftest: PPT route must load imagegen so required PPT raster assets use Codex App $imagegen');
  if (pptRoute.requiredSkills.includes('design-artifact-expert') || pptRoute.requiredSkills.includes('design-ui-editor') || pptRoute.requiredSkills.includes('design-system-builder')) throw new Error('selftest: PPT route still requires generic design skills');
  const pptSchema = buildQuestionSchema('$PPT 투자자용 피치덱 만들어줘');
  const pptSlotIds = pptSchema.slots.map((s) => s.id);
  for (const id of ['PRESENTATION_DELIVERY_CONTEXT', 'PRESENTATION_AUDIENCE_PROFILE', 'PRESENTATION_STP_STRATEGY', 'PRESENTATION_PAINPOINT_SOLUTION_MAP', 'PRESENTATION_DECISION_CONTEXT']) {
    if (pptSlotIds.includes(id) || pptSchema.inferred_answers?.[id] === undefined) throw new Error(`selftest: PPT schema did not infer ${id}`);
  }
  const pptSkillText = await safeReadText(path.join(tmp, '.agents', 'skills', 'ppt', 'SKILL.md'));
  if (!pptSkillText.includes('STP') || !pptSkillText.includes('target audience profile') || !pptSkillText.includes('decision context') || !pptSkillText.includes('3+ pain-point to solution mappings') || !pptSkillText.includes('Do not surface a prequestion sheet')) throw new Error('selftest: generated PPT skill missing inferred STP/audience/pain-point guidance');
  if (!pptSkillText.includes('simple, restrained, and information-first') || !pptSkillText.includes('over-designed decoration') || !pptSkillText.includes(CODEX_APP_IMAGE_GENERATION_DOC_URL) || !pptSkillText.includes(CODEX_IMAGEGEN_REQUIRED_POLICY) || !pptSkillText.includes(AWESOME_DESIGN_MD_REFERENCE.url) || !pptSkillText.includes('only design decision SSOT') || !pptSkillText.includes('instead of treating references as parallel authorities')) throw new Error('selftest: generated PPT skill missing restrained design/imagegen/fused-SSOT guidance');
  if (!pptSkillText.includes('PPT pipeline allowlist') || !pptSkillText.includes('ignore installed skills and MCPs') || !pptSkillText.includes('prevent AI-like generic presentation design') || !pptSkillText.includes('Do not use generic design skills such as design-artifact-expert')) throw new Error('selftest: generated PPT skill missing pipeline allowlist enforcement');
  if (!pptSkillText.includes('source-html/') || !pptSkillText.includes('temporary build files') || !pptSkillText.includes('ppt-parallel-report.json')) throw new Error('selftest: generated PPT skill missing source preservation/temp cleanup/parallel guidance');
  if (!pptSkillText.includes('ppt-fact-ledger.json') || !pptSkillText.includes('ppt-image-asset-ledger.json') || !pptSkillText.includes('direct API fallback') || !pptSkillText.includes('ppt-review-ledger.json') || !pptSkillText.includes('ppt-iteration-report.json') || !pptSkillText.includes('never simulate missing gpt-image-2 output') || !pptSkillText.includes('always loads imagegen') || !pptSkillText.includes('immediately invoke Codex App `$imagegen`')) throw new Error('selftest: generated PPT skill missing fact/image/review loop anti-fake guidance');
  if (routeRequiresSubagents(pptRoute, '$PPT 투자자용 피치덱 만들어줘')) throw new Error('selftest: PPT route should not require subagents by default');
  if (!reflectionRequiredForRoute(pptRoute)) throw new Error('selftest: PPT route should require reflection');
  const pptMission = await createMission(tmp, { mode: 'ppt', prompt: '$PPT 투자자용 피치덱 만들어줘' });
  await writeQuestions(pptMission.dir, pptSchema);
  const pptAnswers = {
    PRESENTATION_DELIVERY_CONTEXT: '대형 화면 16:9 발표, 한국어, 10분',
    PRESENTATION_AUDIENCE_PROFILE: '투자자, 평균 40대, VC/전략투자 직무, SaaS 이해도 높음, 의사결정권 있음',
    PRESENTATION_STP_STRATEGY: 'Segmentation: 초기 B2B SaaS 투자자; Targeting: 운영 효율 SaaS에 관심 있는 VC; Positioning: 작은 도입으로 반복 운영비를 줄이는 팀',
    PRESENTATION_PAINPOINT_SOLUTION_MAP: ['반복 리서치 비용 -> 자동화된 근거 수집 -> 비용 절감 아하', '검토 자료 품질 편차 -> 표준화된 스토리보드 -> 신뢰 아하', '도입 리스크 -> 작은 파일럿 -> 낮은 리스크 아하'],
    PRESENTATION_DECISION_CONTEXT: '파일럿 투자 승인이 목표이며, 시장 차별성과 실행 리스크가 주요 반대논리'
  };
  await writeJsonAtomic(path.join(pptMission.dir, 'answers.json'), pptAnswers);
  const pptSeal = await sealContract(pptMission.dir, pptMission.mission);
  if (!pptSeal.ok) throw new Error('selftest: PPT answers rejected');
  await materializeAfterPipelineAnswer(tmp, pptMission.id, pptMission.dir, pptMission.mission, pptRoute, { route: 'PPT', command: '$PPT', mode: 'PPT', task: pptMission.mission.prompt, context7_required: false }, pptSeal.contract);
  const pptAudienceStrategy = await readJson(path.join(pptMission.dir, PPT_AUDIENCE_STRATEGY_ARTIFACT));
  if (!pptAudienceStrategy?.source_answers?.PRESENTATION_STP_STRATEGY || pptAudienceStrategy.painpoint_solution_map.length !== 3) throw new Error('selftest: PPT audience strategy was not materialized from sealed answers');
  const pptGate = await readJson(path.join(pptMission.dir, PPT_GATE_ARTIFACT));
  if (pptGate.passed !== false || pptGate.audience_strategy_sealed !== true || pptGate.painpoint_count !== 3) throw new Error('selftest: PPT gate did not initialize with sealed audience strategy');
  await writeJsonAtomic(path.join(pptMission.dir, PPT_FACT_LEDGER_ARTIFACT), {
    schema_version: 1,
    web_research_performed: true,
    external_research_required: true,
    sources: [{ id: 'web-source-selftest', type: 'verified_web_source', url: 'https://example.com/ppt-source', support_status: 'verified' }],
    claims: [{ id: 'claim-selftest-market-risk', text: '시장 차별성과 실행 리스크는 외부 근거가 필요한 주장으로 분리된다.', source_ids: ['web-source-selftest'], support_status: 'supported', criticality: 'high', slide_refs: [2] }],
    unsupported_critical_claims: [],
    unsupported_critical_claims_count: 0,
    passed: true
  });
  const pptBuildResult = await runProcess(process.execPath, [hookBin, 'ppt', 'build', pptMission.id, '--json'], { cwd: tmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (pptBuildResult.code !== 0) throw new Error(`selftest: sks ppt build failed: ${pptBuildResult.stderr || pptBuildResult.stdout}`);
  const pptBuild = JSON.parse(pptBuildResult.stdout);
  if (!pptBuild.ok || !pptBuild.gate?.passed || !pptBuild.gate?.fact_ledger_created || !pptBuild.gate?.unsupported_critical_claims_zero || !pptBuild.gate?.image_asset_ledger_created || !pptBuild.gate?.image_asset_policy_satisfied || !pptBuild.gate?.review_policy_created || !pptBuild.gate?.review_ledger_created || !pptBuild.gate?.bounded_iteration_complete || !pptBuild.gate?.critical_review_issues_zero || !pptBuild.gate?.parallel_build_recorded || !pptBuild.gate?.html_artifact_created || !pptBuild.gate?.source_html_preserved || !pptBuild.gate?.pdf_exported_or_explicitly_deferred || !pptBuild.gate?.render_qa_recorded || !pptBuild.gate?.temp_cleanup_recorded) throw new Error('selftest: PPT build did not pass artifact gate');
  if (!PPT_HTML_ARTIFACT.startsWith(`${PPT_SOURCE_HTML_DIR}/`)) throw new Error('selftest: PPT HTML source must be stored in source-html folder');
  const pptHtml = await safeReadText(path.join(pptMission.dir, PPT_HTML_ARTIFACT));
  if (!pptHtml.includes('<html') || pptHtml.includes('gradient')) throw new Error('selftest: PPT HTML artifact missing or over-designed');
  const pptStyleTokens = await readJson(path.join(pptMission.dir, 'ppt-style-tokens.json'));
  if (pptStyleTokens.design_policy?.design_ssot?.authority !== DESIGN_SYSTEM_SSOT.authority_file || !pptStyleTokens.design_policy?.source_inputs?.some((entry) => entry.url === AWESOME_DESIGN_MD_REFERENCE.url && entry.role === 'source_input_for_ssot') || !pptStyleTokens.design_policy?.anti_generic_ai_style) throw new Error('selftest: PPT style tokens missing fused design SSOT/source-input anti-generic policy');
  if (!pptStyleTokens.design_policy?.design_reference_selection?.primary?.id?.startsWith('awesome-design-md:') || !pptStyleTokens.design_policy?.design_reference_selection?.selected_sources?.length || !pptStyleTokens.layout?.composition || !pptStyleTokens.layout?.treatment) throw new Error('selftest: PPT style tokens did not select and apply a concrete awesome-design-md reference profile');
  if (JSON.stringify(pptStyleTokens.design_policy?.pipeline_allowlist?.required_skills || []) !== JSON.stringify(PPT_PIPELINE_SKILL_ALLOWLIST) || !pptStyleTokens.design_policy?.pipeline_allowlist?.ignore_installed_out_of_pipeline_skills || !(pptStyleTokens.design_policy?.pipeline_allowlist?.ignored_design_skills_even_if_installed || []).includes('design-artifact-expert') || !/AI-like/.test(pptStyleTokens.design_policy?.pipeline_allowlist?.anti_ai_design_goal || '')) throw new Error('selftest: PPT style tokens missing skill/MCP allowlist enforcement');
  const audienceScript = pptHtml.match(/id="ppt-audience-strategy">([^<]+)<\/script>/);
  if (!audienceScript) throw new Error('selftest: PPT HTML missing audience strategy script data');
  JSON.parse(audienceScript[1]);
  if (!pptHtml.includes('id="ppt-fact-ledger"') || !pptHtml.includes('id="ppt-image-asset-ledger"') || !pptHtml.includes('id="ppt-review-policy"')) throw new Error('selftest: PPT HTML missing fact/image/review embedded ledgers');
  const pptPdfBytes = await fsp.readFile(path.join(pptMission.dir, PPT_PDF_ARTIFACT));
  if (pptPdfBytes.subarray(0, 5).toString('utf8') !== '%PDF-') throw new Error('selftest: PPT PDF artifact does not have a PDF header');
  const pptFactLedger = await readJson(path.join(pptMission.dir, PPT_FACT_LEDGER_ARTIFACT));
  if (!pptFactLedger.passed || pptFactLedger.unsupported_critical_claims_count !== 0 || !Array.isArray(pptFactLedger.claims)) throw new Error('selftest: PPT fact ledger did not pass unsupported-claim gate');
  const pptImageAssetLedger = await readJson(path.join(pptMission.dir, PPT_IMAGE_ASSET_LEDGER_ARTIFACT));
  if (!pptImageAssetLedger.passed || pptImageAssetLedger.required !== false || pptImageAssetLedger.planned_count !== 0 || pptImageAssetLedger.provider?.model !== 'gpt-image-2') throw new Error('selftest: PPT image asset ledger did not pass optional no-cost state');
  const pptReviewPolicy = await readJson(path.join(pptMission.dir, PPT_REVIEW_POLICY_ARTIFACT));
  if (pptReviewPolicy.visual_review?.model !== 'gpt-image-2' || pptReviewPolicy.max_full_deck_passes !== 2 || pptReviewPolicy.max_slide_retries !== 2 || pptReviewPolicy.score_threshold < 0.88) throw new Error('selftest: PPT review policy missing bounded gpt-image-2 loop settings');
  const pptReviewLedger = await readJson(path.join(pptMission.dir, PPT_REVIEW_LEDGER_ARTIFACT));
  if (!pptReviewLedger.passed || !pptReviewLedger.p0_p1_zero || pptReviewLedger.image_review_status !== 'not_required_or_not_available') throw new Error('selftest: PPT review ledger did not pass deterministic no-blocker state');
  const pptIterationReport = await readJson(path.join(pptMission.dir, PPT_ITERATION_REPORT_ARTIFACT));
  if (!pptIterationReport.passed || pptIterationReport.loop_policy?.max_full_deck_passes !== 2 || pptIterationReport.stop_reason !== 'score_threshold_met_and_no_p0_p1_issues') throw new Error('selftest: PPT iteration report did not record bounded pass termination');
  const pptRenderReport = await readJson(path.join(pptMission.dir, PPT_RENDER_REPORT_ARTIFACT));
  if (!pptRenderReport.passed || !pptRenderReport.design_policy_checks.every((check) => check.passed)) throw new Error('selftest: PPT render report did not pass design policy checks');
  const pptParallelReport = await readJson(path.join(pptMission.dir, PPT_PARALLEL_REPORT_ARTIFACT));
  if (!pptParallelReport.passed || pptParallelReport.parallel_group_count < 2 || !pptParallelReport.parallel_groups.some((group) => group.id === 'render_targets' && group.executed_in_parallel)) throw new Error('selftest: PPT parallel report did not record parallel build groups');
  const pptCleanupReport = await readJson(path.join(pptMission.dir, PPT_CLEANUP_REPORT_ARTIFACT));
  if (!pptCleanupReport.source_html_preserved || !pptCleanupReport.temp_cleanup_completed || pptCleanupReport.source_html_path !== PPT_HTML_ARTIFACT) throw new Error('selftest: PPT cleanup report did not preserve source HTML');
  if (await exists(path.join(pptMission.dir, PPT_TEMP_DIR))) throw new Error('selftest: PPT temp directory was not cleaned');
  if (await exists(path.join(pptMission.dir, 'artifact.html'))) throw new Error('selftest: legacy root PPT HTML should not remain after source-html preservation');
  const pptStatusResult = await runProcess(process.execPath, [hookBin, 'ppt', 'status', pptMission.id, '--json'], { cwd: tmp, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (pptStatusResult.code !== 0 || !JSON.parse(pptStatusResult.stdout).ok) throw new Error('selftest: sks ppt status did not report the built gate');
  const requiredImagePptMission = await createMission(tmp, { mode: 'ppt', prompt: '$PPT 이미지 리소스 포함 투자자용 피치덱 만들어줘' });
  await writeQuestions(requiredImagePptMission.dir, pptSchema);
  await writeJsonAtomic(path.join(requiredImagePptMission.dir, 'answers.json'), {
    ...pptAnswers,
    PRESENTATION_IMAGE_ASSETS_REQUIRED: 'yes',
    PRESENTATION_IMAGE_ASSET_REQUESTS: ['한국 B2B SaaS 운영 효율을 상징하는 첫 장용 히어로 이미지']
  });
  const requiredImageSeal = await sealContract(requiredImagePptMission.dir, requiredImagePptMission.mission);
  if (!requiredImageSeal.ok) throw new Error('selftest: PPT required-image answers rejected');
  await materializeAfterPipelineAnswer(tmp, requiredImagePptMission.id, requiredImagePptMission.dir, requiredImagePptMission.mission, pptRoute, { route: 'PPT', command: '$PPT', mode: 'PPT', task: requiredImagePptMission.mission.prompt, context7_required: false }, requiredImageSeal.contract);
  await writeJsonAtomic(path.join(requiredImagePptMission.dir, PPT_FACT_LEDGER_ARTIFACT), {
    schema_version: 1,
    web_research_performed: true,
    external_research_required: true,
    sources: [{ id: 'web-source-required-image-selftest', type: 'verified_web_source', url: 'https://example.com/ppt-source-image', support_status: 'verified' }],
    claims: [{ id: 'claim-required-image-selftest', text: '이미지 리소스 요구사항은 사실 검증과 별도 게이트로 차단되어야 한다.', source_ids: ['web-source-required-image-selftest'], support_status: 'supported', criticality: 'high', slide_refs: [1] }],
    unsupported_critical_claims: [],
    unsupported_critical_claims_count: 0,
    passed: true
  });
  const requiredImageBuildResult = await runProcess(process.execPath, [hookBin, 'ppt', 'build', requiredImagePptMission.id, '--json'], { cwd: tmp, env: { SKS_DISABLE_UPDATE_CHECK: '1', SKS_FAKE_IMAGE_GATE_TOKEN: 'ignored-by-sks-route-gate' }, timeoutMs: 15000, maxOutputBytes: 128 * 1024 });
  if (requiredImageBuildResult.code !== 0) throw new Error(`selftest: required-image PPT build command failed: ${requiredImageBuildResult.stderr || requiredImageBuildResult.stdout}`);
  const requiredImageBuild = JSON.parse(requiredImageBuildResult.stdout);
  const requiredImageLedger = await readJson(path.join(requiredImagePptMission.dir, PPT_IMAGE_ASSET_LEDGER_ARTIFACT));
  if (requiredImageBuild.ok || requiredImageBuild.gate?.passed || !requiredImageBuild.gate?.image_asset_ledger_created || requiredImageBuild.gate?.image_asset_policy_satisfied !== false || !requiredImageLedger.required || requiredImageLedger.passed || !requiredImageLedger.blockers?.includes('missing_codex_app_imagegen_gpt_image_2_asset_evidence') || requiredImageLedger.generated_count !== 0) throw new Error('selftest: required PPT image assets were not blocked without Codex App imagegen evidence');
  if (requiredImageLedger.imagegen_execution?.command !== '$imagegen' || requiredImageLedger.imagegen_execution?.required_skill !== 'imagegen' || !requiredImageLedger.assets?.every((asset) => asset.imagegen_invocation?.command === '$imagegen')) throw new Error('selftest: required PPT image assets did not carry Codex App $imagegen invocation instructions');
  const installUxSchema = buildQuestionSchema('SKS first install/bootstrap UX and Context7 MCP setup improvement');
  const installUxSlotIds = installUxSchema.slots.map((s) => s.id);
  if (installUxSchema.domain_hints.includes('uiux') || installUxSlotIds.includes('VISUAL_REGRESSION_REQUIRED')) throw new Error('selftest: CLI UX install prompt should not ask visual UI questions');
  if (installUxSlotIds.some((id) => /^(D|SUPA)/.test(id) && id !== 'DEPENDENCY_CHANGE_ALLOWED')) throw new Error('selftest: non-data MCP setup prompt asked guarded slots');
  if (installUxSlotIds.includes('MID_RUN_UNKNOWN_POLICY')) throw new Error('selftest: no-question fallback ladder should be inferred, not asked');
  const dbQuestionGateSchema = buildQuestionSchema('DB_SCHEMA_CHANGE_ALLOWED DATABASE_TARGET_ENVIRONMENT DATABASE_WRITE_MODE SUPABASE_MCP_POLICY DB_READ_ONLY_QUERY_LIMIT 이런 질문은 사용자에게 묻지 말고 알아서 판단해줘');
  const dbQuestionGateSlotIds = dbQuestionGateSchema.slots.map((s) => s.id);
  if (dbQuestionGateSlotIds.length) throw new Error(`selftest: predictable DB safety prompt should auto-seal, got ${dbQuestionGateSlotIds.join(',')}`);
  const { id, dir, mission } = await createMission(tmp, { mode: 'goal', prompt: '발표자료 만들어줘' });
  const schema = buildQuestionSchema(mission.prompt);
  await writeQuestions(dir, schema);
  if (!validateAnswers(schema, {}).ok || schema.slots.length !== 0) throw new Error('selftest: inferred empty answer set should be valid after prequestion removal');
  const answers = { ...(schema.inferred_answers || {}) };
  await writeJsonAtomic(path.join(dir, 'answers.json'), answers);
  const sealed = await sealContract(dir, mission);
  if (!sealed.ok) throw new Error('selftest: answers rejected');
  await setCurrent(tmp, { mission_id: id, mode: 'QALOOP', phase: 'QALOOP_RUNNING_NO_QUESTIONS' });
  if (!containsUserQuestion('확인해 주세요?')) throw new Error('selftest: question guard');
  if (classifySql('drop table users;').level !== 'destructive') throw new Error('selftest: destructive sql not detected');
  const patchPayloadClass = classifyToolPayload({ tool_name: 'apply_patch', command: '*** Update File: src/example.mjs\n+ok\n' });
  if (patchPayloadClass.level !== 'none') throw new Error('selftest: apply_patch file edits should not be classified as DB writes');
  const supabaseWritePayloadClass = classifyToolPayload({ tool_name: 'mcp__supabase__execute_sql', sql: "update users set name = 'x' where id = '1';" });
  if (supabaseWritePayloadClass.level !== 'write' || !supabaseWritePayloadClass.toolReasons.includes('database_tool')) throw new Error('selftest: Supabase execute_sql write classification was weakened');
  if (classifyCommand('supabase db reset').level !== 'destructive') throw new Error('selftest: supabase db reset not detected');
  const supabaseMigrationApplyClass = classifyCommand('supabase migration up --linked');
  if (supabaseMigrationApplyClass.level !== 'write' || !supabaseMigrationApplyClass.reasons.includes('supabase_migration_apply')) throw new Error('selftest: supabase migration apply was not classified as DB write');
  const supabaseDbPushClass = classifyCommand('supabase db push');
  if (supabaseDbPushClass.level !== 'write' || !supabaseDbPushClass.reasons.includes('supabase_db_push')) throw new Error('selftest: supabase db push was not classified as migration apply work');
  const supabaseApplyMigrationToolClass = classifyToolPayload({ tool_name: 'mcp__supabase__apply_migration', name: 'add_selftest_table' });
  if (supabaseApplyMigrationToolClass.level !== 'write' || !supabaseApplyMigrationToolClass.toolReasons.includes('migration_apply_tool')) throw new Error('selftest: Supabase apply_migration tool was not classified as DB write');
  const dbDecision = await checkDbOperation(tmp, { mission_id: id }, { tool_name: 'mcp__supabase__execute_sql', sql: 'drop table users;' }, { duringNoQuestion: true });
  if (dbDecision.action !== 'block') throw new Error('selftest: destructive MCP SQL allowed');
  const computerUseDecision = await checkDbOperation(tmp, { mission_id: id }, { tool_name: 'mcp__computer_use__open_app', bundle_id: 'com.microsoft.edgemac', action: 'open_app' }, { duringNoQuestion: true });
  if (computerUseDecision.action !== 'allow') throw new Error('selftest: Computer Use MCP was blocked by DB safety gate');
  const madMission = await createMission(tmp, { mode: 'mad-sks', prompt: '$MAD-SKS selftest scoped DB override' });
  await writeJsonAtomic(path.join(madMission.dir, 'team-gate.json'), { schema_version: 1, passed: false, team_roster_confirmed: true });
  const madState = { mission_id: madMission.id, mode: 'TEAM', route_command: '$Team', stop_gate: 'team-gate.json', mad_sks_active: true, mad_sks_modifier: true, mad_sks_gate_file: 'team-gate.json' };
  const columnCleanupSql = 'alter table users ' + 'dr' + 'op column legacy_name;';
  const madColumnCleanupDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: columnCleanupSql }, { duringNoQuestion: false });
  if (madColumnCleanupDecision.action !== 'allow' || !madColumnCleanupDecision.mad_sks?.permission_profile?.allowed?.includes('direct_execute_sql_writes')) throw new Error('selftest: MAD-SKS column cleanup was not allowed through the modular permission gate');
  const madLiveDmlDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: "update users set name = 'fixed' where id = 'selftest';" }, { duringNoQuestion: false });
  if (madLiveDmlDecision.action !== 'allow' || !madLiveDmlDecision.mad_sks?.live_server_writes_allowed) throw new Error('selftest: MAD-SKS targeted live DML was not allowed');
  const madMigrationUpDecision = await checkDbOperation(tmp, madState, { command: 'supabase migration up --linked' }, { duringNoQuestion: true });
  if (madMigrationUpDecision.action !== 'allow' || !madMigrationUpDecision.mad_sks?.permission_profile?.allowed?.includes('migration_apply_when_required')) throw new Error('selftest: MAD-SKS did not allow Supabase migration up during no-question execution');
  const madDbPushDecision = await checkDbOperation(tmp, madState, { command: 'supabase db push' }, { duringNoQuestion: true });
  if (madDbPushDecision.action !== 'allow') throw new Error('selftest: MAD-SKS did not allow Supabase db push migration application');
  const madApplyMigrationDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__apply_migration', name: 'add_selftest_table' }, { duringNoQuestion: true });
  if (madApplyMigrationDecision.action !== 'allow') throw new Error('selftest: MAD-SKS did not allow Supabase MCP apply_migration');
  const madTmuxMission = await createMission(tmp, { mode: 'mad-sks', prompt: 'sks --mad migration selftest' });
  await writeJsonAtomic(path.join(madTmuxMission.dir, 'mad-sks-gate.json'), { schema_version: 1, passed: false, mad_sks_permission_active: true, migration_apply_allowed: true });
  const madTmuxState = { mission_id: madTmuxMission.id, mode: 'MADSKS', route_command: '$MAD-SKS', stop_gate: 'mad-sks-gate.json', mad_sks_active: true, mad_sks_modifier: true, mad_sks_gate_file: 'mad-sks-gate.json', migration_apply_allowed: true };
  const madTmuxMigrationDecision = await checkDbOperation(tmp, madTmuxState, { command: 'supabase migration up --linked' }, { duringNoQuestion: true });
  if (madTmuxMigrationDecision.action !== 'allow') throw new Error('selftest: sks --mad state did not allow Supabase migration application');
  const tableRemovalSql = 'dr' + 'op table users;';
  const madTableRemovalDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: tableRemovalSql }, { duringNoQuestion: false });
  if (madTableRemovalDecision.action !== 'block') throw new Error('selftest: MAD-SKS catastrophic table removal was not blocked');
  const allRowsSql = 'de' + 'lete from users;';
  const madAllRowsDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: allRowsSql }, { duringNoQuestion: false });
  if (madAllRowsDecision.action !== 'block') throw new Error('selftest: MAD-SKS all-row DML was not blocked');
  await writeJsonAtomic(path.join(madMission.dir, 'team-gate.json'), { schema_version: 1, passed: true, team_roster_confirmed: true, permissions_deactivated: true });
  const madClosedDecision = await checkDbOperation(tmp, madState, { tool_name: 'mcp__supabase__execute_sql', sql: columnCleanupSql }, { duringNoQuestion: false });
  if (madClosedDecision.action !== 'block') throw new Error('selftest: MAD-SKS permission persisted after gate close');
  const nonDbDecision = await checkDbOperation(tmp, {}, { command: 'npm test' }, { duringNoQuestion: true });
  if (nonDbDecision.action !== 'allow') throw new Error('selftest: non-DB command blocked by DB guard');
  const evalReport = runEvaluationBenchmark({ iterations: 5 });
  if (!evalReport.comparison.meaningful_improvement) throw new Error('selftest: evaluation benchmark did not show meaningful improvement');
  if (!evalReport.candidate.wiki?.valid) throw new Error('selftest: wiki coordinate index invalid in eval');
  if (evalReport.candidate.wiki?.voxel_schema !== 'sks.wiki-voxel.v1' || evalReport.candidate.wiki?.voxel_rows < 1) throw new Error('selftest: eval did not include voxel overlay metrics');
  const harnessReport = harnessGrowthReport({});
  if (!harnessReport.forgetting.fixture.passed || !harnessReport.tmux.views.includes('Harness Experiments View') || !harnessReport.reliability.tool_error_taxonomy.includes('Unknown')) throw new Error('selftest: harness growth fixture incomplete');
  const proofField = await proofFieldFixture();
  if (!proofField.validation.ok || !validateProofFieldReport(proofField.report).ok) throw new Error('selftest: proof field report invalid');
  if (!proofField.checks.route_cone_selected || !proofField.checks.cli_cone_selected || !proofField.checks.catastrophic_guard_present || !proofField.checks.negative_release_work_recorded || !proofField.checks.outcome_rubric_present || !proofField.checks.adversarial_lenses_present || !proofField.checks.route_economy_present || !proofField.checks.decision_lattice_present || !proofField.checks.decision_lattice_report_only || !proofField.checks.decision_lattice_selected_path || !proofField.checks.decision_lattice_frontier_present || !proofField.checks.decision_lattice_rejections_present || !proofField.checks.decision_lattice_scoring_formula_present || !proofField.checks.simplicity_score_usable || !proofField.checks.execution_fast_lane_selected) throw new Error('selftest: proof field fixture checks incomplete');
  if (!speedLanePolicyText().includes('proof_field_fast_lane') || !proofField.report.execution_lane?.skip_when_fast?.includes('planning_debate')) throw new Error('selftest: Proof Field speed lane policy missing');
  const fastPipelinePlan = buildPipelinePlan({ route: routePrompt('$Team small CLI help update'), task: 'small CLI help surface update', proofField: proofField.report });
  if (!validatePipelinePlan(fastPipelinePlan).ok || fastPipelinePlan.runtime_lane?.lane !== 'proof_field_fast_lane' || !fastPipelinePlan.skipped_stages.includes('planning_debate') || !fastPipelinePlan.invariants.includes('no_unrequested_fallback_code')) throw new Error('selftest: pipeline plan did not encode fast lane stage skips and fallback guard');
  const broadProofField = await buildProofField(tmp, { intent: 'database security route refactor', changedFiles: ['src/core/db-safety.mjs', 'src/core/routes.mjs', 'src/cli/main.mjs', 'README.md'] });
  const broadPipelinePlan = buildPipelinePlan({ route: routePrompt('$Team database security route refactor'), task: 'database security route refactor', proofField: broadProofField });
  if (!validatePipelinePlan(broadPipelinePlan).ok || broadPipelinePlan.runtime_lane?.lane === 'proof_field_fast_lane' || broadPipelinePlan.skipped_stages.includes('planning_debate')) throw new Error('selftest: pipeline plan did not fail closed for broad/security work');
  if (broadPipelinePlan.route_economy?.mode !== 'report_only' || !broadPipelinePlan.route_economy.active_team_triggers?.includes('broad_change_set') || !broadPipelinePlan.route_economy.verification_stage_cache_key || !broadPipelinePlan.route_economy.decision_lattice?.report_only) throw new Error('selftest: route economy projection missing from pipeline plan');
  const workflowPerf = await runWorkflowPerfBench(tmp, {
    iterations: 2,
    intent: 'small CLI help surface update',
    changedFiles: ['src/cli/maintenance-commands.mjs', 'src/core/routes.mjs']
  });
  if (!validateWorkflowPerfReport(workflowPerf).ok || workflowPerf.metrics.decision_mode !== 'fast_lane' || workflowPerf.metrics.execution_lane !== 'proof_field_fast_lane' || workflowPerf.metrics.pipeline_lane !== 'proof_field_fast_lane' || !workflowPerf.metrics.fast_lane_eligible || !workflowPerf.metrics.fast_lane_allowed || !workflowPerf.metrics.decision_lattice_valid || Number(workflowPerf.metrics.decision_lattice_frontier_count) < 1 || Number(workflowPerf.metrics.simplicity_score) < 0.75 || Number(workflowPerf.metrics.outcome_criteria_passed) < 3) throw new Error('selftest: workflow perf proof field did not produce a valid outcome-scored fast lane report');
  if (classifyToolError({ message: 'operation timed out' }) !== 'Timeout' || classifyToolError({ message: 'unclassified weirdness' }) !== 'Unknown') throw new Error('selftest: tool error taxonomy classification');
  const coord = rgbaToWikiCoord({ r: 12, g: 34, b: 56, a: 255 });
  if (coord.schema !== 'sks.wiki-coordinate.v1' || coord.xyzw.length !== 4) throw new Error('selftest: RGBA wiki coordinate conversion');
  await writeTextAtomic(path.join(tmp, '.sneakoscope', 'memory', 'q2_facts', 'selftest.md'), '- claim: Selftest memory claim must be selected before lower-weight mission notes. | id: selftest-memory-priority | source: src/cli/main.mjs | risk: high | status: supported | evidence_count: 3 | required_weight: 1.0 | trust_score: 0.9\n');
  await writeTextAtomic(path.join(tmp, '.sneakoscope', 'memory', 'q2_facts', 'tail-repeat.md'), [
    ...Array.from({ length: 60 }, (_, i) => `- claim: Low priority filler memory ${i}. | id: tail-filler-${i} | source: src/cli/main.mjs | risk: low | status: supported | evidence_count: 1 | required_weight: 0.1 | trust_score: 0.5`),
    '- claim: TriWiki repeated mistake recall must preserve recent high-weight tail lessons. | id: tail-repeat-mistake | source: src/core/mistake-recall.mjs | risk: high | status: supported | freshness: fresh | evidence_count: 4 | required_weight: 1.2 | trust_score: 0.95'
  ].join('\n'));
  await createMission(tmp, { mode: 'sks', prompt: '모호한 질문은 그만 물어봐야지;; triwiki로 예측해' });
  await createMission(tmp, { mode: 'sks', prompt: 'triwiki에서 자주 요청하는 것들은 카운팅해서 더 우선 참고해줘' });
  const projectClaims = await projectWikiClaims(tmp);
  if (!projectClaims.some((claim) => claim.id === 'tail-repeat-mistake')) throw new Error('selftest: tail high-weight memory claim was dropped from TriWiki ingestion');
  const recallPrompt = 'triwiki 반복 실수 방지 개선 selftest';
  const recallMission = await createMission(tmp, { mode: 'team', prompt: recallPrompt });
  await writeJsonAtomic(path.join(recallMission.dir, 'required-answers.schema.json'), { prompt: recallPrompt, slots: [{ id: 'GOAL_PRECISE', required: true }, { id: 'ACCEPTANCE_CRITERIA', required: true, type: 'array' }] });
  await writeJsonAtomic(path.join(recallMission.dir, 'answers.json'), { GOAL_PRECISE: recallPrompt, ACCEPTANCE_CRITERIA: ['repeat mistake memory is consumed'] });
  const recallSeal = await sealContract(recallMission.dir, { id: recallMission.id, prompt: recallPrompt, mode: 'team' });
  if (!recallSeal.ok) throw new Error('selftest: mistake recall contract did not seal');
  const recallLedger = await readJson(path.join(recallMission.dir, MISTAKE_RECALL_ARTIFACT), null);
  if (!recallLedger?.required || !recallLedger.matches?.some((match) => match.id === 'tail-repeat-mistake')) throw new Error('selftest: mistake recall did not match tail TriWiki lesson');
  if (!contractConsumesMistakeRecall(recallSeal.contract, recallLedger).ok) throw new Error('selftest: mistake recall was not consumed by decision contract');
  const wikiPack = contextCapsule({
    mission: { id: 'selftest-wiki', coord: { rgba: { r: 48, g: 132, b: 212, a: 240 } } },
    role: 'verifier',
    claims: projectClaims,
    q4: { mode: 'selftest' },
    q3: ['sks', 'llm-wiki', 'wiki-coordinate'],
    budget: { maxWikiAnchors: 48, includeTrustSummary: true }
  });
  const wikiValidation = validateWikiCoordinateIndex(wikiPack.wiki);
  if (!wikiValidation.ok) throw new Error('selftest: wiki coordinate pack invalid');
  if (wikiPack.wiki.vx?.s !== 'sks.wiki-voxel.v1' || wikiVoxelRowCount(wikiPack.wiki) < 1) throw new Error('selftest: wiki voxel overlay missing');
  const legacyWiki = { ...wikiPack.wiki };
  delete legacyWiki.vx;
  const legacyValidation = validateWikiCoordinateIndex(legacyWiki);
  if (legacyValidation.ok || !legacyValidation.issues.some((issue) => issue.id === 'vx_missing')) throw new Error('selftest: legacy coordinate-only wiki pack was accepted');
  if (!wikiPack.trust_summary || !Number.isFinite(Number(wikiPack.trust_summary.needs_evidence))) throw new Error('selftest: wiki trust summary missing');
  if (wikiPack.attention?.mode !== 'aggressive_triwiki_active_recall' || !wikiPack.attention.use_first?.length || !wikiPack.attention.hydrate_first?.length) throw new Error('selftest: wiki active attention ranking missing');
  if (!wikiPack.attention.use_first.every((row) => Array.isArray(row) && row[0] && row[1] && row[2])) throw new Error('selftest: wiki attention use_first rows are not hydratable anchors');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-aggressive-active-recall')) throw new Error('selftest: aggressive TriWiki attention claim missing from pack');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => Array.isArray(anchor) ? Number.isFinite(Number(anchor[9])) : Number.isFinite(Number(anchor.trust_score)))) throw new Error('selftest: wiki anchor trust score missing');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => (Array.isArray(anchor) ? anchor[0] : anchor.id) === 'wiki-trig')) throw new Error('selftest: wiki trig anchor missing');
  if (!(wikiPack.wiki.anchors || wikiPack.wiki.a || []).some((anchor) => String(Array.isArray(anchor) ? anchor[0] : anchor.id).startsWith('team-analysis-'))) throw new Error('selftest: team analysis claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => String(claim.id).startsWith('user-request-frequency-'))) throw new Error('selftest: repeated user request frequency claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => String(claim.id).startsWith('user-strong-feedback-'))) throw new Error('selftest: strong user feedback claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'selftest-memory-priority')) throw new Error('selftest: memory required_weight claim was not selected in TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-stack-current-docs-policy')) throw new Error('selftest: stack current-docs policy claim missing from TriWiki pack');
  if (!wikiPack.claims?.some((claim) => claim.id === 'wiki-stack-current-docs-vercel-duration')) throw new Error('selftest: Vercel duration current-docs claim missing from TriWiki pack');
  const cacheHitPack = contextCapsule({
    mission: { id: 'cache-hit-selftest', coord: { rgba: { r: 24, g: 24, b: 24, a: 255 } } },
    role: 'worker',
    claims: [
      { id: 'cache-hit-core-1', text: 'Selected high-similarity claim must keep an anchor for attention cache hits.', authority: 'code', risk: 'low', status: 'supported', freshness: 'fresh', trust_score: 0.82, coord: { rgba: { r: 24, g: 24, b: 24, a: 255 } } },
      { id: 'cache-hit-core-2', text: 'Second selected high-similarity claim must keep an anchor for attention cache hits.', authority: 'code', risk: 'low', status: 'supported', freshness: 'fresh', trust_score: 0.82, coord: { rgba: { r: 24, g: 24, b: 25, a: 255 } } },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `cache-hit-distractor-${i}`, text: `High-priority distractor ${i}`, authority: 'code', risk: 'critical', status: 'supported', freshness: 'fresh', trust_score: 0.99, coord: { rgba: { r: 180 + i, g: 180, b: 180, a: 255 } } }))
    ],
    q4: { mode: 'cache-hit-selftest' },
    q3: ['triwiki', 'cache-hit'],
    budget: { maxClaims: 2, maxWikiAnchors: 2, maxAttentionUse: 2 }
  });
  const cacheHitUseIds = new Set(cacheHitPack.attention?.use_first?.map((row) => row[0]) || []);
  if (!cacheHitUseIds.has('cache-hit-core-1') || !cacheHitUseIds.has('cache-hit-core-2')) throw new Error('selftest: selected TriWiki claims were not pinned as attention cache-hit anchors');
  const primingPack = contextCapsule({
    mission: { id: 'positive-recall-selftest', coord: { rgba: { r: 64, g: 96, b: 128, a: 255 } } },
    role: 'worker',
    claims: [
      { id: 'positive-recall-guard', text: 'Do not imagine elephant during TriWiki recall.', authority: 'code', risk: 'high', status: 'supported', freshness: 'fresh', required_weight: 1.4, trust_score: 0.95, coord: { rgba: { r: 64, g: 96, b: 128, a: 255 } } }
    ],
    q4: { mode: 'positive-recall-selftest' },
    q3: ['triwiki', 'positive-recall'],
    budget: { maxClaims: 1, maxWikiAnchors: 1, maxAttentionUse: 1, maxAttentionHydrate: 1 }
  });
  const primingClaim = primingPack.claims?.find((claim) => claim.id === 'positive-recall-guard');
  if (!primingClaim || /elephant|do\s+not/i.test(primingClaim.text || '') || primingClaim.text_policy !== 'positive_recall_negation_suppressed') throw new Error('selftest: TriWiki compact recall did not suppress negative priming text');
  if (!primingPack.attention?.hydrate_first?.some((row) => row[0] === 'positive-recall-guard' && String(row[1]).includes('negative_priming'))) throw new Error('selftest: negative priming claim was not source-hydration gated');
  const voxelPromotionPack = contextCapsule({
    mission: { id: 'voxel-promotion-selftest', coord: { rgba: { r: 70, g: 100, b: 130, a: 255 } } },
    role: 'worker',
    claims: [
      { id: 'voxel-priority-hydrate', text: 'TriWiki memory repeat prevention should hydrate source evidence when priority route layers are high.', authority: 'code', risk: 'low', status: 'supported', freshness: 'fresh', required_weight: 1.25, trust_score: 0.95, coord: { rgba: { r: 70, g: 100, b: 130, a: 255 } } }
    ],
    q4: { mode: 'voxel-promotion-selftest' },
    q3: ['triwiki', 'memory'],
    budget: { maxClaims: 1, maxWikiAnchors: 1, maxAttentionUse: 1, maxAttentionHydrate: 1 }
  });
  if (!voxelPromotionPack.attention?.hydrate_first?.some((row) => row[0] === 'voxel-priority-hydrate' && String(row[1]).startsWith('voxel:priority_route'))) throw new Error('selftest: voxel priority route did not promote hydration');
  const dryRunPack = await writeWikiContextPack(tmp, ['--max-anchors', '4'], { dryRun: true });
  if (wikiVoxelRowCount(dryRunPack.pack.wiki) !== 4) throw new Error('selftest: dry-run wiki pack did not build voxel rows');
  if (await exists(dryRunPack.file)) throw new Error('selftest: wiki refresh dry-run wrote context pack');
  await ensureDir(path.dirname(dryRunPack.file));
  await writeJsonAtomic(path.join(path.dirname(dryRunPack.file), 'low-trust-artifact.json'), { trust_summary: { avg: 0.1 }, wiki: { anchors: [] } });
  const wikiPruneDryRun = await pruneWikiArtifacts(tmp, { dryRun: true });
  if (wikiPruneDryRun.candidates < 1 || !wikiPruneDryRun.actions.some((action) => action.reason === 'low_wiki_trust')) throw new Error('selftest: wiki prune did not flag low-trust artifact');
  await writeJsonAtomic(path.join(tmp, '.sneakoscope', 'wiki', 'context-pack.json'), wikiPack);
  const recallPulseRun = await writeRecallPulseArtifacts(tmp, {
    missionId: recallMission.id,
    state: { mission_id: recallMission.id, mode: 'team', route: 'team', phase: 'implementation', prompt: recallPrompt },
    stageId: 'before_implementation'
  });
  if (!recallPulseRun.decision?.report_only || !recallPulseRun.decision?.l1?.selected?.length || recallPulseRun.decision?.l2?.tier !== 'L2' || recallPulseRun.decision?.l3?.tier !== 'L3') throw new Error('selftest: RecallPulse did not write L1/L2/L3 report-only decision');
  if (!recallPulseRun.capsule?.report_only || !recallPulseRun.envelope?.claim_ids_supported?.includes('durable_status_ledger')) throw new Error('selftest: RecallPulse proof capsule/evidence envelope incomplete');
  const recallPulseStatusLedger = await readMissionStatusLedger(tmp, recallMission.id);
  if (!recallPulseStatusLedger?.entries?.length || !recallPulseStatusLedger.final_summary_projection?.last_user_visible) throw new Error('selftest: RecallPulse durable status ledger missing');
  const repeatedRecallPulseRun = await writeRecallPulseArtifacts(tmp, {
    missionId: recallMission.id,
    state: { mission_id: recallMission.id, mode: 'team', route: 'team', phase: 'implementation', prompt: recallPrompt },
    stageId: 'before_implementation'
  });
  if (repeatedRecallPulseRun.decision?.recommended_action !== 'suppress' || !repeatedRecallPulseRun.decision?.duplicate_suppression?.repeated) throw new Error('selftest: RecallPulse duplicate reminder suppression missing');
  const recallPulseEval = await evaluateRecallPulseFixtures(tmp, { missionId: recallMission.id, write: true });
  if (!recallPulseEval.passed || recallPulseEval.metrics.route_gate_agreement < 1 || recallPulseEval.metrics.unsupported_performance_claims !== 0) throw new Error('selftest: RecallPulse fixture eval failed');
  const { dir: researchDir, mission: researchMission } = await createMission(tmp, { mode: 'research', prompt: '새로운 코드 리뷰 방법론 연구' });
  const researchPlan = await writeResearchPlan(researchDir, researchMission.prompt, {});
  if (researchPlan.methodology !== 'genius-scout-council-frontier-discovery-loop' || researchPlan.web_research_policy?.mode !== 'layered_source_retrieval_and_triangulation') throw new Error('selftest: research plan contract');
  if (researchPlan.execution_policy?.default_max_cycles !== 12 || researchPlan.mutation_policy?.implementation_allowed !== false || !String(researchPlan.research_council?.debate_policy?.rule || '').includes('every scout records final agreement')) throw new Error('selftest: research consensus/no-code contract');
  if (!researchPlan.research_council?.scouts?.every((scout) => scout.agent_name && scout.display_name && scout.persona && scout.persona_boundary && scout.reasoning_effort === 'xhigh') || !researchPlan.research_council.scouts.some((scout) => scout.agent_name === 'Einstein Scout')) throw new Error('selftest: research scout persona contract missing from plan');
  const researchPaperArtifact = researchPlan.artifacts?.research_paper;
  if (!isDatedResearchPaperArtifact(researchPaperArtifact) || researchPaperArtifact === 'research-paper.md') throw new Error('selftest: research paper artifact filename is not dated and titled');
  const researchPrompt = buildResearchPrompt({ id: researchMission.id, mission: researchMission, plan: researchPlan, cycle: 1, previous: '' });
  if (!researchPrompt.includes('NO-CODE-MUTATION POLICY') || !researchPrompt.includes('not a fixed three-cycle run') || !researchPrompt.includes('unanimous_consensus=true') || !researchPrompt.includes('agent_name') || !researchPrompt.includes(researchPaperArtifact)) throw new Error('selftest: research prompt missing no-code unanimous consensus policy');
  const rArts = researchPlan.required_artifacts || [];
  for (const a of [rss, 'source-ledger.json', 'scout-ledger.json', 'debate-ledger.json', 'falsification-ledger.json']) if (!rArts.includes(a) || !(await exists(path.join(researchDir, a)))) throw new Error('selftest: research artifact');
  if (!rArts.includes(researchPaperArtifact) || rArts.includes('research-paper.md') || !rArts.includes(gos)) throw new Error('selftest: research paper');
  const initialResearchGate = await evaluateResearchGate(researchDir);
  if (initialResearchGate.passed || ['web_search_pass_missing', 'eureka_missing', 'debate_exchanges_missing', 'research_paper_missing', 'consensus_iteration_missing', 'unanimous_consensus_missing'].some((r) => !initialResearchGate.reasons.includes(r))) throw new Error('selftest: research gate');
  const researchGate = await writeMockResearchResult(researchDir, researchPlan);
  if (!researchGate.passed) throw new Error('selftest: mock research gate did not pass');
  if (!(await exists(path.join(researchDir, researchPaperArtifact))) || await exists(path.join(researchDir, 'research-paper.md'))) throw new Error('selftest: mock research paper filename did not use dated title artifact');
  const rm = researchGate.metrics || {};
  if (rm.research_paper_artifact !== researchPaperArtifact) throw new Error('selftest: research gate did not report dated paper artifact');
  if (rm.scout_persona_contract_ok !== true || (rm.scout_persona_issues || []).length) throw new Error('selftest: research scout persona contract did not pass');
  if (['independent_scouts', 'xhigh_scouts', 'eureka_moments', 'debate_participants', 'genius_opinion_summaries'].some((m) => rm[m] < 5) || ['counterevidence_sources', 'falsification_cases', 'triangulation_checks'].some((m) => rm[m] < 1) || rm.paper_sections < 8 || rm.citation_coverage !== true || rm.source_layers_covered < 7 || rm.consensus_iterations < 1 || rm.unanimous_consensus !== true || rm.consensus_agreed_scouts < 5) throw new Error('selftest: research metrics');
  await writeJsonAtomic(path.join(dir, 'done-gate.json'), { passed: true, unsupported_critical_claims: 0, database_safety_violation: false, database_safety_reviewed: true, visual_drift: 'low', wiki_drift: 'low', tests_required: false });
  const gate = await evaluateDoneGate(tmp, id);
  if (!gate.passed) throw new Error('selftest: done gate');
  const gxDir = path.join(tmp, '.sneakoscope', 'gx', 'cartridges', 'selftest');
  await writeJsonAtomic(path.join(gxDir, 'vgraph.json'), defaultVGraph('selftest'));
  await writeJsonAtomic(path.join(gxDir, 'beta.json'), defaultBeta('selftest'));
  const render = await renderCartridge(gxDir, { format: 'all' });
  if (!render.outputs.includes('render.svg')) throw new Error('selftest: gx svg not rendered');
  const validation = await validateCartridge(gxDir);
  if (!validation.ok) throw new Error('selftest: gx validation rejected');
  if (!validateWikiCoordinateIndex(validation.wiki_coordinates).ok) throw new Error('selftest: gx wiki coordinate validation rejected');
  const drift = await driftCartridge(gxDir);
  if (drift.status !== 'low') throw new Error('selftest: gx drift is high');
  const snapshot = await snapshotCartridge(gxDir);
  if (!snapshot.files.svg || !snapshot.files.html) throw new Error('selftest: gx snapshot incomplete');
  if (!validateWikiCoordinateIndex(snapshot.wiki_coordinates).ok) throw new Error('selftest: gx snapshot wiki coordinates invalid');
  const { dir: oldFromChatTempDir } = await createMission(tmp, { mode: 'team', prompt: '$From-Chat-IMG old temp TriWiki retention selftest' });
  await writeJsonAtomic(path.join(oldFromChatTempDir, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT), { schema_version: 1, scope: 'temporary', storage: 'triwiki', expires_after_sessions: 1, claims: [{ id: 'req-1', text: 'old temporary claim' }] });
  const oldMtime = new Date(Date.now() - 60 * 1000);
  await fsp.utimes(oldFromChatTempDir, oldMtime, oldMtime);
  await createMission(tmp, { mode: 'team', prompt: 'newer mission for temp TriWiki retention selftest' });
  const gc = await enforceRetention(tmp, { dryRun: true });
  if (!gc.report.exists) throw new Error('selftest: storage report');
  if (!gc.actions.some((action) => action.action === 'remove_from_chat_img_temp_triwiki')) throw new Error('selftest: From-Chat-IMG temporary TriWiki retention action missing');
  console.log(`${sksAsciiLogo()}\nselftest passed.`);
  console.log(`temp: ${tmp}`);
}
