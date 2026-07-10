import path from 'node:path';
import { printJson } from '../../cli/output.js';
import { createMission, findLatestMission, setCurrent } from '../mission.js';
import { readJson, sksRoot } from '../fsx.js';
import { loopActiveWorkerHandlesPath, loopIntegrationMergePath, loopLatestCheckpointPath, loopPlanPath, loopProofPath, loopRoot, loopSideEffectReportPath } from '../loops/loop-artifacts.js';
import { finalizeLoopGraph } from '../loops/loop-finalizer.js';
import { readLoopGraphProof } from '../loops/loop-observability.js';
import { planLoopsFromRequest } from '../loops/loop-planner.js';
import { renderLoopProofSummary } from '../loops/loop-proof-summary.js';
import { runLoopNode, runLoopPlan } from '../loops/loop-runtime.js';
import { scheduleLoopGraph } from '../loops/loop-scheduler.js';
import { writeLoopKillRequest } from '../loops/loop-runtime-control.js';
import type { SksLoopPlan, SksLoopProof } from '../loops/loop-schema.js';
import { flag, promptOf, readFlagValue } from './command-utils.js';
import { runCodexInitDeep } from '../codex-app/codex-init-deep.js';

export async function loopCommand(subcommand: string = 'help', args: string[] = []): Promise<void> {
  const action = subcommand || 'help';
  if (action === 'plan') return loopPlan(args);
  if (action === 'run') return loopRun(args);
  if (action === 'status') return loopStatus(args);
  if (action === 'proof') return loopProof(args);
  if (action === 'kill') return loopKill(args);
  if (action === 'resume') return loopResume(args);
  if (action === 'graph') return loopGraph(args);
  if (action === 'init-deep') return loopInitDeep(args);
  console.log(`SKS Loop

Usage:
  sks loop plan "<request>" [--json]
  sks loop run latest [--parallelism safe|balanced|extreme] [--json]
  sks loop status latest [--json]
  sks loop proof latest [--json]
  sks loop kill <loop-id|all>
  sks loop resume latest [--rerun-completed]
  sks loop graph latest
  sks loop init-deep [--json]
`);
}

async function loopInitDeep(args: string[]): Promise<void> {
  const root = await sksRoot();
  const result = await runCodexInitDeep({ root, apply: !flag(args, '--check-only') && !flag(args, '--dry-run') });
  if (flag(args, '--json')) return printJson(result);
  console.log(`Loop init-deep: ${result.ok ? 'ok' : 'blocked'} ${result.generated_path || ''}`);
}

async function loopPlan(args: string[]): Promise<void> {
  const root = await sksRoot();
  const request = promptOf(args);
  if (!request) throw new Error('Usage: sks loop plan "<request>" [--json]');
  const { id } = await createMission(root, { mode: 'loop', prompt: request });
  const plan = await planLoopsFromRequest({ root, missionId: id, request, sourceCommand: 'loop' });
  await setCurrent(root, { mission_id: id, mode: 'LOOP', route: 'Loop', route_command: '$Loop', phase: 'LOOP_PLANNED', stop_gate: 'loop-graph-proof.json' }, { replace: true });
  if (flag(args, '--json')) return printJson({ schema: 'sks.loop-plan-command.v1', ok: plan.blockers.length === 0, mission_id: id, plan });
  console.log(`Loop plan: ${id}`);
  console.log('Loops:');
  for (const node of plan.graph.nodes) {
    const owner = [...node.owner_scope.files, ...node.owner_scope.directories][0] || 'integration';
    console.log(`  ${node.loop_id.padEnd(18)} ${node.level.padEnd(12)} owner ${owner.padEnd(28)} gates ${[...node.gates.triage, ...node.gates.local, ...node.gates.checker, ...node.gates.integration, ...node.gates.final].length}`);
  }
}

