import { sksRoot } from '../fsx.js';
import { scanCodeStructure } from '../code-structure.js';
import { flag } from './command-utils.js';

export async function codeStructureCommand(sub: any, args: any = []) {
  const action = sub || 'scan';
  if (action !== 'scan') {
    console.error('Usage: sks code-structure scan [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  const report = await scanCodeStructure(root, { includeOk: flag(args, '--all') });
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Code Structure');
  for (const file of report.files.slice(0, 20)) console.log(`${file.status} ${file.line_count} ${file.path}`);
  if (report.remaining_risks.length) console.log(`Risks: ${report.remaining_risks.join(', ')}`);
}
