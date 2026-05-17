import { simpleGitCommitCommand } from '../core/git-simple.mjs';

export async function run(_command, args = []) {
  return simpleGitCommitCommand(args, { push: false });
}
