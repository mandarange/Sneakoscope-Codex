import path from 'node:path';
import { sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { runPerfBench, runWorkflowPerfBench } from '../perf-bench.mjs';
import { flag, positionalArgs, readFlagValue } from './command-utils.mjs';

export async function perfCommand(sub, args = []) {
  if (!['run', 'workflow'].includes(sub)) {
    console.error('Usage: sks perf run|workflow [--json] [--iterations N] [--intent "task"] [--changed file1,file2]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  if (sub === 'workflow') {
    const changedRaw = readFlagValue(args, '--changed', null);
    const report = await runWorkflowPerfBench(root, { iterations: readFlagValue(args, '--iterations', 3), intent: readFlagValue(args, '--intent', positionalArgs(args).join(' ')), changedFiles: changedRaw ? changedRaw.split(',').filter(Boolean) : undefined });
    const outPath = path.join(root, '.sneakoscope', 'reports', `workflow-perf-${Date.now()}.json`);
    await writeJsonAtomic(outPath, report);
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: outPath }, null, 2));
    console.log('SKS Workflow Performance');
    console.log(`Mode: ${report.metrics.decision_mode}`);
    console.log(`Fast lane: ${report.metrics.fast_lane_eligible ? 'yes' : 'no'}`);
    console.log(`Report: ${path.relative(root, outPath)}`);
    return;
  }
  const report = await runPerfBench(root, { iterations: readFlagValue(args, '--iterations', 3) });
  const outPath = path.join(root, '.sneakoscope', 'reports', `perf-${Date.now()}.json`);
  await writeJsonAtomic(outPath, report);
  if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: outPath }, null, 2));
  console.log('SKS Performance');
  console.log(`CLI startup p95: ${report.metrics.cli_startup_ms_p95}ms`);
  console.log(`Package size: ${report.metrics.package_size_kb}KB`);
  console.log(`Report: ${path.relative(root, outPath)}`);
}
