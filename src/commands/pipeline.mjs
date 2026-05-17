import { projectRoot, readJson } from '../core/fsx.mjs';
import { stateFile } from '../core/mission.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
import { projectGateStatus } from '../core/pipeline.mjs';

export async function run(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const state = await readJson(stateFile(root), {});
  if (action === 'status') {
    const result = { schema: 'sks.pipeline-status.v1', ok: true, state };
    if (flag(args, '--json')) return printJson(result);
    console.log(`Pipeline: ${state.mission_id || 'none'} ${state.route_command || state.mode || ''}`.trim());
    return;
  }
  if (action === 'plan') {
    const result = await projectGateStatus(root, state);
    if (flag(args, '--json')) return printJson(result);
    console.log(`Pipeline gate: ${result.ok ? 'pass' : 'blocked'}`);
    return;
  }
  console.error('Usage: sks pipeline status|plan [--json]');
  process.exitCode = 1;
}
