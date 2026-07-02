import path from 'node:path';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { appendJsonlBounded, exists, nowIso, readJson, readText, runProcess, sksRoot, writeJsonAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { getCodexInfo, runCodexExec } from '../codex-adapter.js';
import { createMission, loadMission, setCurrent, stateFile } from '../mission.js';
import { containsUserQuestion, noQuestionContinuationReason } from '../no-question-guard.js';
import { RESEARCH_GENIUS_SUMMARY_ARTIFACT, RESEARCH_SOURCE_SKILL_ARTIFACT, buildResearchPrompt, countGeniusOpinionSummaries, countResearchPaperSections, evaluateResearchGate, findResearchPaperArtifact, researchPaperArtifactForPlan, writeMockResearchResult, writeResearchPlan } from '../research.js';
import { ROUTES, reflectionRequiredForRoute, routeNeedsContext7, routePrompt, routeReasoning, routeRequiresSubagents } from '../routes.js';
import { PIPELINE_PLAN_ARTIFACT, validatePipelinePlan, writePipelinePlan } from '../pipeline.js';
import { enforceRetention } from '../retention.js';
import { scanDbSafety } from '../db-safety.js';
import { maybeFinalizeRoute } from '../proof/auto-finalize.js';
import { runNativeAgentOrchestrator } from '../agents/agent-orchestrator.js';
import { flag, positionalArgs, readFlagValue, readMaxCycles, readBoundedIntegerFlag, resolveMissionId, safeReadTextFile } from './command-utils.js';
import { writeResearchWorkGraph } from '../research/research-work-graph.js';
import { runResearchCycle } from '../research/research-cycle-runner.js';
import { readResearchQualityContract } from '../research/research-quality-contract.js';
import { readClaimEvidenceMatrix } from '../research/claim-evidence-matrix.js';
import { readSourceQualityReport } from '../research/source-quality-report.js';
import { readImplementationBlueprint, validateImplementationBlueprint } from '../research/implementation-blueprint.js';
import { readExperimentPlan, validateExperimentPlan } from '../research/experiment-plan.js';
import { readReplicationPack, validateReplicationPack } from '../research/replication-pack.js';
import { readResearchFinalReview } from '../research/research-final-reviewer.js';

const RESEARCH_DEFAULT_MAX_CYCLES = 12;
const RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES = 120;
const RESEARCH_MIN_CYCLE_TIMEOUT_MINUTES = 15;
const RESEARCH_MAX_CYCLE_TIMEOUT_MINUTES = 240;

export async function researchCommand(sub: any, args: any = []) {
  if (sub === 'prepare') return researchPrepare(args);
  if (sub === 'run') return researchRun(args);
  if (sub === 'status') return researchStatus(args);
  console.error('Usage: sks research <prepare|run|status>');
  process.exitCode = 1;
}

export async function autoresearchCommand(sub: any, args: any = []) {
  return researchCommand(sub || 'status', args);
}

function hasFlagOption(args: any[] = [], name: string) {
  return args.includes(name) || args.some((arg: any) => String(arg).startsWith(`${name}=`));
}

function limitResearchNativeWorkGraph(graph: any, limit: number) {
  const count = Math.max(1, Math.min(Number(graph?.work_items?.length || 0) || 1, Math.floor(Number(limit) || 1)));
  const workItems = (graph.work_items || []).slice(0, count).map((item: any) => {
    const selectedIds = new Set((graph.work_items || []).slice(0, count).map((row: any) => String(row.id || '')));
    return {
      ...item,
      dependencies: (item.dependencies || []).map(String).filter((id: string) => selectedIds.has(id)),
      can_run_in_parallel_with: (item.can_run_in_parallel_with || []).map(String).filter((id: string) => selectedIds.has(id))
    };
  });
  const selectedIds = new Set(workItems.map((item: any) => String(item.id || '')));
  const activeWaves = (graph.active_waves || [])
    .map((wave: any) => ({
      ...wave,
      work_item_ids: (wave.work_item_ids || []).map(String).filter((id: string) => selectedIds.has(id)),
      write_paths: (wave.write_paths || []).map(String),
      conflict_count: Number(wave.conflict_count || 0)
    }))
    .filter((wave: any) => wave.work_item_ids.length > 0);
  return {
    ...graph,
    requested_clones: Math.min(Number(graph.requested_clones || count), count),
    total_work_items: workItems.length,
    work_items: workItems,
    active_waves: activeWaves,
    mixed_work_kinds: [...new Set(workItems.map((item: any) => item.kind))],
    write_allowed_count: workItems.filter((item: any) => item.write_allowed === true).length
  };
}

async function researchPrepare(args: any) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const prompt = positionalArgs(args).join(' ').trim();
  if (!prompt) throw new Error('Missing research topic.');
  const { id, dir } = await createMission(root, { mode: 'research', prompt });
  const route = ROUTES.find((entry: any) => entry.id === 'Research') || routePrompt('$Research');
  const context7Required = routeNeedsContext7(route, prompt);
  const reasoning = routeReasoning(route, prompt);
  const autoresearch = flag(args, '--autoresearch');
  const plan = await writeResearchPlan(dir, prompt, { root, depth: readFlagValue(args, '--depth', 'frontier'), missionId: id, autoresearch });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: prompt, required: context7Required, ambiguity: { required: false, status: 'direct_research_cli' } });
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route: route.id,
    route_command: route.command,
    command: route.command,
    mode: route.mode,
    task: prompt,
    required_skills: route.requiredSkills,
    context7_required: context7Required,
    subagents_required: false,
    native_sessions_required: routeRequiresSubagents(route, prompt),
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
    subagents_required: false,
    subagents_verified: true,
    native_sessions_required: routeRequiresSubagents(route, prompt),
    native_sessions_verified: false,
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
  if (flag(args, '--json')) return console.log(JSON.stringify({ schema: autoresearch ? 'sks.autoresearch-prepare.v1' : 'sks.research-prepare.v1', ok: true, mission_id: id, methodology: plan.methodology, paper: researchPaperArtifactForPlan(plan), pipeline_plan: PIPELINE_PLAN_ARTIFACT, native_agent_plan: plan.native_agent_plan, agent_batches: plan.agent_batches, autoresearch_cycle_policy: plan.autoresearch_cycle_policy }, null, 2));
  console.log(`Research mission created: ${id}`);
  console.log(`Methodology: ${plan.methodology}`);
  console.log(`Plan: ${path.relative(root, path.join(dir, 'research-plan.md'))}`);
  console.log(`Run: sks research run ${id} --max-cycles ${RESEARCH_DEFAULT_MAX_CYCLES} --cycle-timeout-minutes ${RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES}`);
}

