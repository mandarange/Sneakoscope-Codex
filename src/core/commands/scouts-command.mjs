import path from 'node:path';
import { exists, projectRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { createMission, loadMission, missionDir, setCurrent, stateFile } from '../mission.mjs';
import { routePrompt } from '../routes.mjs';
import { buildScoutTeamPlan, normalizeScoutPolicy, routeRequiresScoutIntake, scoutRouteLabel } from '../scouts/scout-plan.mjs';
import { readScoutGateStatus, readScoutResults } from '../scouts/scout-gate.mjs';
import { runFiveScoutIntake } from '../scouts/scout-runner.mjs';
import { readScoutProofEvidence } from '../scouts/scout-proof-evidence.mjs';
import { SCOUT_COUNT } from '../scouts/scout-schema.mjs';
import { flag, readFlagValue, resolveMissionId } from './command-utils.mjs';

const ACTIONS = new Set(['plan', 'run', 'status', 'consensus', 'handoff', 'validate', 'help', '--help', '-h']);

export async function scoutsCommand(args = []) {
  const root = await projectRoot();
  const action = ACTIONS.has(args[0]) ? args[0] : 'status';
  const actionArgs = ACTIONS.has(args[0]) ? args.slice(1) : args;
  if (action === 'help' || action === '--help' || action === '-h') return scoutsHelp();
  const json = flag(actionArgs, '--json');
  const mock = flag(actionArgs, '--mock');
  const force = flag(actionArgs, '--force-scouts') || flag(actionArgs, '--force');
  const noScouts = flag(actionArgs, '--no-scouts');
  const missionArg = actionArgs.find((arg) => !String(arg).startsWith('--')) || 'latest';
  const { id, dir, mission, created } = await resolveOrCreateScoutMission(root, missionArg, { mock, action });
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
      completed_scouts: results.filter((row) => row.status === 'done').length,
      gate: gate.gate,
      missing: gate.missing
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
    if (!gate.ok && !flag(actionArgs, '--strict')) {
      const run = await runFiveScoutIntake(root, {
        missionId: id,
        route: context.route,
        task: context.task,
        mode: 'validate-fixture',
        parallel: true,
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
    if (json) return console.log(JSON.stringify(result, null, 2));
    console.log(`Scout validation: ${result.ok ? 'pass' : 'blocked'}`);
    return;
  }
}

async function resolveOrCreateScoutMission(root, missionArg, opts = {}) {
  const resolved = await resolveMissionId(root, missionArg);
  if (resolved) return { id: resolved, ...(await loadMission(root, resolved)), created: false };
  if (!opts.mock && opts.action !== 'validate' && opts.action !== 'run' && opts.action !== 'plan') {
    throw new Error('No mission found. Use sks scouts run latest --mock --json to create a fixture mission.');
  }
  const created = await createMission(root, { mode: 'scouts', prompt: 'Five Scout fixture intake' });
  return { id: created.id, dir: created.dir, mission: created.mission, created: true };
}

async function inferScoutContext(root, id, opts = {}) {
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

function modeToRoute(mode = '') {
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
  return map[key] || null;
}

function scoutsHelp() {
  console.log(`SKS Five-Scout Intake

Usage:
  sks scouts plan latest --json
  sks scouts run latest --mock --json
  sks scouts status latest --json
  sks scouts consensus latest --json
  sks scouts handoff latest
  sks scouts validate latest --json

Alias:
  sks scout run latest --json
`);
}
