import path from 'node:path';
import { sksRoot } from '../fsx.mjs';
import { writeProofFieldReport } from '../proof-field.mjs';
import { flag, positionalArgs, readFlagValue } from './command-utils.mjs';

export async function proofFieldCommand(sub, args = []) {
  const action = sub || 'scan';
  if (!['scan', 'help', '--help'].includes(action)) {
    console.error('Usage: sks proof-field scan [--json] [--intent "task"] [--changed file1,file2]');
    process.exitCode = 1;
    return;
  }
  if (action === 'help' || action === '--help') {
    console.log('Usage: sks proof-field scan [--json] [--intent "task"] [--changed file1,file2]');
    return;
  }
  const root = await sksRoot();
  const changedRaw = readFlagValue(args, '--changed', null);
  const report = await writeProofFieldReport(root, { intent: readFlagValue(args, '--intent', positionalArgs(args).join(' ')), changedFiles: changedRaw ? changedRaw.split(',').filter(Boolean) : undefined });
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Proof Field');
  console.log(`Mode: ${report.fast_lane_decision.mode}`);
  console.log(`Eligible: ${report.fast_lane_decision.eligible ? 'yes' : 'no'}`);
  console.log(`Contract clarity: ${report.contract_clarity.score}${report.contract_clarity.ask_recommended ? ' (ask recommended)' : ''}`);
  console.log(`Workflow complexity: ${report.workflow_complexity.band} (${report.workflow_complexity.score})`);
  console.log(`Verification: ${report.fast_lane_decision.verification.join('; ')}`);
  console.log(`Report: ${path.relative(root, report.report_path)}`);
}
