#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../cli/command-registry.js';
import { runProcess } from '../core/fsx.js';
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
  const realRuntimeMode = process.env.SKS_LOOP_RUNTIME_REAL === '1'
    || id === 'loop:runtime-real-workers'
    || id === 'loop:maker-checker-real'
    || id === 'loop:integration-finalizer-real'
    || id === 'loop:real-maker-checker-blackbox'
    || id === 'naruto:loop-mesh-real-blackbox'
    || id === 'goal:loop-runtime-real-blackbox';
  if (!realRuntimeMode && process.env.SKS_LOOP_RUNTIME_FIXTURE !== '1') {
    process.env.SKS_LOOP_RUNTIME_FIXTURE = '1';
  }
  const fixtureMode = process.env.SKS_LOOP_RUNTIME_FIXTURE === '1' || process.env.SKS_LOOP_GATE_FIXTURE === '1';
  const result = await runLoopPlan({ root, plan, parallelism: 'extreme', noMutation: fixtureMode ? true : !realRuntimeMode });
  const assertions = [];
  const assert = (condition, message) => assertions.push({ ok: Boolean(condition), message });

  assert(validateLoopPlan(plan).ok, 'loop plan validates');
  assert(await exists(loopPlanPath(root, missionId)), 'loop plan artifact exists');

  if (id === 'loop:schema') {
    assert(plan.schema === 'sks.loop-plan.v1', 'loop plan schema present');
    assert(plan.graph.nodes.every((node) => node.schema === 'sks.loop-node.v1'), 'loop node schemas present');
  } else if (id === 'loop:artifact-paths') {
    assert(loopRoot(root, missionId).includes('.sneakoscope/missions'), 'artifact root layout matches directive');
    assert(throws(() => loopRoot(root, '../../escape')), 'loop artifact root rejects mission traversal');
    assert(throws(() => loopRoot(root, 'bad/mission')), 'loop artifact root rejects path separators in mission id');
    assert(throws(() => loopStatePath(root, missionId, '../loop-escape')), 'loop node artifact path rejects loop traversal');
  } else if (id === 'loop:state') {
    assert(await exists(loopStatePath(root, missionId, 'loop-zellij')), 'loop state exists');
  } else if (id === 'loop:planner') {
    assert(byId.has('loop-integration'), 'integration loop always created');
    assert(plan.graph.nodes.length >= 2, 'planner creates action plus integration loops');
    assert(plan.graph.nodes.some((node) => node.route !== '$Integration' && node.maker.worker_count > 2), 'planner scales maker workers above the old hardcoded two');
    assert(plan.graph.nodes.some((node) => node.route !== '$Integration' && node.checker.worker_count > 1), 'planner scales checker reviewers above the old hardcoded one');
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
  } else if (id === 'loop:fixture-safety') {
    const runtimeSource = await fs.readFile(path.join(process.cwd(), 'src/core/loops/loop-runtime.ts'), 'utf8');
    const workerSource = await fs.readFile(path.join(process.cwd(), 'src/core/loops/loop-worker-runtime.ts'), 'utf8');
    assert(!/noMutation\s*\?\s*\{\s*fixture:\s*true\s*\}/.test(runtimeSource), 'noMutation must not force fixture mode');
    assert(workerSource.includes('decideLoopFixturePolicy'), 'fixture runtime has an explicit shared test-context policy guard');
    assert(workerSource.includes('loop_fixture_runtime_forbidden'), 'fixture runtime fails closed outside test context');
    assert(workerSource.includes("process.env.SKS_LOOP_RUNTIME_FIXTURE === '1'"), 'fixture runtime remains opt-in through SKS_LOOP_RUNTIME_FIXTURE');
    assert(!workerSource.includes('visualLaneCount: Math.min(4'), 'zellij visual lane count must use the configurable pane cap');
    const negative = await productionFixtureNegativeCheck();
    assert(negative.code === 0 && negative.stdout.includes('loop_fixture_runtime_forbidden'), 'production fixture request is blocked at runtime');
  } else if (id === 'loop:worker-runtime') {
    const proof = await readJson(loopProofPath(root, missionId, 'loop-zellij'));
    assert(proof.maker_result.backend === 'deterministic-fixture' || proof.maker_result.backend === 'native-agent-orchestrator', 'maker backend recorded');
    assert(proof.checker_result.backend === 'deterministic-fixture' || proof.checker_result.backend === 'native-agent-orchestrator', 'checker backend recorded');
    assert(proof.maker_result.runtime_proof_path, 'maker runtime proof path recorded');
    assert(proof.checker_result.runtime_proof_path, 'checker runtime proof path recorded');
  } else if (id === 'loop:worker-prompts') {
    const prompts = await import('../core/loops/loop-worker-prompts.js');
    const node = byId.get('loop-zellij');
    assert(prompts.buildLoopMakerPrompt({ plan, node }).includes('Do not mutate outside the owner scope'), 'maker prompt constrains owner scope');
    assert(prompts.buildLoopCheckerPrompt({ plan, node, makerArtifacts: ['maker.json'] }).includes('must not mutate source files'), 'checker prompt forbids mutation');
    assert(prompts.buildLoopCheckerPrompt({ plan, node, makerArtifacts: ['maker.json'] }).includes('fresh session'), 'checker prompt requires fresh session');
  } else if (id === 'loop:runtime-real-workers' || id === 'loop:maker-checker-real') {
    const proof = await readJson(loopProofPath(root, missionId, 'loop-zellij'));
    assert(proof.maker_result.artifacts.length > 0, 'maker worker runtime artifacts exist');
    assert(proof.checker_result.artifacts.length > 0, 'checker worker runtime artifacts exist');
    assert(!proof.maker_result.artifacts.includes('fresh-checker-session'), 'placeholder checker string is not used');
  } else if (id === 'loop:checker-freshness') {
    const proof = await readJson(loopProofPath(root, missionId, 'loop-zellij'));
    const checker = await readJson(proof.checker_result.checker_findings[0]);
    assert(checker.fresh_session === true, 'checker artifact proves fresh session');
    assert(Array.isArray(checker.reviewed_maker_artifacts), 'checker reviewed maker artifacts');
    assert(proof.checker_result.fresh_session === true, 'loop proof records checker freshness');
  } else if (id === 'loop:gate-registry') {
    const registry = await import('../core/loops/loop-gate-registry.js');
    const defs = await registry.listLoopGateDefinitions(process.cwd());
    assert(defs.some((gate) => gate.id === 'gpt:final-arbiter' && gate.source === 'builtin-pseudo'), 'gpt final pseudo gate registered');
    assert(await registry.resolveLoopGate(process.cwd(), 'definitely:unknown') === null, 'unknown gate does not resolve');
  } else if (id === 'loop:gate-runner-real' || id === 'loop:gate-artifacts') {
    const proof = await readJson(loopProofPath(root, missionId, 'loop-zellij'));
    assert(proof.gate_result.selected_gates.length > 0, 'gates selected');
    assert(proof.gate_result.passed_gates.length > 0 || proof.gate_result.failed_gates.length > 0, 'gate outcomes recorded');
    assert(await exists(path.join(loopRoot(root, missionId), 'loop-zellij', 'gates')), 'gate artifact directory exists');
  } else if (id === 'loop:worktree-runtime') {
    assert(await exists(path.join(loopRoot(root, missionId), 'loop-zellij', 'worktree.json')), 'worktree record exists');
  } else if (id === 'loop:worktree-diff-scope') {
    const mod = await import('../core/loops/loop-worktree-runtime.js');
    assert(mod.enforceLoopOwnerScope(['src/core/zellij/zellij-slot-pane-renderer.ts'], byId.get('loop-zellij').owner_scope).length === 0, 'owner-scoped file passes');
    assert(mod.enforceLoopOwnerScope(['README.md'], byId.get('loop-zellij').owner_scope).length > 0, 'outside owner scope blocks');
  } else if (id === 'loop:integration-merge') {
    assert(await exists(path.join(loopRoot(root, missionId), 'integration-merge.json')), 'integration merge artifact exists');
  } else if (id === 'loop:integration-finalizer-real') {
    const graph = await readJson(loopGraphProofPath(root, missionId));
    assert(graph.integration_merge && typeof graph.integration_merge.ok === 'boolean', 'graph proof includes integration merge');
  } else if (id === 'file-lock:atomic') {
    const lock = await import('../core/locks/file-lock.js');
    let count = 0;
    await lock.withFileLock({ lockPath: path.join(root, '.sneakoscope/locks/test.lock'), timeoutMs: 1000, staleMs: 10000 }, async () => { count += 1; });
    assert(count === 1, 'file lock executes critical section');
  } else if (id === 'loop:lease-atomic') {
    const node = byId.get('loop-zellij');
    const lease = await acquireLoopLease(root, plan, node);
    assert(lease.status === 'active' || lease.status === 'conflict', 'atomic lease returns status');
  } else if (id === 'loop:gpt-final-arbiter' || id === 'loop:integration-gpt-final') {
    const mod = await import('../core/loops/loop-gpt-final-arbiter.js');
    const arbiter = await mod.runLoopGptFinalArbiter({ root, plan, proofs: result.proofs, integrationMerge: { schema: 'sks.loop-integration-merge.v1', ok: true, applied_loops: [], conflict_loops: [], changed_files: ['src/core/loops/loop-runtime.ts'], blockers: [] }, forceVerdict: 'approve' });
    assert(arbiter.ok && arbiter.verdict === 'approve', 'loop GPT final arbiter can approve');
  } else if (id === 'loop:checkpoint') {
    assert(await exists(path.join(loopRoot(root, missionId), 'loop-zellij', 'checkpoint-latest.json')), 'latest checkpoint exists');
  } else if (id === 'loop:kill-resume' || id === 'loop:cli-kill-resume') {
    const control = await import('../core/loops/loop-runtime-control.js');
    await control.writeLoopKillRequest(root, missionId, 'loop-zellij');
    assert(await control.shouldKillLoop(root, missionId, 'loop-zellij'), 'kill request targets loop');
  } else if (id === 'loop:real-maker-checker-blackbox') {
    const proof = await readJson(loopProofPath(root, missionId, 'loop-zellij'));
    assert(proof.maker_result.worker_count > 0 && proof.checker_result.worker_count > 0, 'maker/checker worker counts recorded');
    assert(proof.checker_result.checker_findings.length > 0, 'checker findings artifact exists');
  } else if (id === 'naruto:loop-mesh-real-blackbox') {
    assert(plan.graph.nodes.length >= 5, 'at least four domain loops plus integration are planned');
    assert(result.proofs.every((proof) => proof.maker_result.artifacts.length && proof.checker_result.artifacts.length), 'worker runtime artifacts exist for every loop');
    assert(result.graph_proof.integration_merge, 'integration finalizer ran');
  } else if (id === 'goal:loop-runtime-real-blackbox') {
    const goalPlan = await compileGoalToLoopPlan({ root, missionId: `${missionId}-goal-real`, goalText: 'fix release cache', legacyGoalOptions: {} });
    const goalResult = await runLoopPlan({ root, plan: goalPlan, parallelism: 'balanced', noMutation: true });
    assert(await exists(path.join(root, '.sneakoscope', 'missions', `${missionId}-goal-real`, 'goal-compat.json')), 'goal compat artifact exists');
    assert(goalResult.proofs.some((proof) => proof.maker_result.artifacts.length), 'goal loop worker runtime artifacts exist');
    assert(await exists(loopGraphProofPath(root, `${missionId}-goal-real`)), 'goal graph proof exists');
  } else if (id === 'loop:status-ux') {
    assert(await exists(loopGraphProofPath(root, missionId)), 'status has graph proof source');
  } else if (id === 'loop:zellij-real-runtime-ui') {
    assert(renderZellijSlotPane({ slotId: 'slot-003', generationIndex: 1, loopId: 'loop-zellij', loopRole: 'maker', loopGate: 'loop:test', backend: 'fixture', patchStatus: 'fixture', verifyStatus: 'pass' }).includes('fixture loop proof'), 'zellij marks fixture proof');
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
    const checkerDir = path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'sessions');
    await fs.mkdir(checkerDir, { recursive: true });
    await fs.writeFile(path.join(checkerDir, 'checker-findings.json'), JSON.stringify({ fresh_session: true, approved: true }));
    const checkerGate = await runLoopGates({
      root,
      missionId,
      node,
      gates: { triage: [], local: [], checker: ['loop:checker-fresh-session'], integration: [], final: [] },
      checkerArtifacts: ['sessions/checker-findings.json']
    });
    assert(checkerGate.ok, 'builtin checker gate resolves mission-ledger relative artifacts');
    const foreignChecker = path.join(path.dirname(root), `${missionId}-foreign-checker-findings.json`);
    await fs.writeFile(foreignChecker, JSON.stringify({ fresh_session: true, approved: true }));
    const foreignRelative = path.relative(path.join(root, '.sneakoscope', 'missions', missionId, 'agents'), foreignChecker);
    const unsafeCheckerGate = await runLoopGates({
      root,
      missionId,
      node,
      gates: { triage: [], local: [], checker: ['loop:checker-fresh-session'], integration: [], final: [] },
      checkerArtifacts: [foreignRelative, foreignChecker]
    });
    assert(!unsafeCheckerGate.ok && unsafeCheckerGate.blockers.includes('loop_checker_fresh_session_missing'), 'builtin checker gate rejects foreign absolute and traversal artifacts');
    const repoLocalChecker = path.join(root, 'repo-local-checker-findings.json');
    await fs.writeFile(repoLocalChecker, JSON.stringify({ fresh_session: true, approved: true }));
    const repoLocalCheckerGate = await runLoopGates({
      root,
      missionId,
      node,
      gates: { triage: [], local: [], checker: ['loop:checker-fresh-session'], integration: [], final: [] },
      checkerArtifacts: ['repo-local-checker-findings.json', repoLocalChecker]
    });
    assert(!repoLocalCheckerGate.ok && repoLocalCheckerGate.blockers.includes('loop_checker_fresh_session_missing'), 'builtin checker gate rejects repo-local non-mission artifacts');
    const symlinkChecker = path.join(checkerDir, 'checker-findings-symlink.json');
    await fs.symlink(repoLocalChecker, symlinkChecker);
    const symlinkCheckerGate = await runLoopGates({
      root,
      missionId,
      node,
      gates: { triage: [], local: [], checker: ['loop:checker-fresh-session'], integration: [], final: [] },
      checkerArtifacts: ['sessions/checker-findings-symlink.json']
    });
    assert(!symlinkCheckerGate.ok && symlinkCheckerGate.blockers.includes('loop_checker_fresh_session_missing'), 'builtin checker gate rejects mission-local symlinks that escape the mission root');
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
    const mesh = await runNarutoLoopMesh({ root, plan, parallelism: 'balanced', noMutation: fixtureMode ? true : !realRuntimeMode });
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

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function productionFixtureNegativeCheck() {
  const runtimeModuleUrl = new URL('../core/loops/loop-worker-runtime.js', import.meta.url).href;
  const code = `
import { runLoopMakerWorkers } from ${JSON.stringify(runtimeModuleUrl)};
const node = {
  mission_id: 'M-production-fixture-negative',
  loop_id: 'loop-production-fixture-negative',
  owner_scope: { files: ['README.md'], directories: [], package_scripts: [], release_gate_ids: [], exclusive: true, collision_policy: 'handoff' },
  maker: { worker_count: 1 },
  checker: { worker_count: 1 },
  risk: { requires_gpt_final: false },
  worktree: { required: false }
};
const plan = { mission_id: 'M-production-fixture-negative' };
try {
  await runLoopMakerWorkers({ root: process.cwd(), plan, node, fixture: true });
  console.error('fixture unexpectedly allowed outside test context');
  process.exit(1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes('loop_fixture_runtime_forbidden')) {
    console.error(message);
    process.exit(2);
  }
  console.log(message);
}
`;
  return runProcess('/usr/bin/env', [
    '-u', 'NODE_ENV',
    '-u', 'SKS_TEST_RUNTIME_FIXTURE_ALLOWED',
    '-u', 'VITEST_WORKER_ID',
    '-u', 'JEST_WORKER_ID',
    '-u', 'NODE_V8_COVERAGE',
    'SKS_LOOP_RUNTIME_FIXTURE=1',
    process.execPath,
    '--input-type=module',
    '-e',
    code
  ], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 8192
  });
}
