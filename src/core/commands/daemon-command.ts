import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { projectRoot } from '../fsx.js';
import { runSksdClient } from '../daemon/sksd-client.js';

export async function daemonCommand(args: string[] = []): Promise<unknown> {
  const root = await projectRoot();
  const action = args[0] === 'warm' || args[0] === 'stop' || args[0] === 'status' ? args[0] : 'status';
  const state = runSksdClient(root, action);
  if (flag(args, '--json')) return printJson(state);
  console.log(JSON.stringify(state, null, 2));
  return state;
}
