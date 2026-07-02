import { readJson, sksRoot } from '../fsx.js';
import { closeRouteState, stateFile } from '../mission.js';

export async function routeCommand(subcommand = 'status', args: string[] = []) {
  const json = args.includes('--json');
  const root = await sksRoot();
  if (subcommand === 'status') {
    const state = await readJson(stateFile(root), {}).catch(() => ({}));
    const result = {
      schema: 'sks.route-command.v1',
      ok: true,
      status: 'status',
      root,
      active: Boolean(state?.mission_id && state.route_closed !== true),
      mission_id: state?.mission_id || null,
      route: state?.route || state?.route_command || state?.mode || null,
      phase: state?.phase || null,
      route_closed: state?.route_closed === true
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`route status: ${result.active ? 'active' : 'inactive'}${result.mission_id ? ` ${result.mission_id}` : ''}`);
    return result;
  }
  if (subcommand !== 'close') {
    const result = {
      schema: 'sks.route-command.v1',
      ok: false,
      status: 'unknown_subcommand',
      subcommand,
      usage: 'sks route close --mission <id> [--json]'
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.error(result.usage);
    process.exitCode = 1;
    return result;
  }

  const missionId = readOption(args, '--mission');
  const sessionKey = readOption(args, '--session');
  const result = await closeRouteState(root, {
    ...(missionId ? { missionId } : {}),
    ...(sessionKey ? { sessionKey } : {}),
    reason: 'sks_route_close'
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`route close: ${result.status}${result.mission_id ? ` ${result.mission_id}` : ''}`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}
