import { featuresCommand } from '../cli/feature-commands.mjs';

export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return featuresCommand(sub, rest);
}
