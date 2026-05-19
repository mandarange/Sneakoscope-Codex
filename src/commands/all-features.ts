import { allFeaturesCommand } from '../cli/feature-commands.js';

export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return allFeaturesCommand(sub, rest);
}
