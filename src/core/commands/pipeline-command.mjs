import path from 'node:path';
import { projectRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { missionDir, stateFile } from '../mission.mjs';
import { buildPipelinePlan, PIPELINE_PLAN_ARTIFACT, projectGateStatus } from '../pipeline.mjs';
import { routePrompt } from '../routes.mjs';
import { flag, positionalArgs, readFlagValue, resolveMissionId } from './command-utils.mjs';

export async function pipelineCommand(args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const state = await readJson(stateFile(root), {});
  if (action === 'status') {
    const result = { schema: 'sks.pipeline-status.v1', ok: true, state };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Pipeline: ${state.mission_id || 'none'} ${state.route_command || state.mode || ''}`.trim());
    return;
  }
  if (action === 'plan') {
    if (hasScoutPlanFlags(args)) {
      const positionals = positionalArgs(args.slice(1));
      const missionArg = positionals[0] || state.mission_id || 'latest';
      const id = await resolveMissionId(root, missionArg);
      if (!id) throw new Error('No mission found for pipeline plan.');
      const dir = missionDir(root, id);
      const mission = await readJson(path.join(dir, 'mission.json'), {});
      const routeContext = await readJson(path.join(dir, 'route-context.json'), {});
      const rawRoute = readFlagValue(args, '--route', null) || routeContext.command || state.route_command || routeContext.route || state.route || '$Team';
      const route = routePrompt(rawRoute);
      const scoutsFlag = readFlagValue(args, '--scouts', null);
      const scouts = {
        count: scoutsFlag ? Number(scoutsFlag) : undefined,
        force: flag(args, '--force-scouts'),
        noScouts: flag(args, '--no-scouts')
      };
      const plan = buildPipelinePlan({
        missionId: id,
        route,
        task: routeContext.task || mission.prompt || state.prompt || '',
        required: Boolean(routeContext.context7_required || state.context7_required),
        scouts
      });
      await writeJsonAtomic(path.join(dir, PIPELINE_PLAN_ARTIFACT), plan);
      if (flag(args, '--json')) return console.log(JSON.stringify({ schema: 'sks.pipeline-plan.v1', ok: true, mission_id: id, plan }, null, 2));
      console.log(`Pipeline plan written: .sneakoscope/missions/${id}/${PIPELINE_PLAN_ARTIFACT}`);
      return;
    }
    const result = await projectGateStatus(root, state);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log(`Pipeline gate: ${result.ok ? 'pass' : 'blocked'}`);
    return;
  }
  console.error('Usage: sks pipeline status|plan [--json]');
  process.exitCode = 1;
}

function hasScoutPlanFlags(args = []) {
  return flag(args, '--force-scouts') || flag(args, '--no-scouts') || args.includes('--scouts');
}
