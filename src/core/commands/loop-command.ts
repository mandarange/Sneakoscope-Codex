import path from 'node:path';
import { printJson } from '../../cli/output.js';
import { createMission, findLatestMission, loadMission, setCurrent } from '../mission.js';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { loopGraphProofPath, loopPlanPath, loopRoot } from '../loops/loop-artifacts.js';
import { readLoopGraphProof } from '../loops/loop-observability.js';
import { planLoopsFromRequest } from '../loops/loop-planner.js';
import { renderLoopProofSummary } from '../loops/loop-proof-summary.js';
import { runLoopPlan } from '../loops/loop-runtime.js';
import type { SksLoopPlan } from '../loops/loop-schema.js';
import { flag, promptOf, readFlagValue } from './command-utils.js';

export async function loopCommand(subcommand: string = 'help', args: string[] = []): Promise<void> {
  const action = subcommand || 'help';
  if (action === 'plan') return loopPlan(args);
  if (action === 'run') return loopRun(args);
  if (action === 'status') return loopStatus(args);
  if (action === 'proof') return loopProof(args);
  if (action === 'kill') return loopKill(args);
  if (action === 'resume') return loopRun(args);
  if (action === 'graph') return loopGraph(args);
  console.log(`SKS Loop

Usage:
  sks loop plan "<request>" [--json]
  sks loop run latest [--parallelism safe|balanced|extreme] [--json]
  sks loop status latest [--json]
  sks loop proof latest [--json]
  sks loop kill <loop-id|all>
  sks loop resume latest
  sks loop graph latest
`);
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
  const parallelism = normalizeParallelism(readFlagValue(args, '--parallelism', 'balanced'));
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
  const result = { schema: 'sks.loop-status-command.v1', mission_id: missionId, plan_ok: Boolean(plan && plan.blockers.length === 0), graph: proof, states };
  if (flag(args, '--json')) return printJson(result);
  console.log(`Loop status: ${missionId}`);
  for (const state of states.filter(Boolean) as Array<Record<string, unknown>>) {
    console.log(`  ${String(state.loop_id).padEnd(18)} ${String(state.status).padEnd(10)} iter ${state.iteration} owner ${(Array.isArray((state.acting_on as any)?.files) ? (state.acting_on as any).files.join(', ') : '-')}`);
  }
}

async function loopProof(args: string[]): Promise<void> {
  const root = await sksRoot();
  const missionId = await resolveLoopMission(root, args[0]);
  if (!missionId) throw new Error('Usage: sks loop proof <mission-id|latest>');
  const proof = await readLoopGraphProof(root, missionId);
  if (!proof) throw new Error(`Loop graph proof missing: ${missionId}`);
  if (flag(args, '--json')) return printJson(proof);
  console.log(renderLoopProofSummary(proof));
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
  await writeJsonAtomic(path.join(loopRoot(root, missionId), 'kill-request.json'), {
    schema: 'sks.loop-kill-request.v1',
    mission_id: missionId,
    target,
    requested_at: new Date().toISOString()
  });
  console.log(`Loop kill requested: ${target}`);
}

async function resolveLoopMission(root: string, arg?: string): Promise<string | null> {
  if (arg && arg !== 'latest') return arg;
  const latest = await findLatestMission(root);
  if (!latest) return null;
  const loaded = await loadMission(root, latest).catch(() => null);
  return loaded?.mission?.mode === 'loop' || await readJson(loopPlanPath(root, latest), null) ? latest : null;
}

function normalizeParallelism(value: unknown): 'safe' | 'balanced' | 'extreme' {
  return value === 'safe' || value === 'extreme' ? value : 'balanced';
}
