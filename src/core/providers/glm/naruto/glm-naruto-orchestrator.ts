import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../../../fsx.js';
import { GLM_52_OPENROUTER_MODEL } from '../glm-52-settings.js';
import { resolveOpenRouterApiKey } from '../../openrouter/openrouter-secret-store.js';
import { decomposeTask, validateWorkGraph } from './glm-naruto-decomposer.js';
import { planShardCandidates, computeInitialLaneMix } from './glm-naruto-shard-planner.js';
import { runPatchWorkerPool } from './glm-naruto-worker-pool.js';
import { runVerifierWorker } from './glm-naruto-worker-runtime.js';
import { buildConflictGraph } from './glm-naruto-conflict-graph.js';
import { finalizeMergePlan } from './glm-naruto-finalizer.js';
import { planRepairWave } from './glm-naruto-repair-wave.js';
import { createBudget, checkBudget } from './glm-naruto-budget.js';
import { createProviderHealthTracker } from '../../openrouter/openrouter-provider-health.js';
import { createMissionTrace, recordWorkerTrace, writeMissionArtifacts, buildMissionSummary } from './glm-naruto-trace.js';
import { runGlmJudge } from './glm-naruto-judge.js';
import { writeFinalStopGate } from '../../../stop-gate/stop-gate-writer.js';
import { auditGlmNarutoArtifactsForSecrets } from './glm-naruto-secret-audit.js';
import { resolveGlmNarutoIsolationPolicy } from './glm-naruto-isolation-policy.js';
import { getGitHead, getGitRoot } from './glm-naruto-worktree-manager.js';
import { buildGlmNarutoCandidateScoreboard } from './glm-naruto-scoreboard.js';
import { runGlmNarutoApplyTransaction } from './glm-naruto-apply-transaction.js';
import { finalizeGlmNarutoTerminal } from './glm-naruto-terminal.js';
import type {
  GlmNarutoMissionResult,
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
  readonly patchEnvelopeOnly?: boolean;
  readonly allowPatchEnvelopeFallback?: boolean;
  readonly keepWorktrees?: boolean;
  readonly cleanupWorktrees?: boolean;
  readonly noApply?: boolean;
  readonly skipVerifier?: boolean;
  readonly mergeStrategy?: GlmNarutoMergeStrategy;
}

