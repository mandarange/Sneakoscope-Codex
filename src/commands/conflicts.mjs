import { projectRoot } from '../core/fsx.mjs';
import { formatHarnessConflictReport, llmHarnessCleanupPrompt, scanHarnessConflicts } from '../core/harness-conflicts.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
export async function run(_command, args = []) {
  const action = args[0] || 'check';
  const scan = await scanHarnessConflicts(await projectRoot());
  const result = { ...scan, cleanup_prompt: scan.hard_block ? llmHarnessCleanupPrompt(scan) : null };
  if (flag(args, '--json')) return printJson(result);
  if (action === 'prompt') return console.log(result.cleanup_prompt || '');
  console.log(formatHarnessConflictReport(scan));
  if (scan.hard_block) process.exitCode = 1;
}
