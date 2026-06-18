import type { GlmNarutoShard, GlmNarutoPatchEnvelope, GlmNarutoWorkerTrace, GlmNarutoPatchStrategy } from './glm-naruto-types.js';
import { runPatchWorker, type WorkerRunResult } from './glm-naruto-worker-runtime.js';
import { decideConcurrency } from './glm-naruto-concurrency-governor.js';
import { planFileLeases } from './glm-naruto-file-lease.js';
import type { GlmNarutoConcurrencyDecision } from './glm-naruto-types.js';
import { evaluateGlmNarutoPatchCandidateGate } from './glm-naruto-patch-candidate-gate.js';
import { createPatchEnvelope } from './glm-naruto-patch-envelope.js';
import { writeGlmNarutoWorkerArtifacts } from './glm-naruto-worker-artifacts.js';
import { materializePatchViaWorktree } from './glm-naruto-worktree-worker.js';
import type { GlmNarutoIsolationMode } from './glm-naruto-isolation-policy.js';

export interface WorkerPoolInput {
  readonly apiKey: string;
  readonly missionId: string;
  readonly cwd: string;
  readonly shards: readonly GlmNarutoShard[];
  readonly contextSummary: string;
  readonly maxWorkers: number;
  readonly workerTimeoutMs: number;
  readonly strategies: ReadonlyMap<string, readonly GlmNarutoPatchStrategy[]>;
  readonly isolationMode?: GlmNarutoIsolationMode;
  readonly cleanupWorktrees?: boolean;
  readonly baseCommit?: string | null;
}

export interface WorkerPoolResult {
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly traces: readonly GlmNarutoWorkerTrace[];
  readonly failedShardIds: readonly string[];
  readonly concurrencyDecisions: readonly GlmNarutoConcurrencyDecision[];
}

export async function runPatchWorkerPool(input: WorkerPoolInput): Promise<WorkerPoolResult> {
  const envelopes: GlmNarutoPatchEnvelope[] = [];
  const traces: GlmNarutoWorkerTrace[] = [];
  const failedShardIds: string[] = [];
  const concurrencyDecisions: GlmNarutoConcurrencyDecision[] = [];

  const shardPathMap = new Map<string, readonly string[]>();
  for (const shard of input.shards) {
    shardPathMap.set(shard.id, shard.target_paths);
  }
  const leases = planFileLeases(shardPathMap);

  const mutableShards = input.shards.filter((s) => s.mutable);
  const decision = decideConcurrency({
    requestedClones: input.maxWorkers,
    activeWorkers: Math.min(input.maxWorkers, mutableShards.length),
    rateLimited429: 0,
    ttftP90Ms: 0,
    failureRate: 0,
    operatorMax: input.maxWorkers
  });
  concurrencyDecisions.push(decision);

  const workerTasks: Promise<WorkerRunResult>[] = [];
  let workerIdx = 0;

  for (const shard of mutableShards) {
    const strategies = input.strategies.get(shard.id) || [shard.strategy];
    for (const strategy of strategies) {
      const workerId = `worker-${shard.id}-${strategy}-${workerIdx++}`;
      const shardWithStrategy: GlmNarutoShard = { ...shard, strategy };
      workerTasks.push(runPatchWorker({
        apiKey: input.apiKey,
        missionId: input.missionId,
        workerId,
        root: input.cwd,
        shard: shardWithStrategy,
        contextSummary: input.contextSummary,
        timeoutMs: input.workerTimeoutMs
      }));
    }
  }

  const results = await Promise.allSettled(workerTasks);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.ok && result.value.envelope) {
      const isolationMode = input.isolationMode ?? 'patch-envelope-only';
      let candidateEnvelope = result.value.envelope;
      let worktreeRecord: Record<string, unknown> | undefined;
      if (isolationMode === 'git-worktree') {
        const worktree = await materializePatchViaWorktree({
          repoRoot: input.cwd,
          missionId: input.missionId,
          envelope: candidateEnvelope,
          ...(input.baseCommit !== undefined ? { baseCommit: input.baseCommit } : {}),
          cleanup: input.cleanupWorktrees !== false
        });
        candidateEnvelope = worktree.envelope;
        worktreeRecord = {
          schema: 'sks.glm-naruto-worker-worktree.v1',
          selected: 'git-worktree',
          ok: worktree.ok,
          worktree_path: worktree.lease?.path ?? null,
          branch: worktree.lease?.branch ?? null,
          base_commit: worktree.lease?.base_commit ?? input.baseCommit ?? null,
          blockers: worktree.blockers
        };
        if (!worktree.ok) {
          await writeGlmNarutoWorkerArtifacts({
            root: input.cwd,
            missionId: input.missionId,
            workerId: candidateEnvelope.worker_id,
            shardId: candidateEnvelope.shard_id,
            patchEnvelope: candidateEnvelope,
            streamTrace: result.value.trace,
            isolation: {
              schema: 'sks.glm-naruto-worker-isolation.v1',
              selected: isolationMode,
              workers_write_main_workspace: false
            },
            worktree: worktreeRecord,
            termination: { status: candidateEnvelope.status, ok: false, blockers: candidateEnvelope.blockers }
          }).catch(() => undefined);
          envelopes.push(candidateEnvelope);
          traces.push(result.value.trace);
          failedShardIds.push(candidateEnvelope.shard_id);
          continue;
        }
      }
      const gate = await evaluateGlmNarutoPatchCandidateGate({
        cwd: input.cwd,
        envelope: candidateEnvelope,
        apply: false
      });
      let envelope = candidateEnvelope;
      if (gate.ok) {
        envelope = createPatchEnvelope({
          missionId: envelope.mission_id,
          workerId: envelope.worker_id,
          shardId: envelope.shard_id,
          baseDigest: envelope.base_digest,
          patch: gate.extracted_patch,
          strategy: envelope.strategy,
          reasoningEffort: envelope.reasoning_effort,
          status: 'gate_passed',
          warnings: envelope.warnings
        });
      } else {
        envelope = {
          ...envelope,
          status: 'gate_failed',
          blockers: gate.blockers
        };
      }
      await writeGlmNarutoWorkerArtifacts({
        root: input.cwd,
        missionId: input.missionId,
        workerId: envelope.worker_id,
        shardId: envelope.shard_id,
        patchEnvelope: envelope,
        gateResult: gate,
        streamTrace: result.value.trace,
        isolation: {
          schema: 'sks.glm-naruto-worker-isolation.v1',
          selected: isolationMode,
          workers_write_main_workspace: false
        },
        ...(worktreeRecord ? { worktree: worktreeRecord } : {}),
        termination: { status: envelope.status, ok: gate.ok, blockers: envelope.blockers }
      }).catch(() => undefined);
      envelopes.push(envelope);
      traces.push(result.value.trace);
    } else if (result.status === 'fulfilled') {
      traces.push(result.value.trace);
      failedShardIds.push(result.value.trace.shard_id);
    } else {
      // rejected promise
      failedShardIds.push('unknown');
    }
  }

  return { envelopes, traces, failedShardIds, concurrencyDecisions };
}