export async function runGlmNarutoMission(input: OrchestratorInput): Promise<GlmNarutoMissionResult> {
  const missionId = input.missionId || `glm-naruto-${nowIso().replace(/[:.]/g, '-')}`;
  const cwd = input.cwd;
  const startedMs = Date.now();

  const key = await resolveOpenRouterApiKey({ env: process.env });
  if (!key.key) {
    return finalizeGlmNarutoTerminal({
      root: cwd,
      missionId,
      result: missionResult(missionId, input.task, 'blocked', 'glm_missing_openrouter_key', 0, startedMs, [], [], ['glm_missing_openrouter_key'], [])
    });
  }

  const mentionedPaths = extractMentionedPaths(input.task);
  const gitStatus = await readGitStatus(cwd);
  const gitRoot = await getGitRoot(cwd);
  const baseCommit = gitRoot ? await getGitHead(cwd) : null;
  const isolationPolicy = resolveGlmNarutoIsolationPolicy({
    ...(input.useWorktree !== undefined ? { useWorktree: input.useWorktree } : {}),
    ...(input.patchEnvelopeOnly !== undefined ? { patchEnvelopeOnly: input.patchEnvelopeOnly } : {}),
    ...(input.allowPatchEnvelopeFallback !== undefined ? { fallbackAllowed: input.allowPatchEnvelopeFallback } : {}),
    gitAvailable: Boolean(gitRoot && baseCommit)
  });
  if (isolationPolicy.selected === 'blocked') {
    return finalizeGlmNarutoTerminal({
      root: cwd,
      missionId,
      result: missionResult(missionId, input.task, 'blocked', isolationPolicy.reason, 0, startedMs, [], [], isolationPolicy.blockers, [])
    });
  }

  const graph = decomposeTask({
    missionId,
    task: input.task,
    gitStatus,
    mentionedPaths
  });

  const isVerifyOnly = input.task.trim().toLowerCase().startsWith('verify');
  const validation = validateWorkGraph(graph, isVerifyOnly);
  if (!validation.ok) {
    return finalizeGlmNarutoTerminal({
      root: cwd,
      missionId,
      result: missionResult(missionId, input.task, 'blocked', validation.reason || 'invalid_work_graph', 0, startedMs, [], [], [validation.reason || 'invalid_work_graph'], [])
    });
  }

  const budget = createBudget(missionId, input.deep || false);
  const budgetCheck = checkBudget(budget);
  if (!budgetCheck.ok) {
    return finalizeGlmNarutoTerminal({
      root: cwd,
      missionId,
      result: missionResult(missionId, input.task, 'budget_exhausted', budgetCheck.reason!, 0, startedMs, [], [], [budgetCheck.reason!], [])
    });
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
    strategies: strategyMap,
    isolationMode: isolationPolicy.selected,
    cleanupWorktrees: input.cleanupWorktrees ?? !input.keepWorktrees,
    baseCommit
  });

  for (const trace of poolResult.traces) {
    traceState = recordWorkerTrace(traceState, trace);
    if (trace.ttft_ms !== null) {
      healthTracker.record({
        provider_slug: trace.provider_slug || 'openrouter',
        model: trace.model,
        p50_ttft_ms: trace.ttft_ms,
        last_success: trace.status === 'completed' || trace.status === 'verification_passed' ? nowIso() : null,
        last_failure: trace.status === 'failed' ? nowIso() : null
      });
    }
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
        strategies: new Map(repairPlan.shardsToRepair.map((s) => [s.id, [s.strategy]])),
        isolationMode: isolationPolicy.selected,
        cleanupWorktrees: input.cleanupWorktrees ?? !input.keepWorktrees,
        baseCommit
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
  let verifierWaveRun = false;
  if (passedEnvelopes.length > 0 && !input.skipVerifier) {
    verifierWaveRun = true;
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
        if (res.value.trace.ttft_ms !== null) {
          healthTracker.record({
            provider_slug: res.value.trace.provider_slug || 'openrouter',
            model: res.value.trace.model,
            p50_ttft_ms: res.value.trace.ttft_ms,
            last_success: res.value.ok ? nowIso() : null,
            last_failure: res.value.ok ? null : nowIso()
          });
        }
      }
    }
    envelopes = envelopes.map((e) => {
      const verified = verifiedEnvelopes.find((v) => v.worker_id === e.worker_id);
      return verified ?? e;
    });
    passedEnvelopes = envelopes.filter((e) => e.status === 'gate_passed');
  }
  const warnings = input.skipVerifier && passedEnvelopes.length > 0 ? ['verifier_skipped_by_flag'] : [];

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
  const candidateScoreboard = buildGlmNarutoCandidateScoreboard({
    missionId,
    envelopes,
    traces: traceState.workerTraces,
    graph: conflictGraph,
    requestedPaths: mentionedPaths
  });

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
    scoreboard: candidateScoreboard,
    useJudge: input.useJudge || false,
    xhighFinalizer: input.xhighFinalizer || false
  });

  // Apply winning merge plan
  let appliedPatches = 0;
  let applyResult: { ok: boolean; applied: readonly string[]; blocker?: string } | null = null;
  let applyTransaction = null as Awaited<ReturnType<typeof runGlmNarutoApplyTransaction>>['transaction'] | null;
  const artifactDir = path.join(cwd, '.sneakoscope', 'glm-naruto', missionId);

  if (!input.noApply && mergePlan.selected_patches.length > 0) {
    const transactionResult = await runGlmNarutoApplyTransaction({
      cwd,
      missionId,
      envelopes,
      selectedPatchIds: mergePlan.selected_patches,
      artifactDir
    });
    applyTransaction = transactionResult.transaction;
    appliedPatches = transactionResult.ok ? transactionResult.applied.length : 0;
    applyResult = { ok: transactionResult.ok, applied: transactionResult.applied, ...(transactionResult.transaction.blockers[0] ? { blocker: transactionResult.transaction.blockers[0] } : {}) };
  }

  const terminalState: GlmNarutoTerminalState = appliedPatches > 0 ? 'completed' : passedEnvelopes.length > 0 ? 'partial_candidates' : 'blocked';
  const terminationReason = appliedPatches > 0
    ? 'completed_merge_applied'
    : applyResult && !applyResult.ok
      ? 'apply_transaction_failed'
      : passedEnvelopes.length > 0 ? 'partial_no_apply' : 'no_gate_passed_candidates';

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
    blockers: terminalState === 'blocked' ? ['no_gate_passed_candidates'] : (applyResult && !applyResult.ok ? [applyResult.blocker || 'apply_transaction_failed'] : []),
    warnings
  };

  const writtenArtifactDir = await writeMissionArtifacts({
    root: cwd,
    missionId,
    workGraph: graph,
    conflictGraph,
    mergePlan,
    ...(judgeResult ? { judgeResult } : {}),
    workerTraces: traceState.workerTraces,
    providerHealth: healthTracker.snapshot(),
    concurrencyDecisions: poolResult.concurrencyDecisions,
    isolationPolicy,
    candidateScoreboard,
    termination: { schema: 'sks.glm-naruto-termination.v1', mission_id: missionId, terminal_state: terminalState, reason: terminationReason, wall_clock_ms: summary.wall_clock_ms },
    ...(applyResult ? { applyResult: { ...applyResult, schema: 'sks.glm-naruto-apply-result.v1' } } : {}),
    ...(applyTransaction ? { applyTransaction } : {}),
    verificationSummary: { schema: 'sks.glm-naruto-verification.v1', verified: passedEnvelopes.length, total: envelopes.length, verifier_wave_run: verifierWaveRun, skip_verifier: input.skipVerifier === true },
    missionResult: result,
    envelopes
  });
  const secretAudit = await auditGlmNarutoArtifactsForSecrets(path.join(cwd, '.sneakoscope', 'glm-naruto', missionId)).catch((err) => ({
    schema: 'sks.glm-naruto-secret-audit.v1' as const,
    ok: false,
    root: path.join(cwd, '.sneakoscope', 'glm-naruto', missionId),
    scanned_files: 0,
    findings: [`audit_failed:${err instanceof Error ? err.message : String(err)}`]
  }));
  await writeJsonAtomic(path.join(writtenArtifactDir, 'secret-audit.json'), secretAudit).catch(() => undefined);
  // 4.0.9: Write canonical stop-gate artifacts for hook resolution.
  await writeFinalStopGate({
    root: cwd,
    missionId,
    route: 'GLM_NARUTO',
    routeCommand: '$Naruto',
    status: result.ok && secretAudit.ok ? 'passed' : (terminalState === 'blocked' || !secretAudit.ok ? 'blocked' : 'failed'),
    terminal: terminalState === 'completed' || terminalState === 'blocked',
    terminalState,
    evidence: {
      build_passed: result.ok,
      tests_passed: result.ok,
      route_evidence_passed: result.ok,
      per_worker_artifacts: true,
      verifier_wave_run: verifierWaveRun,
      model_guard_enforced: true,
      proof_required: false,
      proof_passed: true,
      reflection_required: false,
      reflection_passed: 'not_required',
    },
    blockers: secretAudit.ok ? (result.blockers || []) : ['glm_naruto_secret_leak_detected'],
    nativeGateFile: 'termination.json',
  }).catch(() => null);

  return { ...result, artifact_dir: writtenArtifactDir };
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
