import { simpleGitCommitCommand } from '../core/git-simple.js';

export async function run(_command: any, args: any = []) {
  return simpleGitCommitCommand(args, { push: false });
}
