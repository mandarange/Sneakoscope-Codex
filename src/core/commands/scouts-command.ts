import path from 'node:path';
import fs from 'node:fs/promises';
import { ensureDir, exists, projectRoot, readJson, readText, sha256, writeJsonAtomic } from '../fsx.js';
import { createMission, loadMission, missionDir, setCurrent, stateFile } from '../mission.js';
import { routePrompt } from '../routes.js';
import { buildScoutTeamPlan, normalizeScoutPolicy, routeRequiresScoutIntake, scoutRouteLabel } from '../scouts/scout-plan.js';
import { readScoutGateStatus, readScoutResults } from '../scouts/scout-gate.js';
import { runFiveScoutIntake } from '../scouts/scout-runner.js';
import { readScoutProofEvidence } from '../scouts/scout-proof-evidence.js';
import { detectScoutEngines } from '../scouts/engines/scout-engine-detect.js';
import { selectScoutEngine } from '../scouts/engines/scout-engine-policy.js';
import { SCOUT_COUNT } from '../scouts/scout-schema.js';
import { flag, readFlagValue, resolveMissionId } from './command-utils.js';

const ACTIONS = new Set(['plan', 'run', 'status', 'consensus', 'handoff', 'validate', 'engines', 'bench', 'help', '--help', '-h']);

