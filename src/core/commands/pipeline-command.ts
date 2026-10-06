import fsp from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, readJson, readStdin } from '../fsx.js';
import { isClarificationAwaiting } from '../clarification-gate-state.js';
import { listSessionStates, loadMission, loadOwnedRouteState, missionDir, setCurrent } from '../mission.js';
import { PIPELINE_PLAN_ARTIFACT, pipelinePlanState, projectGateStatus, sealRouteClarification, writePipelinePlan } from '../pipeline.js';
import { routePrompt } from '../routes.js';
import { positionalArgs } from '../../cli/args.js';
import { flag, readFlagValue, resolveMissionId } from './command-utils.js';
import { narutoUsesCurrentSession } from '../subagents/naruto-execution-mode.js';

export async function pipelineCommand(args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const sessionKey = narutoUsesCurrentSession() ? process.env.CODEX_THREAD_ID : '';
  const state = await loadOwnedRouteState(root, sessionKey);
  const sessions = await listSessionStates(root);
  if (action === 'status') {
    const result = { schema: 'sks.pipeline-status.v1', ok: true, state, sessions: sessions.map(sessionStatusRow) };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Pipeline: ${state.mission_id || 'none'} ${state.route_command || state.mode || ''}`.trim());
    printSessionTable(sessions);
    return;
  }
  if (action === 'plan') {
    if (hasAgentPlanFlags(args)) {
      const positionals = positionalArgs(args.slice(1));
      const missionArg = positionals[0] || state.mission_id || 'latest';
      const id = await resolveMissionId(root, missionArg);
      if (!id) throw new Error('No mission found for pipeline plan.');
      const dir = missionDir(root, id);
      const mission = await readJson(path.join(dir, 'mission.json'), {});
      const routeContext = await readJson(path.join(dir, 'route-context.json'), {});
      const rawRoute = readFlagValue(args, '--route', null) || routeContext.command || state.route_command || routeContext.route || state.route || '$Naruto';
      const route = routePrompt(rawRoute);
      const agentsFlag = readFlagValue(args, '--agents', null);
      const agents = {
        count: agentsFlag ? Number(agentsFlag) : undefined,
        force: flag(args, '--force-agents'),
        noAgents: flag(args, '--no-agents')
      };
      const plan = await writePipelinePlan(dir, {
        missionId: id,
        route,
        task: routeContext.task || mission.prompt || state.prompt || '',
        required: Boolean(routeContext.context7_required || state.context7_required),
        ambiguity: { required: true, auto_sealed: true, status: 'auto_sealed' },
        agents
      });
      // Re-planning the active mission re-seeds engineering-sanity-review.json
      // against a freshly resolved changed-scope base; the route state has to
      // follow the plan or the Stop gate would validate against a stale base.
      if (id === state.mission_id) {
        await setCurrent(root, { mission_id: id, ...pipelinePlanState(plan) }, { sessionKey: state._session_key });
      }
      if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.pipeline-plan.v1', ok: true, mission_id: id, plan }, null, 2));
      console.log(`Pipeline plan written: .sneakoscope/missions/${id}/${PIPELINE_PLAN_ARTIFACT}`);
      return;
    }
    const result = await projectGateStatus(root, state);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Pipeline gate: ${result.ok ? 'pass' : 'blocked'}`);
    return;
  }
  if (action === 'answer') return pipelineAnswer(root, state, args.slice(1));
  console.error('Usage: sks pipeline status|plan|answer [--json]');
  process.exitCode = 1;
}

const ANSWER_USAGE = 'Usage: sks pipeline answer <mission-id|latest> (--stdin | <answers.json>) [--json]';

// Seals a route paused at its ambiguity gate with the user's answers, the one
// action that gate allows. Answers overlay the inferred defaults for each slot.
async function pipelineAnswer(root: any, state: any, args: any = []) {
  const json = flag(args, '--json');
  const positionals = positionalArgs(args);
  const id = await resolveMissionId(root, positionals[0] || state.mission_id || 'latest');
  const source = flag(args, '--stdin') ? 'stdin' : positionals[1] || null;
  if (!id || !source) throw new Error(ANSWER_USAGE);
  const raw = source === 'stdin' ? await readStdin() : await fsp.readFile(path.resolve(source), 'utf8');
  let answers: any;
  try {
    answers = JSON.parse(raw);
  } catch {
    answers = null;
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return answerFailure(json, { mission_id: id, reason: 'answers_not_a_json_object' }, 'Answers must be a JSON object keyed by slot id.');
  }
  if (id !== state.mission_id || !isClarificationAwaiting(state)) {
    return answerFailure(json, { mission_id: id, reason: 'mission_not_awaiting_answers' }, `Mission ${id} is not paused at its ambiguity gate; nothing to answer.`);
  }
  const { dir, mission } = await loadMission(root, id);
  const schema = await readJson(path.join(dir, 'required-answers.schema.json'), null);
  if (!Array.isArray(schema?.slots)) return answerFailure(json, { mission_id: id, reason: 'answer_schema_missing' }, `Mission ${id} has no required-answers.schema.json.`);
  const routeContext = await readJson(path.join(dir, 'route-context.json'), {});
  const routeCommand = routeContext.command || state.route_command;
  if (!routeCommand) return answerFailure(json, { mission_id: id, reason: 'route_unknown' }, `Mission ${id} records no route to resume.`);
  const route = routePrompt(routeCommand);
  const { result, materialized } = await sealRouteClarification(root, {
    id,
    dir,
    mission,
    route,
    routeContext,
    task: routeContext.task || mission.prompt || '',
    required: Boolean(routeContext.context7_required),
    answers,
    sessionKey: state._session_key || null
  });
  if (!result.ok) {
    return answerFailure(json, { mission_id: id, reason: 'answer_validation_failed', validation: result.validation }, `Answers failed validation; ${route.command} stays paused.\n${JSON.stringify(result.validation?.errors || [], null, 2)}`);
  }
  const phase = materialized.phase || `${route.mode}_CLARIFICATION_CONTRACT_SEALED`;
  if (json) return console.log(JSON.stringify({ schema: 'sks.pipeline-answer.v1', ok: true, mission_id: id, route: route.command, phase, contract_hash: result.contract?.sealed_hash || null }, null, 2));
  console.log(`Contract sealed for ${route.command} (${id}); route resumes at ${phase}.`);
}

function answerFailure(json: boolean, result: any, message: string) {
  process.exitCode = 2;
  if (json) return console.log(JSON.stringify({ schema: 'sks.pipeline-answer.v1', ok: false, ...result }, null, 2));
  console.error(message);
}

function sessionStatusRow(row: any) {
  return {
    session_key: row.session_key,
    mission_id: row.mission_id,
    route: row.state?.route_command || row.state?.route || row.state?.mode || null,
    phase: row.phase,
    updated_at: row.updated_at
  };
}

function printSessionTable(sessions: any[] = []) {
  if (!sessions.length) return;
  console.log('Sessions:');
  for (const row of sessions.slice(0, 12).map(sessionStatusRow)) {
    console.log(`  ${row.session_key}  ${row.mission_id || 'none'}  ${row.route || '-'}  ${row.phase || '-'}`);
  }
}

function hasAgentPlanFlags(args: any = []) {
  return flag(args, '--force-agents') || flag(args, '--no-agents') || args.includes('--agents');
}