async function researchRun(args: any) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks research run <mission-id|latest> [--mock] [--max-cycles N] [--cycle-timeout-minutes N]');
  const { dir, mission } = await loadMission(root, id);
  const planPath = path.join(dir, 'research-plan.json');
  if (!(await exists(planPath))) await writeResearchPlan(dir, mission.prompt || '', { root, missionId: id, autoresearch: flag(args, '--autoresearch') });
  const plan: any = await readJson(planPath);
  const dbScan = await scanDbSafety(root);
  if (!dbScan.ok) {
    console.error('Research cannot run: DB Guardian found unsafe Supabase/MCP/database configuration.');
    console.error(JSON.stringify(dbScan.findings, null, 2));
    process.exitCode = 2;
    return;
  }
  const maxCycles = readMaxCycles(args, RESEARCH_DEFAULT_MAX_CYCLES);
  const requestedAgents = readBoundedIntegerFlag(args, '--agents', plan.native_agent_plan?.session_count || 5, 1, 20);
  const targetActiveSlots = readBoundedIntegerFlag(args, '--target-active-slots', requestedAgents, 1, 20);
  const desiredWorkItemCount = readBoundedIntegerFlag(args, '--work-items', targetActiveSlots, 1, 200);
  const minimumWorkItems = readBoundedIntegerFlag(args, '--minimum-work-items', targetActiveSlots, 1, 200);
  const maxQueueExpansion = readBoundedIntegerFlag(args, '--max-queue-expansion', 10, 0, 200);
  const cycleTimeoutMinutes = readResearchCycleTimeoutMinutes(args);
  const cycleTimeoutMs = cycleTimeoutMinutes * 60 * 1000;
  const profile = readFlagValue(args, '--profile', 'sks-research') || 'sks-research';
  const writeMode = readFlagValue(args, '--write-mode', flag(args, '--parallel-write') ? 'parallel' : 'off');
  const applyPatches = flag(args, '--apply-patches');
  const dryRunPatches = flag(args, '--dry-run-patches') || flag(args, '--dryrun-patches');
  const maxWriteAgents = readBoundedIntegerFlag(args, '--max-write-agents', Math.min(requestedAgents, 5), 1, 20);
  const mock = flag(args, '--mock');
  const researchWorkGraph = await writeResearchWorkGraph(dir, plan);
  const graphWorkItemCount = Math.max(1, Number(researchWorkGraph.total_work_items || researchWorkGraph.work_items?.length || 0));
  const explicitWorkItems = hasFlagOption(args, '--work-items');
  const effectiveDesiredWorkItemCount = explicitWorkItems ? desiredWorkItemCount : Math.max(desiredWorkItemCount, graphWorkItemCount);
  const effectiveMinimumWorkItems = Math.min(
    effectiveDesiredWorkItemCount,
    explicitWorkItems ? minimumWorkItems : Math.max(minimumWorkItems, Math.min(graphWorkItemCount, targetActiveSlots))
  );
  const nativeResearchWorkGraph = explicitWorkItems
    ? limitResearchNativeWorkGraph(researchWorkGraph, effectiveDesiredWorkItemCount)
    : researchWorkGraph;
  await runResearchCycle(dir, researchWorkGraph, { cycle: 0, status: mock ? 'mock_native_orchestrator_planned' : 'native_orchestrator_planned' });
  await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_RUNNING_NO_QUESTIONS', questions_allowed: false, implementation_allowed: false, research_real_run_required: !mock, research_cycle_timeout_minutes: cycleTimeoutMinutes });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.run.started', maxCycles, mock, cycleTimeoutMinutes, real_run_required: !mock });
  const nativeAgentRun = await runNativeAgentOrchestrator({ root, missionId: id, route: flag(args, '--autoresearch') ? '$AutoResearch' : '$Research', prompt: mission.prompt || plan.prompt || 'Research run', backend: mock ? 'fake' : 'codex-sdk', mock, agents: requestedAgents, targetActiveSlots, desiredWorkItemCount: effectiveDesiredWorkItemCount, minimumWorkItems: effectiveMinimumWorkItems, maxQueueExpansion, concurrency: Math.min(requestedAgents, 5), readonly: !applyPatches, profile, writeMode: writeMode as any, applyPatches, dryRunPatches, maxWriteAgents, roster: plan.native_agent_plan, routeCommand: 'sks research run', routeBlackboxKind: 'actual_research_command', narutoWorkGraph: researchWorkGraph });
  await writeJsonAtomic(path.join(dir, 'research-native-agent-run.json'), nativeAgentRun);
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.native_agents.completed', backend: nativeAgentRun.backend, ok: nativeAgentRun.ok, proof: nativeAgentRun.proof?.status });
  if (!nativeAgentRun.ok) {
    await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: await readJson(path.join(dir, 'research-gate.json'), null), artifacts: ['agents/agent-proof-evidence.json', 'research-native-agent-run.json', 'completion-proof.json'], statusHint: 'blocked', blockers: nativeAgentRun.proof?.blockers || ['native_agent_backend_blocked'], command: { cmd: `sks research run ${id}`, status: 2 } });
    await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_NATIVE_AGENTS', questions_allowed: true, implementation_allowed: false, blocker: 'agents/agent-proof-evidence.json' });
    process.exitCode = 2;
    return;
  }
  if (flag(args, '--native-proof-only')) {
    const proofOnlyGate = {
      schema: 'sks.research-native-proof-only-gate.v1',
      ok: nativeAgentRun.proof?.ok === true,
      native_agent_proof: nativeAgentRun.proof?.ok === true,
      proof_status: nativeAgentRun.proof?.status || null,
      blockers: nativeAgentRun.proof?.blockers || []
    };
    if (flag(args, '--json')) return console.log(JSON.stringify({
      schema: flag(args, '--autoresearch') ? 'sks.autoresearch-run.v1' : 'sks.research-run.v1',
      ok: proofOnlyGate.ok,
      mission_id: id,
      gate: proofOnlyGate,
      proof: nativeAgentRun.proof,
      native_agent_run: nativeAgentRun,
      research_work_graph: nativeResearchWorkGraph,
      native_proof_only: true
    }, null, 2));
    console.log(`Research native proof ready: ${id}`);
    return;
  }
  const legacyResearchCycle = flag(args, '--legacy-research-cycle') || process.env.SKS_RESEARCH_LEGACY_CYCLE === '1';
  const sourceMutationBaseline = await researchCodeMutationSnapshot(root, id);
  if (!legacyResearchCycle) {
    const cycleResult = await runResearchCycle({
      root,
      dir,
      plan,
      graph: researchWorkGraph,
      cycle: 1,
      backend: mock ? 'mock' : 'codex-sdk',
      timeoutMs: cycleTimeoutMs,
      maxParallelStages: readBoundedIntegerFlag(args, '--research-stage-parallelism', 4, 1, 16),
      mock
    });
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
        implementation_allowed: false
      };
      await writeJsonAtomic(path.join(dir, 'research-code-mutation-blocker.json'), blocker);
      await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: await readJson(path.join(dir, 'research-gate.json'), null), artifacts: ['research-code-mutation-blocker.json', 'completion-proof.json'], statusHint: 'blocked', blockers: ['research_code_mutation_detected'], command: { cmd: `sks research run ${id}`, status: 2 } });
      await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_CODE_MUTATION', questions_allowed: true, implementation_allowed: false, blocker: 'research-code-mutation-blocker.json' });
      process.exitCode = 2;
      return;
    }
    const gate = await evaluateResearchGate(dir);
    const passed = cycleResult.status === 'passed' && gate.passed === true;
    const proof = await maybeFinalizeRoute(root, {
      missionId: id,
      route: '$Research',
      gateFile: 'research-gate.json',
      gate: gate.gate || gate,
      artifacts: ['agents/agent-proof-evidence.json', 'research-native-agent-run.json', 'research-cycle-runner.json', 'research-gate.json', 'research-report.md', researchPaperArtifactForPlan(plan), 'source-ledger.json', 'claim-evidence-matrix.json', 'implementation-blueprint.json', 'team-handoff-goal.md', 'completion-proof.json'],
      statusHint: passed ? undefined : 'blocked',
      blockers: passed ? [] : [...(cycleResult.blockers || []), ...(gate.reasons || [])],
      mock,
      command: { cmd: `sks research run ${id}${mock ? ' --mock' : ''}`, status: passed ? 0 : 2 }
    });
    await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: passed ? 'RESEARCH_DONE' : 'RESEARCH_BLOCKED_STAGE_CYCLE', questions_allowed: true, implementation_allowed: false });
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: passed ? 'research.done' : 'research.stage_cycle.blocked', cycle: 1, cycle_status: cycleResult.status });
    await enforceRetention(root).catch(() => {});
    if (flag(args, '--json')) return console.log(JSON.stringify({ schema: flag(args, '--autoresearch') ? 'sks.autoresearch-run.v1' : 'sks.research-run.v1', ok: proof.ok && passed, mission_id: id, gate, quality_metrics: gate.metrics || null, proof: proof.validation, native_agent_run: nativeAgentRun, research_work_graph: researchWorkGraph, research_cycle: cycleResult, agent_batches: plan.agent_batches, autoresearch_cycle_policy: plan.autoresearch_cycle_policy }, null, 2));
    printResearchCompletion(id, root, dir, plan, gate);
    if (!passed) process.exitCode = 2;
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
    await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: await readJson(path.join(dir, 'research-gate.json'), null), artifacts: ['research-blocker.json', 'completion-proof.json'], statusHint: 'blocked', blockers: ['codex_cli_missing'], command: { cmd: `sks research run ${id}`, status: 2 } });
    await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_REAL_RUN_REQUIRED', questions_allowed: true, implementation_allowed: false, research_real_run_required: true, blocker: 'research-blocker.json' });
    console.error('Research cannot run real sources: Codex CLI not found.');
    process.exitCode = 2;
    return;
  }
  let last = '';
  const researchCodexArgs = ['-c', 'service_tier="fast"', '-c', 'model_reasoning_effort="xhigh"'];
  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const cycleDir = path.join(dir, 'research', `cycle-${cycle}`);
    const outputFile = path.join(cycleDir, 'final.md');
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.legacy_cycle.start', cycle, timeoutMinutes: cycleTimeoutMinutes, profile, enforced_reasoning_effort: 'xhigh', legacy_final_md_loop: true });
    const prompt = buildResearchPrompt({ id, mission, plan, cycle, previous: last });
    const result = await runCodexExec({ root, prompt, outputFile, json: true, profile, extraArgs: researchCodexArgs, logDir: cycleDir, timeoutMs: cycleTimeoutMs });
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
        implementation_allowed: false
      };
      await writeJsonAtomic(path.join(dir, 'research-code-mutation-blocker.json'), blocker);
      await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: await readJson(path.join(dir, 'research-gate.json'), null), artifacts: ['research-code-mutation-blocker.json', 'completion-proof.json'], statusHint: 'blocked', blockers: ['research_code_mutation_detected'], command: { cmd: `sks research run ${id}`, status: 2 } });
      await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_BLOCKED_CODE_MUTATION', questions_allowed: true, implementation_allowed: false, blocker: 'research-code-mutation-blocker.json' });
      process.exitCode = 2;
      return;
    }
    last = await safeReadTextFile(fsp, outputFile, result.stdout || result.stderr || '');
    if (containsUserQuestion(last)) {
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.guard.question_blocked', cycle });
      last = `${last}\n\n${noQuestionContinuationReason()}`;
      continue;
    }
    const gate = await evaluateResearchGate(dir);
    if (gate.passed) {
      const proof = await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: gate.gate || gate, artifacts: ['research-gate.json', 'research-report.md', researchPaperArtifactForPlan(plan), 'source-ledger.json', 'agent-ledger.json', 'debate-ledger.json', 'completion-proof.json'], command: { cmd: `sks research run ${id}`, status: 0 } });
      await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_DONE', questions_allowed: true, implementation_allowed: false });
      await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.done', cycle });
      await enforceRetention(root).catch(() => {});
      if (flag(args, '--json')) return console.log(JSON.stringify({ schema: flag(args, '--autoresearch') ? 'sks.autoresearch-run.v1' : 'sks.research-run.v1', ok: proof.ok, mission_id: id, gate, quality_metrics: gate.metrics || null, proof: proof.validation, research_work_graph: researchWorkGraph, agent_batches: plan.agent_batches, autoresearch_cycle_policy: plan.autoresearch_cycle_policy }, null, 2));
      printResearchCompletion(id, root, dir, plan, gate);
      return;
    }
  }
  const gate = await evaluateResearchGate(dir);
  await maybeFinalizeRoute(root, { missionId: id, route: '$Research', gateFile: 'research-gate.json', gate: gate.gate || gate, artifacts: ['research-gate.json', 'completion-proof.json'], statusHint: 'blocked', blockers: ['research_max_cycles_without_consensus'], command: { cmd: `sks research run ${id}`, status: 2 } });
  await setCurrent(root, { mission_id: id, mode: 'RESEARCH', phase: 'RESEARCH_PAUSED_MAX_CYCLES', questions_allowed: true, implementation_allowed: false });
  console.log(`Research paused after max cycles without unanimous agent consensus: ${id}`);
}

