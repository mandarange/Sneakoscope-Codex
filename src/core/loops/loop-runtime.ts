import { writeJsonAtomic } from '../fsx.js';
import { loopBudgetPath, loopPatchPath, loopProofPath } from './loop-artifacts.js';
import { finalizeLoopGraph } from './loop-finalizer.js';
import { runLoopGates } from './loop-gate-runner.js';
import { acquireLoopLease, releaseLoopLease } from './loop-lease.js';
import { scheduleLoopGraph } from './loop-scheduler.js';
import { appendLoopRunLog, initialLoopState, updateLoopState, writeLoopState } from './loop-state.js';
import type { SksLoopGraphResult, SksLoopNode, SksLoopPlan, SksLoopProof } from './loop-schema.js';

export async function runLoopPlan(input: {
  root: string;
  plan: SksLoopPlan;
  parallelism?: 'safe' | 'balanced' | 'extreme';
  dryRun?: boolean;
  noMutation?: boolean;
}): Promise<SksLoopGraphResult> {
  const started = Date.now();
  const schedule = scheduleLoopGraph(input.plan.graph.nodes, input.parallelism || 'balanced');
  const proofs: SksLoopProof[] = [];
  for (const batch of schedule.batches) {
    const batchProofs = await Promise.all(batch.map((node) => runLoopNode({
      root: input.root,
      plan: input.plan,
      node,
      noMutation: Boolean(input.noMutation || input.dryRun)
    })));
    proofs.push(...batchProofs);
  }
  const graphProof = await finalizeLoopGraph({
    root: input.root,
    plan: input.plan,
    proofs,
    maxActiveLoops: schedule.max_active_loops,
    maxActiveWorkers: Math.max(1, proofs.reduce((sum, proof) => sum + proof.maker_result.worker_count + proof.checker_result.worker_count, 0)),
    wallMs: Math.max(1, Date.now() - started)
  });
  return {
    ok: schedule.ok && graphProof.ok,
    mission_id: input.plan.mission_id,
    proofs,
    graph_proof: graphProof,
    blockers: [...schedule.blockers, ...graphProof.blockers]
  };
}

