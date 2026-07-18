import path from 'node:path';
import { ensureDir, nowIso, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { DEFAULT_EVAL_THRESHOLDS, compareEvaluationReports, runEvaluationBenchmark } from '../evaluation.js';
import { flag, positionalArgs, readFlagValue } from './command-utils.js';

export async function evalCommand(sub: any, args: any = []) {
  if (!sub || sub === 'help' || sub === '--help') {
    console.log('Usage: sks eval run [--json] [--out report.json] [--iterations N] | sks eval compare --baseline old.json --candidate new.json [--json]');
    return;
  }
  if (sub === 'thresholds') return console.log(JSON.stringify(DEFAULT_EVAL_THRESHOLDS, null, 2));
  const root = await sksRoot();
  if (sub === 'run') {
    const iterations = Number(readFlagValue(args, '--iterations', 200));
    const report = runEvaluationBenchmark({ iterations });
    const saved = await saveEvalReport(root, args, report, 'eval');
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: saved }, null, 2));
    printEvalRun(report, saved);
    return;
  }
  if (sub === 'compare') {
    const positional = positionalArgs(args);
    const baselinePath = readFlagValue(args, '--baseline', positional[0]);
    const candidatePath = readFlagValue(args, '--candidate', positional[1]);
    if (!baselinePath || !candidatePath) throw new Error('Usage: sks eval compare --baseline old.json --candidate new.json [--json]');
    const report = compareEvaluationReports(await readJson(path.resolve(baselinePath)), await readJson(path.resolve(candidatePath)));
    const saved = await saveEvalReport(root, args, report, 'eval-compare');
    if (flag(args, '--json')) return console.log(JSON.stringify({ ...report, report_path: saved }, null, 2));
    printEvalCompare(report, saved);
    return;
  }
  console.error('Usage: sks eval run|compare|thresholds');
  process.exitCode = 1;
}

async function saveEvalReport(root: any, args: any, report: any, prefix: any) {
  if (flag(args, '--no-save')) return null;
  const requested = readFlagValue(args, '--out', null);
  const file = requested ? path.resolve(requested) : path.join(root, '.sneakoscope', 'reports', `${prefix}-${nowIso().replace(/[:.]/g, '-')}.json`);
  await ensureDir(path.dirname(file));
  await writeJsonAtomic(file, report);
  return file;
}

function pct(x: any) {
  return `${(100 * x).toFixed(1)}%`;
}

function printSizeAndTokens(report: any, comparison: any) {
  const baselineSize = report.baseline.serialized_size_bytes;
  const candidateSize = report.candidate.serialized_size_bytes;
  if (baselineSize !== undefined && candidateSize !== undefined) {
    const delta = comparison.serialized_size_savings_pct;
    const suffix = delta === null || delta === undefined
      ? ''
      : delta >= 0 ? ` (${pct(delta)} smaller)` : ` (${pct(-delta)} larger)`;
    console.log(`JSON size: ${baselineSize} B -> ${candidateSize} B${suffix} (non-token proxy)`);
  }
  if (comparison.token_measurement?.available) {
    console.log(`Tokens:    ${report.baseline.token_count} -> ${report.candidate.token_count} (${pct(comparison.token_savings_pct)} saved)`);
  } else {
    console.log('Tokens:    not measured (actual token counts with evidence required)');
  }
}

function printEvalRun(report: any, saved: any) {
  const c = report.comparison;
  console.log('Sneakoscope Eval');
  console.log(`Scenario:  ${report.scenario.id}`);
  printSizeAndTokens(report, c);
  console.log(`Accuracy:  ${report.baseline.quality.accuracy_proxy} -> ${report.candidate.quality.accuracy_proxy} (${c.accuracy_delta >= 0 ? '+' : ''}${c.accuracy_delta})`);
  console.log(`Meaningful improvement: ${c.meaningful_improvement ? 'yes' : 'no'}`);
  if (saved) console.log(`Report:    ${saved}`);
}

function printEvalCompare(report: any, saved: any) {
  const c = report.comparison;
  console.log('Sneakoscope Eval Compare');
  console.log(`Baseline:  ${report.baseline_label}`);
  console.log(`Candidate: ${report.candidate_label}`);
  printSizeAndTokens(report, c);
  console.log(`Accuracy:  ${report.baseline.quality.accuracy_proxy} -> ${report.candidate.quality.accuracy_proxy} (${c.accuracy_delta >= 0 ? '+' : ''}${c.accuracy_delta})`);
  console.log(`Meaningful improvement: ${c.meaningful_improvement ? 'yes' : 'no'}`);
  if (saved) console.log(`Report:    ${saved}`);
}