function printResearchCompletion(id: string, root: string, dir: string, plan: any, gate: any) {
  const metrics = gate?.metrics || {};
  const synthesis = metrics.synthesis || {};
  const rel = (artifact: string) => path.relative(root, path.join(dir, artifact));
  console.log(`Research done: ${id}`);
  console.log(`Synthesis: ${synthesis.writer || 'missing'}`);
  console.log(`Report: ${rel('research-report.md')}`);
  console.log(`Paper: ${rel(researchPaperArtifactForPlan(plan))}`);
  console.log(`Implementation blueprint: ${rel('implementation-blueprint.json')}`);
  console.log(`Claim-evidence matrix: ${rel('claim-evidence-matrix.json')}`);
  console.log(`Experiment plan: ${rel('experiment-plan.json')}`);
  console.log(`Replication pack: ${rel('replication-pack.json')}`);
  console.log(`Gate: ${gate?.passed ? 'passed' : 'blocked'}`);
  console.log(`Quality: ${metrics.report_word_count ?? 0} words / ${metrics.source_entries_total_with_counterevidence ?? metrics.source_entries ?? 0} sources / ${metrics.key_claims ?? 0} key claims / repetition ${synthesis.repetition_ratio ?? metrics.report_repetition?.repeated_paragraph_ratio ?? 'n/a'}`);
  console.log(`Final review: static ${metrics.final_review_blockers?.length ? 'block' : 'pass'} / codex ${synthesis.codex_final_review_verdict || 'missing'}`);
  console.log(`Handoff: ${rel('team-handoff-goal.md')}`);
}

