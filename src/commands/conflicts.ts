import { projectRoot } from '../core/fsx.js';
import {
  cleanupOtherHarnessConflicts,
  formatHarnessConflictReport,
  llmHarnessCleanupPrompt,
  scanHarnessConflicts
} from '../core/harness-conflicts.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';

export async function run(_command: any, args: any = []) {
  const action = args[0] || 'check';
  const root = await projectRoot();
  if (action === 'cleanup') {
    if (!flag(args, '--yes') && !flag(args, '--json')) {
      process.exitCode = 1;
      console.error('Refusing cleanup without --yes. Re-run: sks conflicts cleanup --yes');
      return { ok: false, status: 'confirmation_required' };
    }
    const cleanup = await cleanupOtherHarnessConflicts(root);
    if (flag(args, '--json')) return printJson(cleanup);
    console.log(cleanup.ok
      ? `Quarantined ${cleanup.cleaned.length} OMX/DCodex conflict(s).`
      : `Cleanup incomplete: ${cleanup.remaining.length} conflict(s) remain.`);
    for (const row of cleanup.cleaned) console.log(`- ${row.action}: ${row.path}`);
    for (const row of cleanup.errors) console.error(`- error: ${row.path}: ${row.error}`);
    if (!cleanup.ok) process.exitCode = 1;
    return cleanup;
  }

  const scan = await scanHarnessConflicts(root);
  const result = { ...scan, cleanup_prompt: scan.hard_block ? llmHarnessCleanupPrompt(scan) : null };
  if (flag(args, '--json')) return printJson(result);
  if (action === 'prompt') return console.log(result.cleanup_prompt || '');
  console.log(formatHarnessConflictReport(scan));
  if (scan.hard_block) {
    console.log('\nAutomatic cleanup: sks conflicts cleanup --yes');
    process.exitCode = 1;
  }
}
