// @ts-nocheck
import { autoReviewCommand } from '../core/commands/basic-cli.js';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return autoReviewCommand(sub, rest);
}
