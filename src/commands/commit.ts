// @ts-nocheck
import { simpleGitCommitCommand } from '../core/git-simple.js';

export async function run(_command, args = []) {
  return simpleGitCommitCommand(args, { push: false });
}
