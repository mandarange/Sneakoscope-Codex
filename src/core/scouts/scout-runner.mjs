import path from 'node:path';
import { ensureDir, exists, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
import { createMission, loadMission, missionDir } from '../mission.mjs';
import { buildScoutConsensus, renderScoutHandoff } from './scout-consensus.mjs';
import { evaluateScoutGate, readScoutGateStatus } from './scout-gate.mjs';
import { buildScoutTeamPlan, routeRequiresScoutIntake, scoutRouteLabel } from './scout-plan.mjs';
import { appendScoutLedger, renderScoutMarkdown, resetScoutLedger, scoutArtifactList, writeScoutPerformanceSummary } from './scout-artifacts.mjs';
import { SCOUT_COUNT, SCOUT_PERFORMANCE_SCHEMA, SCOUT_RESULT_SCHEMA, SCOUT_ROLES } from './scout-schema.mjs';
import { readScoutTriWikiHint } from './scout-triwiki.mjs';
import { snapshotScoutReadableTree, assertScoutReadOnly } from './scout-readonly-guard.mjs';
import { runCodexExecParallelEngine } from './engines/codex-exec-parallel-engine.mjs';
import { selectScoutEngine } from './engines/scout-engine-policy.mjs';
import { scoutEngineResult } from './engines/scout-engine-base.mjs';

export async function ensureScoutMission(root, { missionId = null, route = '$Team', task = 'Five Scout fixture intake' } = {}) {
  if (missionId) {
    try {
      return await loadMission(root, missionId);
    } catch {
      return {
        id: missionId,
        dir: missionDir(root, missionId),
        mission: { id: missionId, mode: 'scouts', prompt: task, created_at: nowIso() }
      };
    }
  }
  const created = await createMission(root, { mode: 'scouts', prompt: task });
  await writeJsonAtomic(path.join(created.dir, 'route-context.json'), {
    route: 'Scouts',
    command: 'sks scouts',
    delegated_route: scoutRouteLabel(route),
    task,
    scout_fixture: true
  });
  return { id: created.id, dir: created.dir, mission: created.mission };
}

export async function ensureFiveScoutIntake(root, {
  missionId,
  route = '$Team',
  task = '',
  mode = 'auto',
  parallel = true,
  engine = 'auto',
  requireRealParallel = false,
  mock = false,
  timeBudget = {},
  force = false,
  noScouts = false
} = {}) {
  const required = routeRequiresScoutIntake(route, { task, force, noScouts });
  if (!required) {
    return {
      required: false,
      status: 'not_required',
      reason: noScouts ? 'explicitly_disabled_by_sealed_contract' : 'lightweight_or_non_stateful_route'
    };
  }
  const status = await readScoutGateStatus(root, missionId);
  if (status.ok) return {
    required: true,
    status: 'already_passed',
    gate: status.gate,
    artifacts: scoutArtifactList()
  };
  return runFiveScoutIntake(root, { missionId, route, task, mode, parallel, engine, requireRealParallel, mock, timeBudget });
}

export async function runFiveScoutIntake(root, {
  missionId,
  route = '$Team',
  task = '',
  mode = 'auto',
  parallel = true,
  engine = 'auto',
  requireRealParallel = false,
  mock = false,
  timeBudget = {}
} = {}) {
  const mission = await ensureScoutMission(root, { missionId, route, task });
  const id = mission.id;
  const dir = mission.dir || missionDir(root, id);
  const routeLabel = scoutRouteLabel(route);
  const startedAt = nowIso();
  const startMs = Date.now();
  await ensureDir(dir);
  await resetScoutLedger(root, id);
  const selection = await selectScoutEngine(root, {
    requested: engine,
    requireRealParallel,
    missionId: id,
    route: routeLabel,
    mock
  });
  const selectedEngine = selection.selected;
  const realParallel = selection.real_parallel === true;
  const parallelMode = realParallel || (parallel && selectedEngine === 'local-static') ? 'parallel' : 'sequential_fallback';
  let plan = buildScoutTeamPlan({ missionId: id, route: routeLabel, task: task || mission.mission?.prompt || '', parallelMode, mode, timeBudget, createdAt: startedAt });
  plan = {
    ...plan,
    engine: selectedEngine,
    real_parallel: realParallel,
    engine_selection: selection
  };
  await writeJsonAtomic(path.join(dir, 'scout-team-plan.json'), plan);
  await appendScoutLedger(root, id, { type: 'scouts.started', route: routeLabel, scout_count: SCOUT_COUNT, parallel_mode: parallelMode, engine: selectedEngine, real_parallel: realParallel, mock });
  if (!selection.available) {
    const completedAt = nowIso();
    const engineResult = scoutEngineResult({
      engine: selectedEngine,
      realParallel,
      mock,
      parallelMode,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      blockers: selection.blockers,
      unverified: ['No scout run was created because the selected engine is unavailable or real parallel was required.']
    });
    await writeJsonAtomic(path.join(dir, 'scout-engine-result.json'), engineResult);
    const gate = {
      schema: 'sks.scout-gate.v1',
      mission_id: id,
      route: routeLabel,
      passed: false,
      required_scouts: SCOUT_COUNT,
      completed_scouts: 0,
      read_only_confirmed: false,
      engine: selectedEngine,
      real_parallel: realParallel,
      blockers: selection.blockers,
      unverified: engineResult.unverified
    };
    await writeJsonAtomic(path.join(dir, 'scout-gate.json'), gate);
    const performance = scoutPerformance({
      missionId: id,
      route: routeLabel,
      engine: selectedEngine,
      realParallel,
      mock,
      parallelMode,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      perScout: {},
      claimAllowed: false,
      claimReason: selection.blockers.join('; ') || 'selected scout engine unavailable'
    });
    await writeJsonAtomic(path.join(dir, 'scout-performance.json'), performance);
    const summary = await writeScoutPerformanceSummary(root, performance);
    await appendScoutLedger(root, id, { type: 'scouts.blocked', engine: selectedEngine, blockers: selection.blockers });
    return {
      schema: 'sks.scouts-run.v1',
      ok: false,
      required: true,
      mission_id: id,
      route: routeLabel,
      engine: selectedEngine,
      real_parallel: realParallel,
      parallel_mode: parallelMode,
      scout_count: SCOUT_COUNT,
      completed_scouts: 0,
      gate,
      performance,
      performance_summary: summary,
      artifacts: scoutArtifactList()
    };
  }
  const triwiki = await readScoutTriWikiHint(root);
  const before = await snapshotScoutReadableTree(root, { missionId: id });
  if (selectedEngine === 'codex-exec-parallel') {
    await runCodexExecParallelEngine(root, {
      missionId: id,
      dir,
      route: routeLabel,
      task: task || mission.mission?.prompt || '',
      roles: SCOUT_ROLES
    });
  }
  const work = SCOUT_ROLES.map((role) => async () => {
    const scoutStart = Date.now();
    const result = await buildScoutResult(root, {
      missionId: id,
      route: routeLabel,
      task: task || mission.mission?.prompt || '',
      role,
      mock,
      engine: selectedEngine,
      realParallel,
      triwiki
    });
    const durationMs = Date.now() - scoutStart;
    await writeJsonAtomic(path.join(dir, role.json), result);
    await writeTextAtomic(path.join(dir, role.md), renderScoutMarkdown(result));
    await appendScoutLedger(root, id, { type: 'scout.done', scout_id: role.id, duration_ms: durationMs, status: result.status });
    return { result, durationMs };
  });
  const rows = (realParallel || parallel) && selectedEngine !== 'sequential-fallback' ? await Promise.all(work.map((fn) => fn())) : [];
  if (!parallel) {
    for (const fn of work) rows.push(await fn());
  }
  if (selectedEngine === 'sequential-fallback' && parallel) {
    for (const fn of work) rows.push(await fn());
  }
  const results = rows.map((row) => row.result);
  plan = {
    ...plan,
    scouts: plan.scouts.map((scout) => ({ ...scout, status: results.some((result) => result.scout_id === scout.id && result.status === 'done') ? 'done' : 'blocked' }))
  };
  await writeJsonAtomic(path.join(dir, 'scout-team-plan.json'), plan);
  const consensus = buildScoutConsensus({ missionId: id, route: routeLabel, results, parallelMode });
  await writeJsonAtomic(path.join(dir, 'scout-consensus.json'), consensus);
  await writeTextAtomic(path.join(dir, 'scout-handoff.md'), renderScoutHandoff(consensus));
  const readOnlyGuard = await assertScoutReadOnly(root, before, { missionId: id });
  await writeJsonAtomic(path.join(dir, 'scout-readonly-guard.json'), readOnlyGuard);
  const gate = {
    ...evaluateScoutGate({ missionId: id, route: routeLabel, plan, results, consensus, handoffWritten: true }),
    engine: selectedEngine,
    real_parallel: realParallel,
    read_only_guard: readOnlyGuard.passed === true,
    blockers: [
      ...evaluateScoutGate({ missionId: id, route: routeLabel, plan, results, consensus, handoffWritten: true }).blockers,
      ...(readOnlyGuard.passed ? [] : readOnlyGuard.violations.map((violation) => `read_only_violation:${violation.kind}:${violation.path}`))
    ]
  };
  gate.passed = gate.blockers.length === 0;
  await writeJsonAtomic(path.join(dir, 'scout-gate.json'), gate);
  const completedAt = nowIso();
  const durationMs = Date.now() - startMs;
  const perScout = Object.fromEntries(SCOUT_ROLES.map((role) => [role.id, rows.find((row) => row.result.scout_id === role.id)?.durationMs || 0]));
  const estimatedSequentialMs = Object.values(perScout).reduce((sum, ms) => sum + Number(ms || 0), 0);
  const claimAllowed = realParallel
    && !mock
    && readOnlyGuard.passed === true
    && durationMs > 0
    && estimatedSequentialMs > durationMs
    && estimatedSequentialMs >= durationMs * 1.1;
  const performance = scoutPerformance({
    missionId: id,
    route: routeLabel,
    engine: selectedEngine,
    realParallel,
    mock,
    parallelMode,
    startedAt,
    completedAt,
    durationMs,
    perScout,
    estimatedSequentialMs,
    claimAllowed,
    claimReason: claimAllowed
      ? 'real parallel engine with measured wall-clock and sequential baseline'
      : (mock || selectedEngine === 'local-static' ? 'mock/static fallback cannot support real speedup claims' : 'real engine ran, but no measured sequential baseline supports a speedup claim')
  });
  const engineResult = scoutEngineResult({
    engine: selectedEngine,
    realParallel,
    mock,
    parallelMode,
    startedAt,
    completedAt,
    durationMs,
    perScoutDurationMs: perScout,
    completedScouts: gate.completed_scouts,
    claimAllowed,
    blockers: gate.blockers,
    unverified: gate.unverified
  });
  await writeJsonAtomic(path.join(dir, 'scout-engine-result.json'), engineResult);
  await writeJsonAtomic(path.join(dir, 'scout-performance.json'), performance);
  const summary = await writeScoutPerformanceSummary(root, performance);
  await appendScoutLedger(root, id, { type: 'scouts.finished', passed: gate.passed, duration_ms: durationMs, claim_allowed: performance.claim_allowed });
  return {
    schema: 'sks.scouts-run.v1',
    ok: gate.passed === true,
    required: true,
    mission_id: id,
    route: routeLabel,
    engine: selectedEngine,
    real_parallel: realParallel,
    parallel_mode: parallelMode,
    scout_count: SCOUT_COUNT,
    completed_scouts: gate.completed_scouts,
    gate,
    consensus,
    performance,
    performance_summary: summary,
    artifacts: scoutArtifactList()
  };
}

function scoutPerformance({
  missionId,
  route,
  engine,
  realParallel,
  mock,
  parallelMode,
  startedAt,
  completedAt,
  durationMs,
  perScout,
  estimatedSequentialMs = Object.values(perScout || {}).reduce((sum, ms) => sum + Number(ms || 0), 0),
  claimAllowed,
  claimReason
}) {
  return {
    schema: SCOUT_PERFORMANCE_SCHEMA,
    mission_id: missionId,
    route,
    engine,
    execution_engine: engine,
    real_parallel: Boolean(realParallel),
    mock: Boolean(mock),
    parallel_mode: parallelMode,
    scout_count: SCOUT_COUNT,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    per_scout_duration_ms: perScout || {},
    estimated_sequential_ms: estimatedSequentialMs,
    observed_parallel_speedup: realParallel && durationMs > 0 ? Number((estimatedSequentialMs / durationMs).toFixed(2)) : null,
    claim_allowed: Boolean(claimAllowed),
    claim_reason: claimReason,
    claim_policy: claimReason
  };
}

async function buildScoutResult(root, { missionId, route, task, role, mock, engine = 'local-static', realParallel = false, triwiki }) {
  const packageJson = await readJson(path.join(root, 'package.json'), {});
  const hasCommandRegistry = await exists(path.join(root, 'src', 'cli', 'command-registry.mjs'));
  const hasPipeline = await exists(path.join(root, 'src', 'core', 'pipeline.mjs'));
  const hasAutoFinalizer = await exists(path.join(root, 'src', 'core', 'proof', 'auto-finalize.mjs'));
  const routeText = `${route} ${task}`;
  const context7Required = /\b(package|library|framework|SDK|API|MCP|Supabase|React|Next|Vue|Vite|Prisma|Drizzle|Knex|Postgres|npm|node_modules|docs?|documentation)\b/i.test(routeText);
  const unverified = mock ? ['Mock/static scout fixture evidence; do not claim live subagent analysis or real speedup.'] : [];
  const common = {
    schema: SCOUT_RESULT_SCHEMA,
    mission_id: missionId,
    scout_id: role.id,
    role: role.role,
    route,
    status: 'done',
    read_only: true,
    write_policy: 'read_only',
    generated_at: nowIso(),
    context7_required: context7Required,
    context7_libraries: context7Required ? context7LibrariesFor(routeText) : [],
    engine,
    real_parallel: Boolean(realParallel),
    triwiki_hint: triwiki,
    blockers: [],
    unverified
  };
  if (role.id === 'scout-1-code-surface') {
    return {
      ...common,
      summary: 'Pipeline, route finalization, CLI registry, feature fixtures, tests, docs, and release scripts are the likely touch surfaces.',
      findings: [
        finding('finding-001', 'code', 'Pipeline plans need a five_scout_parallel_intake stage before implementation planning.', 'src/core/pipeline.mjs', 'buildPipelinePlan/buildPipelineStages', hasPipeline ? 'high' : 'medium', 'Add a required read-only scout stage for serious routes and skip it for lightweight routes.'),
        finding('finding-002', 'code', 'Route finalization is the central place to attach scout proof evidence for serious route fixtures.', 'src/core/proof/auto-finalize.mjs', 'maybeFinalizeRoute', hasAutoFinalizer ? 'high' : 'medium', 'Ensure scout intake runs before completion proof is written.'),
        finding('finding-003', 'code', 'CLI commands are lazy-loaded from the command registry and need scouts/scout entries.', 'src/cli/command-registry.mjs', 'COMMANDS', hasCommandRegistry ? 'high' : 'medium', 'Add scouts and scout command surfaces.')
      ],
      suggested_tasks: [
        taskRow('task-001', 'Add scout core modules and CLI command wrapper', ['src/core/scouts/*.mjs', 'src/core/commands/scouts-command.mjs', 'src/commands/scouts.mjs'], ['node --check src/core/commands/scouts-command.mjs']),
        taskRow('task-002', 'Wire scout stage into route pipeline and finalizer', ['src/core/pipeline.mjs', 'src/core/proof/auto-finalize.mjs', 'src/core/proof/route-finalizer.mjs'], ['npm run test:unit'])
      ]
    };
  }
  if (role.id === 'scout-2-verification') {
    return {
      ...common,
      summary: 'Verification should cover plan policy, gate policy, consensus aggregation, proof evidence, CLI mock run, route fixtures, and release scripts.',
      findings: [
        finding('finding-001', 'test', 'Unit tests should prove exactly five scouts and read-only policy.', 'test/unit/scout-plan.test.mjs', 'new', 'high', 'Add unit coverage for route policy and plan shape.'),
        finding('finding-002', 'test', 'Integration tests should exercise `sks scouts run latest --engine local-static --mock --json` and proof evidence.', 'test/integration/scouts-run-mock.test.mjs', 'new', 'high', 'Add CLI and core integration coverage.'),
        finding('finding-003', 'test', 'E2E route fixtures should prove Team, QA-LOOP, and Research completion proof includes evidence.scouts.', 'test/e2e/route-team-five-scouts.test.mjs', 'new', 'high', 'Assert route auto-finalization generated scout artifacts.')
      ],
      suggested_tasks: [
        taskRow('task-003', 'Add scout unit/integration/e2e tests', ['test/unit/scout-*.test.mjs', 'test/integration/scouts-*.test.mjs', 'test/e2e/route-*-five-scouts.test.mjs'], ['npm run test:unit', 'npm run test:integration:mock', 'npm run test:e2e:mock']),
        taskRow('task-004', 'Add scouts release scripts to release:check', ['package.json'], ['npm run scouts:selftest', 'npm run scouts:check'])
      ]
    };
  }
  if (role.id === 'scout-3-safety-db') {
    const dbRisk = /\b(DB|database|SQL|Supabase|Postgres|migration|RLS|Prisma|Drizzle|Knex|MAD-SKS|execute_sql)\b/i.test(routeText);
    return {
      ...common,
      summary: dbRisk ? 'DB/security risk cues are present; keep Scout read-only and preserve catastrophic DB safeguards.' : 'No direct DB mutation requirement was detected; Scout still records read-only permission policy.',
      findings: [
        finding('finding-001', dbRisk ? 'db' : 'risk', dbRisk ? 'Route text includes DB or MAD-SKS risk cues.' : 'Scout intake itself must never write DB, migrations, package installs, or git state.', 'src/core/permission-gates.mjs', 'policy surface', 'medium', 'Keep scouts read-only and route DB mutations through existing safety gates.'),
        finding('finding-002', 'risk', 'Scout artifacts must not claim mock/static evidence as real subagent or speed evidence.', 'src/core/scouts/scout-runner.mjs', 'performance claim policy', 'high', 'Record claim_allowed=false unless real benchmark evidence exists.')
      ],
      suggested_tasks: [
        taskRow('task-005', 'Add scout gate and proof blockers for missing read-only/gate artifacts', ['src/core/scouts/scout-gate.mjs', 'src/core/proof/route-proof-gate.mjs'], ['node --test test/unit/scout-gate.test.mjs'])
      ]
    };
  }
  if (role.id === 'scout-4-visual-voxel') {
    const visual = /\b(Image|UX|UI|Visual|Voxel|PPT|GX|Computer-Use|CU|screenshot|screen|browser|image)\b/i.test(routeText);
    return {
      ...common,
      summary: visual ? 'Visual/Voxel route cues are present; keep existing image voxel evidence requirements in the route finalizer.' : 'No visual evidence route was detected; record that image voxel evidence is not required for this mission unless downstream claims add it.',
      required_image_voxel_evidence: visual ? ['image-voxel-ledger.json'] : [],
      findings: [
        finding('finding-001', 'visual', visual ? 'Route may require image/UX/Voxel evidence in addition to scout artifacts.' : 'Scout phase still records the visual review decision even when visual evidence is not required.', 'src/core/proof/route-finalizer.mjs', 'ensureRouteImageEvidence', visual ? 'high' : 'medium', 'Do not weaken image voxel gates for visual routes.'),
        finding('finding-002', 'triwiki', 'TriWiki context pack validation remains a final route gate and should mention scout findings after artifacts change.', '.sneakoscope/wiki/context-pack.json', 'attention.use_first', triwiki?.available ? 'high' : 'low', 'Refresh or pack TriWiki after scout results when the route requires it.')
      ],
      suggested_tasks: [
        taskRow('task-006', 'Document scout relationship to Completion Proof and Image Voxel evidence', ['docs/five-scout-pipeline.md', 'docs/completion-proof.md'], ['npm run packcheck'])
      ]
    };
  }
  return {
    ...common,
    summary: 'Smallest safe implementation path is a native scout subsystem, central finalizer hook, and focused fixture/test/docs updates.',
    findings: [
      finding('finding-001', 'integration', 'The lowest-risk integration point is auto-finalization, so every serious route fixture receives scout proof without per-route duplication.', 'src/core/proof/auto-finalize.mjs', 'maybeFinalizeRoute', 'high', 'Run or validate scout intake before writing Completion Proof.'),
      finding('finding-002', 'integration', 'Release scripts should run the scout selftest before all route tests so latest mission artifacts are available for validate.', 'package.json', `scripts.release:check for ${packageJson.name || 'package'}`, 'medium', 'Insert scouts:selftest and scouts:check into release:check.')
    ],
    suggested_tasks: [
      taskRow('task-007', 'Integrate scout fixtures into feature registry and all-features checks', ['src/core/feature-fixtures.mjs', 'src/core/feature-registry.mjs'], ['npm run all-features:selftest']),
      taskRow('task-008', 'Run release and npm dry publish after targeted tests pass', ['package.json', 'package-lock.json'], ['npm run release:check', 'npm publish --dry-run'])
    ]
  };
}

function finding(id, kind, claim, ref, lineHint, confidence, action) {
  return {
    id,
    kind,
    claim,
    evidence: [{ type: ref.startsWith('.sneakoscope') ? 'triwiki' : 'file', ref, line_hint: lineHint, confidence }],
    risk: kind === 'db' || kind === 'risk' ? 'medium' : 'low',
    action
  };
}

function taskRow(id, title, files, verification) {
  return { id, title, owner_type: 'implementation', files, verification };
}

function context7LibrariesFor(text = '') {
  const libs = [];
  for (const [needle, lib] of [
    ['Supabase', 'supabase'],
    ['React', 'react'],
    ['Next', 'next.js'],
    ['Prisma', 'prisma'],
    ['Drizzle', 'drizzle'],
    ['Postgres', 'postgresql'],
    ['npm', 'npm']
  ]) {
    if (new RegExp(`\\b${needle}\\b`, 'i').test(text)) libs.push(lib);
  }
  return libs;
}
