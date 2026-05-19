import { autoReviewCommand } from '../core/commands/basic-cli.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'status', ...rest] = args;
  return autoReviewCommand(sub, rest);
}