export async function scoutsCommand(args: any = []) {
  const root = await projectRoot();
  const action = ACTIONS.has(args[0]) ? args[0] : 'status';
  const actionArgs = ACTIONS.has(args[0]) ? args.slice(1) : args;
  if (action === 'help' || action === '--help' || action === '-h') return scoutsHelp();
  const json = flag(actionArgs, '--json');
  const mock = flag(actionArgs, '--mock');
  const strict = flag(actionArgs, '--strict');
  const requestedEngine = readFlagValue(actionArgs, '--engine', 'auto');
  const requireRealParallel = flag(actionArgs, '--require-real-parallel');
  const requireOutputSchema = flag(actionArgs, '--require-output-schema');
  const isolateArtifacts = flag(actionArgs, '--isolate-artifacts');
  const engineRunId = readFlagValue(actionArgs, '--engine-run-id', null);
  const sessionPrefix = readFlagValue(actionArgs, '--session-prefix', null);
  const force = flag(actionArgs, '--force-scouts') || flag(actionArgs, '--force');
  const noScouts = flag(actionArgs, '--no-scouts');
  const missionArg = actionArgs.find((arg: any) => !String(arg).startsWith('--')) || 'latest';
  if (action === 'engines') {
    const result = await detectScoutEngines(root, {});
    if (json) return console.log(JSON.stringify(result, null, 2));
    for (const engine of result.engines) console.log(`${engine.name}: ${engine.available ? 'available' : 'blocked'}${engine.reason ? ` (${engine.reason})` : ''}`);
    return;
  }
  const { id, dir, mission, created } = await resolveOrCreateScoutMission(root, missionArg, { mock, action, strict });
  const context = await inferScoutContext(root, id, { route: readFlagValue(actionArgs, '--route', null), task: readFlagValue(actionArgs, '--task', null) });
  if (action === 'plan') {
    const parallelMode = flag(actionArgs, '--sequential') ? 'sequential_fallback' : 'parallel';
    const plan = buildScoutTeamPlan({
      missionId: id,
      route: context.route,
      task: context.task,
      parallelMode,
      mode: mock ? 'mock' : 'manual'
    });
    await writeJsonAtomic(path.join(dir, 'scout-team-plan.json'), plan);
    const result = { schema: 'sks.scouts-plan.v1', ok: true, mission_id: id, created, plan };
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.log(`Scout plan written: .sneakoscope/missions/${id}/scout-team-plan.json`);
    return;
  }
  if (action === 'run') {
    if (noScouts) {
      const result = { schema: 'sks.scouts-run.v1', ok: true, mission_id: id, required: false, status: 'not_required', reason: 'explicitly_disabled_by_sealed_contract' };
      if (json) return console.log(JSON.stringify(result, null, 2));
      console.log('Five-scout intake disabled by explicit --no-scouts.');
      return;
    }
    const run = await runFiveScoutIntake(root, {
      missionId: id,
      route: context.route,
      task: context.task,
      mode: mock ? 'mock' : 'manual',
      parallel: !flag(actionArgs, '--sequential'),
      engine: requestedEngine,
      requireRealParallel,
      requireOutputSchema,
      engineRunId,
      sessionPrefix,
      writeCanonical: !isolateArtifacts,
      mock
    });
    await setCurrent(root, {
      mission_id: id,
      scouts_required: routeRequiresScoutIntake(context.route, { task: context.task, force }),
      scout_gate_ready: run.gate?.passed === true,
      scout_count: SCOUT_COUNT,
      route_command: context.route,
      prompt: context.task
    });
    if (json) return console.log(JSON.stringify(run, null, 2));
    console.log(`Five-scout intake: ${run.gate?.passed ? 'passed' : 'blocked'} (${run.completed_scouts}/${run.scout_count})`);
    return;
  }
  if (action === 'status') {
    const gate = await readScoutGateStatus(root, id);
    const results = await readScoutResults(root, id);
    const result = {
      schema: 'sks.scouts-status.v1',
      ok: gate.ok,
      mission_id: id,
      route: context.route,
      scout_count: SCOUT_COUNT,
      completed_scouts: results.filter((row: any) => row.status === 'done').length,
      engine: gate.gate?.engine || null,
      real_parallel: gate.gate?.real_parallel === true,
      gate: gate.gate,
      missing: gate.missing,
      engine_runs: flag(actionArgs, '--engine-runs') ? await listScoutEngineRuns(dir) : undefined
    };
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.log(`Five-scout intake: ${result.ok ? 'passed' : 'not passed'} (${result.completed_scouts}/${SCOUT_COUNT})`);
    if (result.missing?.length) console.log(`Missing: ${result.missing.join(', ')}`);
    return;
  }
  if (action === 'consensus') {
    const consensus = await readJson(path.join(dir, 'scout-consensus.json'), null);
    if (!consensus) {
      process.exitCode = 2;
      const result = { schema: 'sks.scouts-consensus.v1', ok: false, mission_id: id, missing: ['scout-consensus.json'] };
      if (json) return console.log(JSON.stringify(result, null, 2));
      console.error(`Scout consensus missing for ${id}.`);
      return;
    }
    if (json) return console.log(JSON.stringify(consensus, null, 2));
    console.log(JSON.stringify(consensus, null, 2));
    return;
  }
  if (action === 'handoff') {
    const fs = await import('node:fs/promises');
    const file = path.join(dir, 'scout-handoff.md');
    if (!(await exists(file))) {
      process.exitCode = 2;
      if (json) return console.log(JSON.stringify({ schema: 'sks.scouts-handoff.v1', ok: false, mission_id: id, missing: ['scout-handoff.md'] }, null, 2));
      console.error(`Scout handoff missing for ${id}.`);
      return;
    }
    const text = await fs.readFile(file, 'utf8');
    if (json) return console.log(JSON.stringify({ schema: 'sks.scouts-handoff.v1', ok: true, mission_id: id, path: `.sneakoscope/missions/${id}/scout-handoff.md`, text }, null, 2));
    console.log(text.trimEnd());
    return;
  }
  if (action === 'validate') {
    let gate = await readScoutGateStatus(root, id);
    if (!gate.ok && !strict) {
      const run = await runFiveScoutIntake(root, {
        missionId: id,
        route: context.route,
        task: context.task,
        mode: 'validate-fixture',
        parallel: true,
        engine: 'local-static',
        requireOutputSchema,
        mock: true
      });
      gate = { ok: run.gate?.passed === true, gate: run.gate, missing: run.gate?.blockers || [] };
    }
    const evidence = await readScoutProofEvidence(root, id);
    const result = {
      schema: 'sks.scouts-validate.v1',
      ok: gate.ok && evidence?.gate === 'passed',
      mission_id: id,
      gate: gate.gate,
      proof_evidence: evidence,
      missing: gate.missing || []
    };
    if (!result.ok) process.exitCode = 1;
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.log(`Scout validation: ${result.ok ? 'pass' : 'blocked'}`);
    return;
  }
  if (action === 'bench') {
    const selection = await selectScoutEngine(root, {
      requested: requestedEngine,
      requireRealParallel,
      requireOutputSchema,
      missionId: id,
      route: context.route,
      mock
    });
    const canonicalBefore = await canonicalScoutArtifactFingerprint(dir);
    const parallelRun = await runFiveScoutIntake(root, {
      missionId: id,
      route: context.route,
      task: context.task,
      mode: 'bench-parallel',
      parallel: true,
      engine: selection.selected,
      requireRealParallel,
      requireOutputSchema,
      writeCanonical: false,
      sessionPrefix: sessionPrefix ? `${sessionPrefix}-parallel` : null,
      mock
    });
    const sequentialRun = await runFiveScoutIntake(root, {
      missionId: id,
      route: context.route,
      task: context.task,
      mode: 'bench-sequential',
      parallel: false,
      engine: 'sequential-fallback',
      writeCanonical: false,
      sessionPrefix: sessionPrefix ? `${sessionPrefix}-sequential` : null,
      mock: true
    });
    const canonicalAfter = await canonicalScoutArtifactFingerprint(dir);
    const canonicalArtifactsModified = JSON.stringify(canonicalBefore) !== JSON.stringify(canonicalAfter);
    const sequentialMs = Number(sequentialRun.performance?.duration_ms || 0);
    const parallelMs = Number(parallelRun.performance?.duration_ms || 0);
    const parsedRealOutputs = Number(parallelRun.consensus?.source_policy?.counts?.parsed_scout_output || 0);
    const parallelRunAny: any = parallelRun;
    const speedup: number = selection.real_parallel && parallelMs > 0 ? Number((sequentialMs / parallelMs).toFixed(2)) : 0;
    const claimAllowed = selection.real_parallel === true
      && parsedRealOutputs === SCOUT_COUNT
      && parallelRunAny.performance?.claim_allowed === true
      && speedup > 1.1
      && parallelRunAny.gate?.read_only_guard === true
      && !parallelRunAny.gate?.blockers?.length;
    const result = {
      schema: 'sks.scout-benchmark.v3',
      mission_id: id,
      engine: selection.selected,
      parallel_engine_run_id: parallelRun.engine_run_id,
      sequential_engine_run_id: sequentialRun.engine_run_id,
      parallel_artifacts_dir: parallelRun.artifacts_dir,
      sequential_artifacts_dir: sequentialRun.artifacts_dir,
      parallel_artifact_namespace: parallelRun.artifact_namespace,
      sequential_artifact_namespace: sequentialRun.artifact_namespace,
      canonical_artifacts_modified: canonicalArtifactsModified,
      real_parallel: selection.real_parallel === true,
      parsed_real_outputs: parsedRealOutputs,
      sequential_ms: sequentialMs,
      parallel_ms: parallelMs,
      speedup,
      claim_allowed: claimAllowed,
      confidence: selection.real_parallel ? 'medium' : 'low',
      read_only_guard: parallelRunAny.gate?.read_only_guard === true ? 'passed' : 'blocked',
      notes: [
        ...(selection.real_parallel ? [] : ['mock/static benchmarks cannot claim real speedup']),
        ...(canonicalArtifactsModified ? ['canonical scout artifacts changed during benchmark'] : [])
      ]
    };
    await writeJsonAtomic(path.join(dir, 'scout-benchmark.json'), result);
    const reportDir = path.join(root, '.sneakoscope', 'reports');
    await ensureDir(reportDir);
    await writeJsonAtomic(path.join(reportDir, 'scout-benchmark-summary.json'), {
      schema: 'sks.scout-benchmark-summary.v2',
      updated_at: new Date().toISOString(),
      latest: result
    });
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.log(`Scout benchmark: ${result.claim_allowed ? 'claim allowed' : 'claim not allowed'}`);
    return;
  }
}