async function loopRun(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('No loop plan exists. Run: sks loop plan "<request>"');
  const plan = await readJson<SksLoopPlan>(loopPlanPath(root, missionId));
  if (plan.blockers.length) {
    console.log(`Loop plan blocked: ${plan.blockers.join(', ')}`);
    return;
  }
  const parallelism = normalizeParallelism(readFlagValue(args, '--parallelism', 'safe'));
  const result = await runLoopPlan({ root, plan, parallelism });
  await setCurrent(root, { mission_id: missionId, mode: 'LOOP', route: 'Loop', route_command: '$Loop', phase: result.ok ? 'LOOP_COMPLETED' : 'LOOP_BLOCKED', stop_gate: 'loop-graph-proof.json' });
  if (flag(args, '--json')) return printJson({ schema: 'sks.loop-run-command.v1', ...result });
  console.log(renderLoopProofSummary(result.graph_proof));
}

async function loopStatus(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('Usage: sks loop status <mission-id|latest>');
  const plan = await readJson<SksLoopPlan | null>(loopPlanPath(root, missionId), null);
  const proof = await readLoopGraphProof(root, missionId);
  const states = await Promise.all((plan?.graph.nodes || []).map((node) => readJson(path.join(loopRoot(root, missionId), node.loop_id, 'loop-state.json'), null)));
  const proofs = await Promise.all((plan?.graph.nodes || []).map((node) => readJson<SksLoopProof | null>(loopProofPath(root, missionId, node.loop_id), null)));
  const checkpoints = await Promise.all((plan?.graph.nodes || []).map((node) => readJson(loopLatestCheckpointPath(root, missionId, node.loop_id), null)));
  const activeWorkerHandles = await readJsonl(loopActiveWorkerHandlesPath(root, missionId));
  const merge = await readJson(loopIntegrationMergePath(root, missionId), null);
  const sideEffects = await readJson(loopSideEffectReportPath(root, missionId), null);
  const result = { schema: 'sks.loop-status-command.v1', mission_id: missionId, plan_ok: Boolean(plan && plan.blockers.length === 0), graph: proof, states, proofs, checkpoints, active_worker_handles: activeWorkerHandles, merge, side_effects: sideEffects };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Loop status: ${missionId}`);
  for (const state of states.filter(Boolean) as Array<Record<string, unknown>>) {
    const loopId = String(state.loop_id);
    const nodeProof = proofs.find((row) => row?.loop_id === loopId);
    const checkpoint = checkpoints.find((row: any) => row?.loop_id === loopId) as any;
    const backend = nodeProof?.maker_result?.backend || 'blocked';
    const gates = nodeProof?.gate_result ? `${nodeProof.gate_result.passed_gates.length}/${nodeProof.gate_result.selected_gates.length}` : '-';
    const worktree = nodeProof?.worktree?.id || (state.acting_on as any)?.worktree_id || '-';
    const resumable = checkpoint?.resumable ? `resumable:${checkpoint.phase}` : 'resumable:-';
    const active = activeWorkerHandles.filter((row: any) => row.loop_id === loopId && row.status === 'running').length;
    const mergeStatus = merge?.merge_attempts?.[loopId]?.selected_strategy || '-';
    console.log(`  ${loopId.padEnd(18)} ${String(state.status).padEnd(10)} backend ${String(backend).padEnd(24)} workers ${String(active).padEnd(2)} gates ${gates.padEnd(5)} worktree ${String(worktree).padEnd(18)} merge ${String(mergeStatus).padEnd(14)} ${resumable}`);
  }
  if (merge) console.log(`Merge: ${merge.ok ? 'passed' : 'blocked'} strategy=${JSON.stringify(merge.strategy_summary || {})}`);
  if (sideEffects) console.log(`Side effects: ${sideEffects.ok ? 'passed' : 'blocked'} blockers=${sideEffects.blockers?.length || 0}`);
  if (proof?.gpt_final_arbiter) console.log(`Final arbiter: ${proof.gpt_final_arbiter.verdict || 'unknown'} handled_by=${proof.gpt_final_arbiter.handled_by || 'loop-finalizer'}`);
}

async function loopProof(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('Usage: sks loop proof <mission-id|latest>');
  const proof = await readLoopGraphProof(root, missionId);
  if (!proof) throw new Error(`Loop graph proof missing: ${missionId}`);
  if (flag(args, '--json')) return printJson(proof);
  console.log(renderLoopProofSummary(proof));
  if (proof.integration_merge) console.log(`Merge: ${proof.integration_merge.ok ? 'passed' : 'blocked'} ${JSON.stringify(proof.integration_merge.strategy_summary || {})}`);
  if (proof.side_effect_report) console.log(`Side effects: ${proof.side_effect_report.ok ? 'passed' : 'blocked'} ${proof.side_effect_report.blockers?.join(', ') || 'none'}`);
  if (proof.gpt_final_arbiter) console.log(`Final arbiter: ${proof.gpt_final_arbiter.verdict || 'unknown'} contract=${proof.gpt_final_arbiter.gate_contract_path || 'missing'}`);
}

async function loopGraph(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('Usage: sks loop graph <mission-id|latest>');
  const plan = await readJson<SksLoopPlan>(loopPlanPath(root, missionId));
  printJson({ schema: 'sks.loop-graph-command.v1', mission_id: missionId, graph: plan.graph });
}

async function loopKill(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await findLatestMission(root);
  const target = args[0];
  if (!missionId || !target) throw new Error('Usage: sks loop kill <loop-id|all>');
  await writeLoopKillRequest(root, missionId, target);
  console.log(`Loop kill requested: ${target}`);
}

async function loopResume(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('Usage: sks loop resume <mission-id|latest> [--rerun-completed]');
  const plan = await readJson<SksLoopPlan>(loopPlanPath(root, missionId));
  const rerunCompleted = flag(args, '--rerun-completed');
  const existingProofs = await Promise.all(plan.graph.nodes.map((node) => readJson<SksLoopProof | null>(loopProofPath(root, missionId, node.loop_id), null)));
  const completed = new Set(existingProofs.filter((proof): proof is SksLoopProof => proof !== null && proof.status === 'completed').map((proof) => proof.loop_id));
  const runnable = rerunCompleted ? plan.graph.nodes : plan.graph.nodes.filter((node) => !completed.has(node.loop_id));
  const schedule = scheduleLoopGraph(runnable, normalizeParallelism(readFlagValue(args, '--parallelism', 'safe')));
  const started = Date.now();
  const resumedProofs: SksLoopProof[] = [];
  for (const batch of schedule.batches) {
    const batchProofs = await Promise.all(batch.map((node) => runLoopNode({ root, plan, node })));
    resumedProofs.push(...batchProofs);
  }
  const mergedProofs = [
    ...existingProofs.filter((proof): proof is SksLoopProof => proof !== null && proof.status === 'completed' && !rerunCompleted),
    ...resumedProofs
  ];
  const graphProof = await finalizeLoopGraph({
    root,
    plan,
    proofs: mergedProofs,
    maxActiveLoops: schedule.max_active_loops,
    maxActiveWorkers: Math.max(1, mergedProofs.reduce((sum, proof) => sum + proof.maker_result.worker_count + proof.checker_result.worker_count, 0)),
    wallMs: Math.max(1, Date.now() - started)
  });
  await setCurrent(root, { mission_id: missionId, mode: 'LOOP', route: 'Loop', route_command: '$Loop', phase: graphProof.ok ? 'LOOP_COMPLETED' : 'LOOP_BLOCKED', stop_gate: 'loop-graph-proof.json' });
  if (flag(args, '--json')) return printJson({ schema: 'sks.loop-resume-command.v1', ok: graphProof.ok, mission_id: missionId, resumed_loops: resumedProofs.map((proof) => proof.loop_id), skipped_completed: [...completed], graph_proof: graphProof });
  console.log(renderLoopProofSummary(graphProof));
}

async function resolveLoopMission(root: string, arg?: string): Promise<string | null> {
  if (arg && arg !== 'latest') return arg;
  return findLatestMission(root, { mode: 'loop' });
}

function normalizeParallelism(value: unknown): 'safe' | 'balanced' | 'extreme' {
  return value === 'safe' || value === 'extreme' ? value : 'balanced';
}

async function readJsonl(file: string): Promise<any[]> {
  const text = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8')).catch(() => '');
  return String(text).split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
