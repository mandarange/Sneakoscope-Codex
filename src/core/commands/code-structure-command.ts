import { sksRoot } from '../fsx.js';
import { scanCodeStructure } from '../code-structure.js';
import { flag } from './command-utils.js';

export async function codeStructureCommand(sub: any, args: any = []) {
  const action = sub || 'scan';
  if (action !== 'scan') {
    console.error('Usage: sks code-structure scan [--json] [--all] [--changed [ref|file[,file]]] [--changed-since <ref>]');
    process.exitCode = 1;
    return;
  }
  const root = await sksRoot();
  const changedArg = valueAfter(args, '--changed');
  const changedSince = valueAfter(args, '--changed-since');
  const changedArgLooksLikeFiles = Boolean(changedArg && (
    changedArg.includes(',')
    || changedArg.includes('/')
    || changedArg.includes('\\')
    || /\.(js|ts|tsx|jsx|mjs|cjs|json|md|rs|toml)$/i.test(changedArg)
  ));
  const changedFiles = changedArg && changedArgLooksLikeFiles
    ? changedArg.split(',').map((file) => file.trim()).filter(Boolean)
    : [];
  const report = await scanCodeStructure(root, {
    includeOk: flag(args, '--all'),
    changed: flag(args, '--changed') ? (changedFiles.length ? true : changedArg || true) : false,
    changedSince,
    changedFiles
  });
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS Code Structure');
  if (report.changed_scope?.mode !== 'full') {
    console.log(`Changed scope: ${report.changed_scope.changed_files.length} files, ${report.changed_scope.net_lines} net lines`);
    console.log(`Lean semantic review: ${report.semantic_review?.status || 'unknown'}`);
  }
  for (const file of report.files.slice(0, 20)) console.log(`${file.status} ${file.line_count} ${file.path}`);
  if (report.remaining_risks.length) console.log(`Risks: ${report.remaining_risks.join(', ')}`);
  if (report.semantic_review?.findings?.length) {
    for (const finding of report.semantic_review.findings.slice(0, 8)) {
      console.log(`Lean ${finding.severity}: ${finding.file ? `${finding.file}: ` : ''}${finding.summary}`);
    }
  }
}

function valueAfter(args: any[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || String(value).startsWith('--')) return null;
  return String(value);
}