async function resolveOrCreateScoutMission(root: any, missionArg: any, opts: any = {}) {
  const resolved = await resolveMissionId(root, missionArg);
  if (resolved) return { id: resolved, ...(await loadMission(root, resolved)), created: false };
  if (opts.strict) {
    throw new Error('No mission found for strict scout validation; strict mode never creates scout artifacts.');
  }
  if (!opts.mock && opts.action !== 'validate' && opts.action !== 'run' && opts.action !== 'plan') {
    throw new Error('No mission found. Use sks scouts run latest --engine local-static --mock --json to create a fixture mission.');
  }
  const created = await createMission(root, { mode: 'scouts', prompt: 'Five Scout fixture intake' });
  return { id: created.id, dir: created.dir, mission: created.mission, created: true };
}

async function inferScoutContext(root: any, id: any, opts: any = {}) {
  const dir = missionDir(root, id);
  const mission = await readJson(path.join(dir, 'mission.json'), {});
  const routeContext = await readJson(path.join(dir, 'route-context.json'), {});
  const state = await readJson(stateFile(root), {});
  const rawRoute = opts.route
    || routeContext.route_command
    || routeContext.command
    || state.route_command
    || modeToRoute(mission.mode || state.mode)
    || '$Team';
  const route = scoutRouteLabel(routePrompt(rawRoute)?.command || rawRoute);
  const task = opts.task || routeContext.task || mission.prompt || state.prompt || 'Five Scout fixture intake';
  return { route, task, policy: normalizeScoutPolicy(route, task, {}) };
}

