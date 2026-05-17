import { sksRoot } from '../fsx.mjs';
import { harnessGrowthReport, writeHarnessGrowthReport } from '../evaluation.mjs';
import { flag } from './command-utils.mjs';

export async function harnessCommand(sub, args = []) {
  const action = sub || 'fixture';
  if (!['fixture', 'review'].includes(action)) {
    console.error('Usage: sks harness fixture|review [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  const report = action === 'review' ? await writeHarnessGrowthReport(root, `${root}/.sneakoscope/reports`, {}) : harnessGrowthReport({});
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Harness Growth');
  console.log(`Forgetting fixture: ${report.forgetting.fixture.passed ? 'pass' : 'fail'}`);
}