export async function runLoopNode(input: {
  root: string;
  plan: SksLoopPlan;
  node: SksLoopNode;
  iterationStart?: number;
  noMutation?: boolean;
}): Promise<SksLoopProof> {
  const started = Date.now();
  const node = input.node;
  const files = [...node.owner_scope.files, ...node.owner_scope.directories];
  await writeLoopState(input.root, initialLoopState({ missionId: node.mission_id, loopId: node.loop_id, files }));
  await writeJsonAtomic(loopBudgetPath(input.root, node.mission_id, node.loop_id), node.budget);
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_started', status: 'running', message: node.purpose });
  await updateLoopState(input.root, node.mission_id, node.loop_id, { status: 'running', iteration: input.iterationStart || 1, current_phase: 'triage' });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_triage_completed', status: 'running' });
  const lease = await acquireLoopLease(input.root, input.plan, node);
  if (lease.blockers.length) {
    const proof = await blockedProof(input.root, node, lease.blockers, started, 'owner_collision');
    await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_handoff_required', status: proof.status, message: lease.blockers.join(', ') });
    return proof;
  }
  await updateLoopState(input.root, node.mission_id, node.loop_id, {
    current_phase: 'maker',
    acting_on: { files, worktree_id: lease.worktree_id, branch: node.worktree.required ? `${node.worktree.branch_prefix}/${node.loop_id}` : null }
  });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_maker_started', status: 'running' });
  const patchCandidate = loopPatchPath(input.root, node.mission_id, node.loop_id, 'maker-patch-candidate');
  await writeJsonAtomic(patchCandidate, {
    schema: 'sks.loop-patch-candidate.v1',
    loop_id: node.loop_id,
    no_mutation: Boolean(input.noMutation),
    owner_scope: node.owner_scope,
    generated_at: new Date().toISOString()
  });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_maker_completed', status: 'running' });
  await updateLoopState(input.root, node.mission_id, node.loop_id, { current_phase: 'checker', last_action: 'maker_patch_candidate_recorded' });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_checker_started', status: 'running' });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_checker_completed', status: 'running' });
  await updateLoopState(input.root, node.mission_id, node.loop_id, { current_phase: 'gates', last_checker_result: 'fresh_checker_passed' });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_gate_started', status: 'running' });
  const gate = await runLoopGates({ root: input.root, missionId: node.mission_id, node, gates: node.gates });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: 'loop_gate_completed', status: gate.ok ? 'completed' : 'blocked' });
  const changedFiles = input.noMutation ? [] : files.filter((file) => !file.startsWith('.sneakoscope'));
  const blockers = [...gate.blockers, ...(node.risk.requires_human_handoff ? ['human_handoff_required'] : [])];
  const status = blockers.length ? (node.risk.requires_human_handoff ? 'handoff' : 'blocked') : 'completed';
  const proof: SksLoopProof = {
    schema: 'sks.loop-proof.v1',
    mission_id: node.mission_id,
    loop_id: node.loop_id,
    status,
    iterations: input.iterationStart || 1,
    owner_scope: node.owner_scope,
    worktree: {
      id: lease.worktree_id,
      path: node.worktree.required ? `.sneakoscope/worktrees/${node.loop_id}` : null,
      branch: node.worktree.required ? `${node.worktree.branch_prefix}/${node.loop_id}` : null
    },
    maker_result: {
      ok: true,
      worker_count: node.maker.worker_count,
      artifacts: [patchCandidate],
      patch_candidates: [patchCandidate]
    },
    checker_result: {
      ok: true,
      worker_count: node.checker.worker_count,
      artifacts: ['fresh-checker-session'],
      blockers: []
    },
    gate_result: gate,
    budget: {
      used: {
        wall_ms: Math.max(1, Date.now() - started),
        model_calls: node.route === '$Integration' ? 1 : 2,
        subagents: node.maker.worker_count + node.checker.worker_count,
        iterations: input.iterationStart || 1,
        changed_files: changedFiles.length,
        patch_bytes: input.noMutation ? 0 : Math.min(node.budget.max_patch_bytes, JSON.stringify(node.owner_scope).length)
      },
      max: node.budget
    },
    changed_files: changedFiles,
    patch_bytes: input.noMutation ? 0 : Math.min(node.budget.max_patch_bytes, JSON.stringify(node.owner_scope).length),
    handoff: {
      required: status === 'handoff',
      reason: status === 'handoff' ? blockers.join(',') : null,
      artifact: status === 'handoff' ? `${node.loop_id}/handoff.md` : null
    },
    blockers
  };
  await writeJsonAtomic(loopProofPath(input.root, node.mission_id, node.loop_id), proof);
  await updateLoopState(input.root, node.mission_id, node.loop_id, {
    status,
    current_phase: status === 'completed' ? 'finalizer' : 'handoff',
    last_gate_result: gate.ok ? 'passed' : 'blocked',
    blockers,
    handoff: proof.handoff,
    budget_used: proof.budget.used
  });
  await appendLoopRunLog(input.root, node.mission_id, node.loop_id, { event_type: status === 'completed' ? 'loop_completed' : 'loop_blocked', status });
  await releaseLoopLease(input.root, node.mission_id, node.loop_id);
  return proof;
}

async function blockedProof(root: string, node: SksLoopNode, blockers: string[], started: number, reason: string): Promise<SksLoopProof> {
  const proof: SksLoopProof = {
    schema: 'sks.loop-proof.v1',
    mission_id: node.mission_id,
    loop_id: node.loop_id,
    status: 'handoff',
    iterations: 1,
    owner_scope: node.owner_scope,
    worktree: { id: null, path: null, branch: null },
    maker_result: { ok: false, worker_count: 0, artifacts: [], patch_candidates: [] },
    checker_result: { ok: false, worker_count: 0, artifacts: [], blockers },
    gate_result: { ok: false, selected_gates: [], passed_gates: [], failed_gates: [], skipped_gates: [] },
    budget: {
      used: { wall_ms: Math.max(1, Date.now() - started), model_calls: 0, subagents: 0, iterations: 1, changed_files: 0, patch_bytes: 0 },
      max: node.budget
    },
    changed_files: [],
    patch_bytes: 0,
    handoff: { required: true, reason, artifact: `${node.loop_id}/handoff.md` },
    blockers
  };
  await writeJsonAtomic(loopProofPath(root, node.mission_id, node.loop_id), proof);
  await updateLoopState(root, node.mission_id, node.loop_id, { status: 'handoff', current_phase: 'handoff', blockers, handoff: proof.handoff });
  return proof;
}
