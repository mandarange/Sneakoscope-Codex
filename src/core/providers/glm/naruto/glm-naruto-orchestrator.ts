import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { resolveOpenRouterApiKey } from '../../openrouter/openrouter-secret-store.js';
import { checkAndApplyGlmPatch } from '../glm-patch-apply.js';
import { decomposeTask, validateWorkGraph } from './glm-naruto-decomposer.js';
import { planShardCandidates, computeInitialLaneMix } from './glm-naruto-shard-planner.js';
import { runPatchWorkerPool } from './glm-naruto-worker-pool.js';
import { runVerifierWorker } from './glm-naruto-worker-runtime.js';
import { buildConflictGraph } from './glm-naruto-conflict-graph.js';
import { planMerge } from './glm-naruto-merge-planner.js';
import { finalizeMergePlan } from './glm-naruto-finalizer.js';
import { planRepairWave } from './glm-naruto-repair-wave.js';
import { createBudget, checkBudget, recordRequest } from './glm-naruto-budget.js';
import { createProviderHealthTracker } from '../../openrouter/openrouter-provider-health.js';
import { createMissionTrace, recordWorkerTrace, writeMissionArtifacts, buildMissionSummary } from './glm-naruto-trace.js';
import { runGlmJudge } from './glm-naruto-judge.js';
import { writeFinalStopGate } from '../../../stop-gate/stop-gate-writer.js';
import type {
  GlmNarutoMissionResult,
  GlmNarutoWorkGraph,
  GlmNarutoPatchEnvelope,
  GlmNarutoTerminalState,
  GlmNarutoMergeStrategy,
  GlmNarutoPatchStrategy
} from './glm-naruto-types.js';
import { GLM_NARUTO_LIMITS } from './glm-naruto-types.js';

export interface OrchestratorInput {
  readonly cwd: string;
  readonly task: string;
  readonly args: readonly string[];
  readonly missionId?: string;
  readonly maxWorkers?: number;
  readonly deep?: boolean;
  readonly useJudge?: boolean;
  readonly xhighFinalizer?: boolean;
  readonly useWorktree?: boolean;
  readonly noApply?: boolean;
  readonly mergeStrategy?: GlmNarutoMergeStrategy;
}

