// @ts-nocheck
import { allFeaturesCommand } from '../cli/feature-commands.js';

export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return allFeaturesCommand(sub, rest);
}