async function researchStatus(args: any) {
  const root = await sksRoot();
  const id = await resolveMissionId(root, args[0]);
  if (!id) throw new Error('Usage: sks research status <mission-id|latest>');
  const { dir, mission } = await loadMission(root, id);
  const state = await readJson(stateFile(root), {});
  const gate = await readJson(path.join(dir, 'research-gate.evaluated.json'), await readJson(path.join(dir, 'research-gate.json'), null));
  const ledger = await readJson(path.join(dir, 'novelty-ledger.json'), null);
  const sourceLedger = await readJson(path.join(dir, 'source-ledger.json'), null);
  const agentLedger = await readJson(path.join(dir, 'agent-ledger.json'), null);
  const debateLedger = await readJson(path.join(dir, 'debate-ledger.json'), null);
  const falsificationLedger = await readJson(path.join(dir, 'falsification-ledger.json'), null);
  const sourceSkillText = await readText(path.join(dir, RESEARCH_SOURCE_SKILL_ARTIFACT), '');
  const geniusSummaryText = await readText(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT), '');
  const plan = await readJson(path.join(dir, 'research-plan.json'), null);
  const agentSessions = await readJson(path.join(dir, 'agents', 'agent-sessions.json'), null);
  const agentTaskBoard = await readJson(path.join(dir, 'agents', 'agent-task-board.json'), null);
  const agentBatches = await readJson(path.join(dir, 'research-agent-batches.json'), null);
  const paperArtifact = await findResearchPaperArtifact(dir, plan);
  const paperText = paperArtifact.exists ? await readText(paperArtifact.path, '') : '';
  const agentRows = Array.isArray(agentLedger?.agents) ? agentLedger.agents : [];
  const sourceLayerRows = Array.isArray(sourceLedger?.source_layers) ? sourceLedger.source_layers : [];
  const sourceLayersCovered = sourceLayerRows.filter((layer: any) => layer.status === 'covered' && ((Array.isArray(layer.source_ids) && layer.source_ids.length) || (Array.isArray(layer.counterevidence_ids) && layer.counterevidence_ids.length))).length;
  const qualityContract = await readResearchQualityContract(dir);
  const claimMatrix = await readClaimEvidenceMatrix(dir);
  const sourceQualityReport = await readSourceQualityReport(dir);
  const implementationBlueprint = await readImplementationBlueprint(dir);
  const experimentPlan = await readExperimentPlan(dir);
  const replicationPack = await readReplicationPack(dir);
  const finalReview = await readResearchFinalReview(dir);
  const synthesisOutput = await readJson(path.join(dir, 'research-synthesis-output.json'), null);
  const blueprintValidation = validateImplementationBlueprint(implementationBlueprint, qualityContract);
  const experimentValidation = validateExperimentPlan(experimentPlan, qualityContract);
  const replicationValidation = validateReplicationPack(replicationPack);
  console.log(JSON.stringify({
    mission,
    state,
    agent_backend: plan?.native_agent_plan?.backend || 'native_multi_session_agent_kernel',
    native_agent_plan: plan?.native_agent_plan || null,
    agent_sessions: agentSessions?.sessions || null,
    agent_task_slices: agentTaskBoard?.slices || null,
    agent_batches: agentBatches?.batches || plan?.agent_batches || null,
    autoresearch_cycle_policy: plan?.autoresearch_cycle_policy || null,
    legacy_alias_policy: plan?.native_agent_plan?.legacy_artifact_alias_policy || null,
    gate,
    novelty_entries: ledger?.entries?.length ?? null,
    source_entries: sourceLedger?.sources?.length ?? null,
    source_layers_required: sourceLayerRows.length || gate?.metrics?.source_layers_required || gate?.source_layers_required || null,
    source_layers_covered: gate?.metrics?.source_layers_covered ?? gate?.source_layers_covered ?? (sourceLayerRows.length ? sourceLayersCovered : null),
    triangulation_checks: sourceLedger?.triangulation?.cross_layer_checks?.length ?? gate?.metrics?.triangulation_checks ?? gate?.triangulation_checks ?? null,
    genius_opinion_summaries: gate?.metrics?.genius_opinion_summaries ?? gate?.genius_opinion_summaries ?? (geniusSummaryText.trim() ? countGeniusOpinionSummaries(geniusSummaryText) : null),
    counterevidence_sources: sourceLedger?.counterevidence_sources?.length ?? null,
    xhigh_agents: agentRows.length ? agentRows.filter((agent: any) => agent.effort === 'xhigh').length : null,
    eureka_moments: agentRows.length ? agentRows.filter((agent: any) => agent.eureka?.exclamation === 'Eureka!' && String(agent.eureka?.idea || '').trim()).length : null,
    agent_findings: agentRows.length ? agentRows.reduce((sum: any, agent: any) => sum + (Array.isArray(agent.findings) ? agent.findings.length : 0), 0) : null,
    debate_exchanges: debateLedger?.exchanges?.length ?? null,
    consensus_iterations: gate?.metrics?.consensus_iterations ?? gate?.consensus_iterations ?? debateLedger?.consensus_iterations ?? null,
    unanimous_consensus: gate?.metrics?.unanimous_consensus ?? gate?.unanimous_consensus ?? debateLedger?.unanimous_consensus ?? false,
    research_source_skill_present: Boolean(sourceSkillText.trim()),
    genius_opinion_summary_present: Boolean(geniusSummaryText.trim()),
    research_paper_artifact: paperArtifact.name,
    paper_present: Boolean(paperText.trim()),
    paper_sections: countResearchPaperSections(paperText),
    falsification_cases: falsificationLedger?.cases?.length ?? null,
    research_quality: {
      contract: qualityContract,
      report_word_count: gate?.metrics?.report_word_count ?? null,
      synthesis: {
        writer: gate?.metrics?.synthesis?.writer ?? (synthesisOutput ? 'evidence-bound writer artifact present' : null),
        repetition_ratio: gate?.metrics?.synthesis?.repetition_ratio ?? gate?.metrics?.report_repetition?.repeated_paragraph_ratio ?? null,
        source_density_per_1000_words: gate?.metrics?.synthesis?.source_density_per_1000_words ?? gate?.metrics?.source_density_per_1000_words ?? null,
        claim_density_per_1000_words: gate?.metrics?.synthesis?.claim_density_per_1000_words ?? gate?.metrics?.claim_density_per_1000_words ?? null,
        template_phrase_hits: gate?.metrics?.synthesis?.template_phrase_hits ?? gate?.metrics?.template_phrase_hits ?? [],
        codex_final_review_verdict: finalReview?.codex_review?.verdict || null
      },
      claim_evidence_matrix_present: claimMatrix.present,
      key_claims: claimMatrix.key_claim_ids.length,
      triangulated_claims: claimMatrix.triangulated_claim_count,
      claim_matrix_blockers: claimMatrix.blockers,
      source_quality_report_ok: sourceQualityReport?.ok === true,
      implementation_blueprint_sections: Array.isArray(implementationBlueprint?.sections) ? implementationBlueprint.sections.length : null,
      implementation_blueprint_ok: blueprintValidation.ok,
      experiment_steps: Array.isArray(experimentPlan?.steps) ? experimentPlan.steps.length : null,
      experiment_plan_ok: experimentValidation.ok,
      replication_pack_ok: replicationValidation.ok,
      final_review_approved: finalReview?.approved === true,
      final_review_blockers: finalReview?.blockers || []
    }
  }, null, 2));
}