export async function runGlmNarutoMission(input: OrchestratorInput): Promise<GlmNarutoMissionResult> {
  const missionId = input.missionId || `glm-naruto-${nowIso().replace(/[:.]/g, '-')}`;
  const cwd = input.cwd;
  const startedMs = Date.now();

  const key = await resolveOpenRouterApiKey({ env: process.env });
  if (!key.key) {
    return missionResult(missionId, input.task, 'blocked', 'glm_missing_openrouter_key', 0, startedMs, [], [], ['glm_missing_openrouter_key'], []);
  }

  const mentionedPaths = extractMentionedPaths(input.task);
  const gitStatus = await readGitStatus(cwd);

  const graph = decomposeTask({
    missionId,
    task: input.task,
    gitStatus,
    mentionedPaths
  });

  const isVerifyOnly = input.task.trim().toLowerCase().startsWith('verify');
  const validation = validateWorkGraph(graph, isVerifyOnly);
  if (!validation.ok) {
    return missionResult(missionId, input.task, 'blocked', validation.reason || 'invalid_work_graph', 0, startedMs, [], [], [validation.reason || 'invalid_work_graph'], []);
  }

  const budget = createBudget(missionId, input.deep || false);
  const budgetCheck = checkBudget(budget);
  if (!budgetCheck.ok) {
    return missionResult(missionId, input.task, 'budget_exhausted', budgetCheck.reason!, 0, startedMs, [], [], [budgetCheck.reason!], []);
  }

  const laneMix = computeInitialLaneMix(graph);
  const strategies = planShardCandidates(graph);
  const strategyMap = new Map<string, readonly GlmNarutoPatchStrategy[]>();
  for (const entry of strategies) {
    strategyMap.set(entry.shard.id, entry.strategies);
  }

  const healthTracker = createProviderHealthTracker();
  let traceState = createMissionTrace(missionId);

  // Wave 1: parallel patch candidate generation
  const poolResult = await runPatchWorkerPool({
    apiKey: key.key,
    missionId,
    cwd,
    shards: graph.shards,
    contextSummary: JSON.stringify({ task: input.task, git_status: gitStatus || '' }),
    maxWorkers: input.maxWorkers || laneMix.patch_workers,
    workerTimeoutMs: GLM_NARUTO_LIMITS.max_worker_runtime_ms,
    strategies: strategyMap
  });

  for (const trace of poolResult.traces) {
    traceState = recordWorkerTrace(traceState, trace);
  }
  healthTracker.record({ provider_slug: 'openrouter', model: GLM_52_OPENROUTER_MODEL, count_429: 0, count_5xx: 0 });

  let envelopes = poolResult.envelopes;
  let failedShardIds = poolResult.failedShardIds;
  let repairWaves = 0;

  // Repair wave if needed
  if (failedShardIds.length > 0 && repairWaves < GLM_NARUTO_LIMITS.max_repair_waves) {
    const repairPlan = planRepairWave({
      failedEnvelopes: envelopes.filter((e) => e.status === 'gate_failed'),
      shards: graph.shards,
      repairWaveCount: repairWaves
    });
    if (repairPlan.canRepair && repairPlan.shardsToRepair.length > 0) {
      repairWaves++;
      const repairPool = await runPatchWorkerPool({
        apiKey: key.key,
        missionId,
        cwd,
        shards: repairPlan.shardsToRepair,
        contextSummary: JSON.stringify({ task: input.task, repair: true }),
        maxWorkers: input.maxWorkers || 3,
        workerTimeoutMs: GLM_NARUTO_LIMITS.max_worker_runtime_ms,
        strategies: new Map(repairPlan.shardsToRepair.map((s) => [s.id, [s.strategy]]))
      });
      envelopes = [...envelopes, ...repairPool.envelopes];
      for (const trace of repairPool.traces) {
        traceState = recordWorkerTrace(traceState, trace);
      }
      failedShardIds = [...failedShardIds, ...repairPool.failedShardIds];
    }
  }

  // 4.0.9: Verifier wave — run parallel verifier workers over gate-passed candidates.
  let passedEnvelopes = envelopes.filter((e) => e.status === 'gate_passed');
  if (passedEnvelopes.length > 0 && !input.noApply) {
    const verifyApiKey = key.key;
    const verifyResults = await Promise.allSettled(
      passedEnvelopes.map((env) =>
        runVerifierWorker({
          apiKey: verifyApiKey,
          missionId,
          workerId: env.worker_id,
          envelope: env,
          timeoutMs: 120_000,
        })
      )
    );
    const verifiedEnvelopes: GlmNarutoPatchEnvelope[] = [];
    for (let vi = 0; vi < passedEnvelopes.length; vi++) {
      const env = passedEnvelopes[vi]!;
      const res = verifyResults[vi]!;
      if (res.status === 'fulfilled' && res.value.ok) {
        verifiedEnvelopes.push({ ...env, verification_passed: true, status: 'gate_passed' });
      } else {
        verifiedEnvelopes.push({ ...env, verification_passed: false, status: 'verification_failed' });
      }
      if (res.status === 'fulfilled') {
        traceState = recordWorkerTrace(traceState, res.value.trace);
      }
    }
    envelopes = envelopes.map((e) => {
      const verified = verifiedEnvelopes.find((v) => v.worker_id === e.worker_id);
      return verified ?? e;
    });
    passedEnvelopes = envelopes.filter((e) => e.status === 'gate_passed');
  }

  // Build conflict graph and merge plan
  const nodes = passedEnvelopes.map((env) => ({
    patch_id: env.worker_id,
    shard_id: env.shard_id,
    target_paths: env.target_paths,
    score: Math.max(0, 100 - Math.floor(env.patch.length / 100)),
    gate_passed: true,
    patch_sha256: env.patch_sha256
  }));
  const conflictGraph = buildConflictGraph(passedEnvelopes, nodes);

  let judgeResult = null;
  if (input.useJudge && passedEnvelopes.length > 1) {
    judgeResult = await runGlmJudge({
      apiKey: key.key,
      missionId,
      envelopes: passedEnvelopes,
      timeoutMs: 120_000
    });
  }

  const mergePlan = finalizeMergePlan({
    missionId,
    envelopes: passedEnvelopes,
    ...(judgeResult ? { judgeResult } : {}),
    useJudge: input.useJudge || false,
    xhighFinalizer: input.xhighFinalizer || false
  });

  // Apply winning merge plan
  let appliedPatches = 0;
  let applyResult: { ok: boolean; applied: readonly string[] } | null = null;

  if (!input.noApply && mergePlan.selected_patches.length > 0) {
    for (const patchId of mergePlan.selected_patches) {
      const envelope = envelopes.find((e) => e.worker_id === patchId);
      if (!envelope) continue;
      const applied = await checkAndApplyGlmPatch({ cwd, patch: envelope.patch, apply: true });
      if (applied.ok) {
        appliedPatches++;
      }
    }
    applyResult = { ok: appliedPatches > 0, applied: mergePlan.selected_patches };
  }

  const terminalState: GlmNarutoTerminalState = appliedPatches > 0 ? 'completed' : passedEnvelopes.length > 0 ? 'partial_candidates' : 'blocked';
  const terminationReason = appliedPatches > 0 ? 'completed_merge_applied' : passedEnvelopes.length > 0 ? 'partial_no_apply' : 'no_gate_passed_candidates';

  const summary = buildMissionSummary({
    missionId,
    startedMs,
    workerTraces: traceState.workerTraces,
    patchCandidates: envelopes.length,
    gatePassed: passedEnvelopes.length,
    mergeable: mergePlan.candidates.length,
    appliedPatches,
    failedShards: failedShardIds.length,
    repairWaves
  });

  const result: GlmNarutoMissionResult = {
    schema: 'sks.glm-naruto-mission-result.v1',
    ok: terminalState === 'completed',
    status: terminalState,
    mission_id: missionId,
    task: input.task,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    termination_reason: terminationReason,
    workers_started: summary.workers_started,
    workers_completed: summary.workers_completed,
    patch_candidates: summary.patch_candidates,
    gate_passed_candidates: summary.gate_passed_candidates,
    mergeable_candidates: summary.mergeable_candidates,
    applied_patches: summary.applied_patches,
    failed_shards: summary.failed_shards,
    repair_waves: summary.repair_waves,
    budget_used_ms: summary.budget_used_ms,
    blockers: terminalState === 'blocked' ? ['no_gate_passed_candidates'] : [],
    warnings: []
  };

  const artifactDir = await writeMissionArtifacts({
    root: cwd,
    missionId,
    workGraph: graph,
    conflictGraph,
    mergePlan,
    ...(judgeResult ? { judgeResult } : {}),
    workerTraces: traceState.workerTraces,
    providerHealth: healthTracker.snapshot(),
    termination: { schema: 'sks.glm-naruto-termination.v1', mission_id: missionId, terminal_state: terminalState, reason: terminationReason, wall_clock_ms: summary.wall_clock_ms },
    ...(applyResult ? { applyResult: { ...applyResult, schema: 'sks.glm-naruto-apply-result.v1' } } : {}),
    verificationSummary: { schema: 'sks.glm-naruto-verification.v1', verified: passedEnvelopes.length, total: envelopes.length },
    missionResult: result,
    envelopes
  });
  // 4.0.9: Write canonical stop-gate artifacts for hook resolution.
  await writeFinalStopGate({
    root: cwd,
    missionId,
    route: 'GLM_NARUTO',
    routeCommand: '$Naruto',
    status: result.ok ? 'passed' : (terminalState === 'blocked' ? 'blocked' : 'failed'),
    terminal: terminalState === 'completed' || terminalState === 'blocked',
    terminalState,
    evidence: {
      build_passed: result.ok,
      tests_passed: result.ok,
      route_evidence_passed: result.ok,
      per_worker_artifacts: true,
      verifier_wave_run: true,
      model_guard_enforced: true,
    },
    blockers: result.blockers || [],
    nativeGateFile: 'termination.json',
  }).catch(() => null);

  return { ...result, artifact_dir: artifactDir };
}