function modeToRoute(mode: any = '') {
  const key = String(mode || '').toLowerCase();
  const map = {
    team: '$Team',
    qaloop: '$QA-LOOP',
    qa_loop: '$QA-LOOP',
    research: '$Research',
    autoresearch: '$AutoResearch',
    ppt: '$PPT',
    image_ux_review: '$Image-UX-Review',
    computer_use: '$Computer-Use',
    db: '$DB',
    gx: '$GX',
    goal: '$Goal',
    madsks: '$MAD-SKS',
    scouts: '$Team'
  };
  return (map as Record<string, string>)[key] || null;
}

function scoutsHelp() {
  console.log(`SKS Five-Scout Intake

Usage:
  sks scouts plan latest --json
  sks scouts run latest --engine auto --json
  sks scouts run latest --engine local-static --mock --json
  sks scouts run latest --engine codex-exec-parallel --require-output-schema --json
  sks scouts run latest --require-real-parallel --json
  sks scouts status latest --engine-runs --json
  sks scouts engines --json
  sks scouts bench latest --engine local-static --mock --json
  sks scouts consensus latest --json
  sks scouts handoff latest
  sks scouts validate latest --strict --json

Alias:
  sks scout run latest --json
`);
}

async function listScoutEngineRuns(dir: string) {
  const base = path.join(dir, 'scout-benchmarks');
  if (!(await exists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(base, entry.name);
    const engine = await readJson(path.join(runDir, 'scout-engine-result.json'), null);
    const gate = await readJson(path.join(runDir, 'scout-gate.json'), null);
    runs.push({
      engine_run_id: entry.name,
      artifacts_dir: runDir,
      artifact_namespace: `scout-benchmarks/${entry.name}`,
      engine: engine?.engine || gate?.engine || null,
      passed: gate?.passed === true,
      completed_scouts: gate?.completed_scouts || engine?.completed_scouts || 0,
      completed_at: engine?.completed_at || null
    });
  }
  return runs.sort((a: any, b: any) => String(b.completed_at || b.engine_run_id).localeCompare(String(a.completed_at || a.engine_run_id)));
}

async function canonicalScoutArtifactFingerprint(dir: string) {
  const files = [
    'scout-team-plan.json',
    'scout-parallel-ledger.jsonl',
    'scout-consensus.json',
    'scout-handoff.md',
    'scout-gate.json',
    'scout-engine-result.json',
    'scout-readonly-guard.json',
    'scout-performance.json',
    'scout-1-code-surface.json',
    'scout-2-verification.json',
    'scout-3-safety-db.json',
    'scout-4-visual-voxel.json',
    'scout-5-simplification-integration.json'
  ];
  const out: Record<string, any> = {};
  for (const file of files) {
    const absolute = path.join(dir, file);
    if (!(await exists(absolute))) {
      out[file] = null;
      continue;
    }
    out[file] = sha256(await readText(absolute, ''));
  }
  return out;
}
