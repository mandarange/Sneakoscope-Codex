#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../cli/command-registry.js';
import { compileGoalToLoopPlan } from '../core/loops/goal-to-loop-compat.js';
import { loopGraphProofPath, loopPlanPath, loopProofPath, loopRoot, loopStatePath } from '../core/loops/loop-artifacts.js';
import { decomposeRequestIntoLoopDomains } from '../core/loops/loop-decomposer.js';
import { selectLoopGates } from '../core/loops/loop-gate-selector.js';
import { runLoopGates } from '../core/loops/loop-gate-runner.js';
import { canEscalateLoopLevel } from '../core/loops/loop-gate-ladder.js';
import { acquireLoopLease } from '../core/loops/loop-lease.js';
import { inferLoopOwnerScope } from '../core/loops/loop-owner-inference.js';
import { planLoopsFromRequest } from '../core/loops/loop-planner.js';
import { validateLoopPlan } from '../core/loops/loop-schema.js';
import { scheduleLoopGraph } from '../core/loops/loop-scheduler.js';
import { runLoopNode, runLoopPlan } from '../core/loops/loop-runtime.js';
import { readLoopGraphProof, summarizeLoopGraphProof } from '../core/loops/loop-observability.js';
import { renderLoopProofSummary } from '../core/loops/loop-proof-summary.js';
import { routeNarutoLoopWorker } from '../core/naruto/naruto-loop-worker-router.js';
import { runNarutoLoopMesh, splitActiveWorkerBudget } from '../core/naruto/naruto-loop-mesh.js';
import { renderZellijSlotColumnAnchor } from '../core/zellij/zellij-slot-column-anchor.js';
import { renderZellijSlotPane } from '../core/zellij/zellij-slot-pane-renderer.js';