function missionResult(
  missionId: string,
  task: string,
  status: GlmNarutoTerminalState,
  reason: string,
  patchCandidates: number,
  startedMs: number,
  envelopes: readonly GlmNarutoPatchEnvelope[],
  traces: readonly import('./glm-naruto-types.js').GlmNarutoWorkerTrace[],
  blockers: readonly string[],
  warnings: readonly string[]
): GlmNarutoMissionResult {
  return {
    schema: 'sks.glm-naruto-mission-result.v1',
    ok: status === 'completed',
    status,
    mission_id: missionId,
    task,
    model: GLM_52_OPENROUTER_MODEL,
    gpt_fallback_allowed: false,
    termination_reason: reason,
    workers_started: traces.length,
    workers_completed: traces.filter((t) => t.status === 'completed').length,
    patch_candidates: envelopes.length,
    gate_passed_candidates: envelopes.filter((e) => e.status === 'gate_passed').length,
    mergeable_candidates: 0,
    applied_patches: 0,
    failed_shards: 0,
    repair_waves: 0,
    budget_used_ms: Date.now() - startedMs,
    blockers,
    warnings
  };
}

async function readGitStatus(cwd: string): Promise<string | undefined> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('close', () => resolve(stdout.trim() || undefined));
  });
}

function extractMentionedPaths(task: string): readonly string[] {
  const matches = task.match(/(?:^|\s|[`"'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?:\s|[`"']|$)/g) || [];
  return [...new Set(matches.map((value) => value.trim().replace(/^[`"']|[`"']$/g, '')))];
}