async function researchCodeMutationSnapshot(root: any, missionId: any = null) {
  const tracked = await runProcess('git', ['ls-files'], { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }).catch((err: any) => ({ code: 1, stderr: err.message, stdout: '' }));
  const status = await runProcess('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }).catch((err: any) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (tracked.code !== 0 || status.code !== 0) return { ok: false, reason: 'git_unavailable', hashes: {}, status_rows: [], error: tracked.stderr || status.stderr };
  const allowedPrefixes = researchAllowedMutationPrefixes(missionId);
  const hashes: Record<string, string | null> = {};
  for (const rel of tracked.stdout.split(/\r?\n/).map((line: any) => line.trim()).filter(Boolean)) {
    if (researchMutationAllowedPath(rel, allowedPrefixes)) continue;
    const file = path.join(root, rel);
    try {
      const bytes = await fsp.readFile(file);
      hashes[rel] = createHash('sha256').update(bytes).digest('hex');
    } catch {
      hashes[rel] = null;
    }
  }
  return { ok: true, hashes, status_rows: status.stdout.split(/\r?\n/).filter(Boolean), allowed_prefixes: allowedPrefixes };
}

async function researchCodeMutationDelta(root: any, baseline: any, missionId: any) {
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
  return { blocked: changedPaths.length > 0, changed_paths: changedPaths, allowed_prefixes: current.allowed_prefixes };
}

function researchAllowedMutationPrefixes(missionId: any = null) {
  return missionId ? [`.sneakoscope/missions/${missionId}/`] : ['.sneakoscope/missions/'];
}

function researchMutationAllowedPath(rel: any = '', prefixes: any = []) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return prefixes.some((prefix: any) => normalized.startsWith(prefix));
}

function porcelainStatusPath(row: any = '') {
  const payload = String(row || '').slice(3).trim();
  if (!payload) return '';
  const renamed = payload.split(' -> ').pop();
  return String(renamed || '').replace(/^"|"$/g, '');
}

function readResearchCycleTimeoutMinutes(args: any) {
  return readBoundedIntegerFlag(args, '--cycle-timeout-minutes', RESEARCH_DEFAULT_CYCLE_TIMEOUT_MINUTES, RESEARCH_MIN_CYCLE_TIMEOUT_MINUTES, RESEARCH_MAX_CYCLE_TIMEOUT_MINUTES);
}