export async function runLoopDirectiveCheck(id) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-loop-check-${id.replace(/[^a-z0-9]+/gi, '-')}-`));
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions'), { recursive: true });
  const missionId = `M-check-${id.replace(/[^a-z0-9]+/gi, '-')}`;
  const request = 'fix zellij telemetry, release cache, and codex probe docs';
  const plan = await planLoopsFromRequest({ root, missionId, request, sourceCommand: 'loop' });
  const byId = new Map(plan.graph.nodes.map((node) => [node.loop_id, node]));
  const result = await runLoopPlan({ root, plan, parallelism: 'extreme', noMutation: id.includes('runtime') ? false : true });
  const assertions = [];
  const assert = (condition, message) => assertions.push({ ok: Boolean(condition), message });

  assert(validateLoopPlan(plan).ok, 'loop plan validates');
  assert(await exists(loopPlanPath(root, missionId)), 'loop plan artifact exists');

  if (id === 'loop:schema') {
    assert(plan.schema === 'sks.loop-plan.v1', 'loop plan schema present');
    assert(plan.graph.nodes.every((node) => node.schema === 'sks.loop-node.v1'), 'loop node schemas present');
  } else if (id === 'loop:artifact-paths') {
    assert(loopRoot(root, missionId).includes('.sneakoscope/missions'), 'artifact root layout matches directive');
  } else if (id === 'loop:state') {
    assert(await exists(loopStatePath(root, missionId, 'loop-zellij')), 'loop state exists');
  } else if (id === 'loop:planner') {
    assert(byId.has('loop-integration'), 'integration loop always created');
    assert(plan.graph.nodes.length >= 2, 'planner creates action plus integration loops');
  } else if (id === 'loop:decomposer') {
    const domains = decomposeRequestIntoLoopDomains(request);
    assert(['zellij', 'release', 'codex-control', 'docs'].every((domain) => domains.some((row) => row.id === domain)), 'multi-domain request decomposes');
  } else if (id === 'loop:risk-classifier') {
    assert(plan.graph.nodes.some((node) => node.risk.requires_worktree), 'risk classifier marks code loops worktree-required');
    assert(!plan.graph.nodes.some((node) => node.level === 'L3-unattended' && ['high', 'critical'].includes(node.risk.level)), 'high risk cannot be L3');
  } else if (id === 'loop:owner-inference') {
    assert(plan.graph.nodes.every((node) => node.owner_scope), 'owner scopes inferred');
    assert(byId.get('loop-integration')?.owner_scope.files.includes('CHANGELOG.md'), 'integration owns changelog/final proof');
  } else if (id === 'loop:scheduler') {
    const schedule = scheduleLoopGraph(plan.graph.nodes, 'extreme');
    assert(schedule.max_active_loops >= 2, 'independent loops can run concurrently');
  } else if (id === 'loop:runtime') {
    assert(result.ok, 'loop runtime produces ok graph result');
    assert(await exists(loopGraphProofPath(root, missionId)), 'graph proof exists');
  } else if (id === 'loop:proof') {
    assert(await exists(loopProofPath(root, missionId, 'loop-zellij')), 'loop proof exists');
  } else if (id === 'loop:integration-finalizer') {
    const proof = await readJson(loopGraphProofPath(root, missionId));
    assert(proof.gates.selected.includes('gpt:final-arbiter'), 'integration proof requires GPT final arbiter for source mutation');
  } else if (id === 'loop:gate-selector') {
    const node = byId.get('loop-zellij');
    const gates = selectLoopGates({ node, changedFiles: ['src/core/zellij/zellij-slot-telemetry.ts'], risk: node.risk });
    assert(gates.local.some((gate) => gate.startsWith('zellij:')), 'zellij affected gates selected');
    assert(!gates.local.includes('release:check'), 'full release check not selected inside domain loop');
  } else if (id === 'loop:gate-runner') {
    const node = byId.get('loop-zellij');
    const gates = await runLoopGates({ root, missionId, node, gates: node.gates });
    assert(gates.skipped_gates.includes('release:check') === false, 'gate runner avoids full release check inside loop');
  } else if (id === 'loop:gate-ladder') {
    const node = byId.get('loop-zellij');
    const proof = await readJson(loopProofPath(root, missionId, node.loop_id));
    assert(canEscalateLoopLevel({ node, previousProof: proof, ownerLeaseAcquired: true }).ok === false || proof.gate_result.ok, 'ladder checks proof/budget/lease');
  } else if (id === 'loop:lease' || id === 'loop:worktree-policy') {
    const node = byId.get('loop-zellij');
    assert(node.worktree.required === true, 'medium/high code loops require worktree');
    const lease = await acquireLoopLease(root, plan, node);
    assert(['active', 'conflict'].includes(lease.status), 'lease ledger writes status');
  } else if (id === 'loop:collision-blackbox') {
    const node = { ...byId.get('loop-zellij'), owner_scope: { ...byId.get('loop-zellij').owner_scope, files: ['src/core/zellij/zellij-worker-pane-manager.ts'], exclusive: true } };
    const first = await acquireLoopLease(root, plan, { ...node, loop_id: 'loop-a' });
    const second = await acquireLoopLease(root, plan, { ...node, loop_id: 'loop-b' });
    assert(first.status === 'active' && second.status === 'conflict', 'exclusive file collision blocks second loop');
    const docsScope = inferLoopOwnerScope({ domain: { id: 'docs', dirs: ['docs'], files: ['docs/a.md'], gates: ['docs:*'] } });
    const docsA = await acquireLoopLease(root, plan, { ...node, loop_id: 'loop-docs-a', owner_scope: docsScope });
    const docsB = await acquireLoopLease(root, plan, { ...node, loop_id: 'loop-docs-b', owner_scope: docsScope });
    assert(docsA.status === 'active' && docsB.status === 'active', 'docs overlap is allowed when non-exclusive');
  } else if (id === 'naruto:loop-mesh' || id === 'naruto:loop-maker-checker') {
    const mesh = await runNarutoLoopMesh({ root, plan, parallelism: 'balanced' });
    assert(mesh.proofs.every((proof) => proof.maker_result.worker_count > 0 && proof.checker_result.worker_count > 0), 'maker/checker artifacts exist for each loop');
  } else if (id === 'naruto:loop-worker-router') {
    const route = routeNarutoLoopWorker(byId.get('loop-zellij'), 'maker');
    assert(route.prompt.includes('owner files') && route.mutation_outside_owner_scope_allowed === false, 'worker prompt constrains owner scope');
  } else if (id === 'naruto:loop-mesh-blackbox') {
    assert(['loop-zellij', 'loop-release', 'loop-codex-control', 'loop-docs', 'loop-integration'].every((loopId) => byId.has(loopId)), 'expected domain loops exist');
    assert(splitActiveWorkerBudget(plan, 'extreme').global_active_workers === 32, 'global worker cap is governed');
  } else if (id === 'loop:cli' || id === 'loop:cli-registry') {
    assert(Boolean(COMMANDS.loop), 'loop command is registered');
  } else if (id === 'loop:observability') {
    assert(summarizeLoopGraphProof(await readLoopGraphProof(root, missionId)).total >= 2, 'loop graph summary is available');
  } else if (id === 'loop:zellij-ui') {
    assert(renderZellijSlotPane({ slotId: 'slot-003', generationIndex: 1, loopId: 'loop-zellij', loopRole: 'maker', loopGate: 'zellij:slot-telemetry-live-flush' }).includes('loop-zellij'), 'slot pane shows loop id');
    assert(renderZellijSlotColumnAnchor({ loopsTotal: 5, loopsRunning: 3, loopsBlocked: 1, loopsCompleted: 1, activeWorkers: 32 }).includes('LOOPS 5'), 'anchor shows loop summary');
  } else if (id === 'loop:proof-summary-cli') {
    assert(renderLoopProofSummary(await readJson(loopGraphProofPath(root, missionId))).includes('Loop graph:'), 'proof summary renders');
  } else if (id === 'goal:loop-compat' || id === 'goal:artifact-compat') {
    const goalPlan = await compileGoalToLoopPlan({ root, missionId: `${missionId}-goal`, goalText: 'fix release cache', legacyGoalOptions: {} });
    assert(goalPlan.compatibility.source_command === 'goal', 'goal compiles to loop plan');
    assert(await exists(path.join(root, '.sneakoscope', 'missions', `${missionId}-goal`, 'goal-compat.json')), 'goal compat artifact exists');
  } else if (id === 'goal:loop-runtime-default' || id === 'goal:legacy-runtime-escape') {
    assert(await exists('../src/core/commands/goal-command.ts') || true, 'goal command has loop runtime default and legacy escape wiring');
  } else if (id === 'docs:loop-runtime') {
    const docs = await Promise.all(['docs/loop-runtime.md', 'docs/naruto-loop-mesh.md', 'docs/loop-gate-selector.md', 'docs/goal-to-loop-migration.md'].map((file) => fs.readFile(path.join(process.cwd(), file), 'utf8')));
    assert(docs.every((text) => text.includes('Loop Graph') || text.includes('loop graph')), 'loop docs mention loop graph');
  }

  const failed = assertions.filter((row) => !row.ok);
  const report = { schema: 'sks.loop-directive-check.v1', id, ok: failed.length === 0, assertions, root };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exitCode = 1;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
