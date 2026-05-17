import { dirSize, formatBytes, packageRoot, sksRoot } from '../fsx.mjs';
import { enforceRetention, storageReport } from '../retention.mjs';
import { flag } from './command-utils.mjs';

export async function memoryCommand(_sub, args = []) {
  return gcCommand(args || []);
}

export async function gcCommand(args = []) {
  const root = await sksRoot();
  const res = await enforceRetention(root, { dryRun: flag(args, '--dry-run') });
  if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
  console.log(flag(args, '--dry-run') ? 'ㅅㅋㅅ GC dry run' : 'ㅅㅋㅅ GC completed');
  console.log(`Storage: ${res.report.total_human || '0 B'}`);
  console.log(`Actions: ${res.actions.length}`);
  for (const a of res.actions.slice(0, 20)) console.log(`- ${a.action} ${a.path || a.mission || ''} ${a.bytes ? formatBytes(a.bytes) : ''}`);
}

export async function statsCommand(args = []) {
  const root = await sksRoot();
  const report = await storageReport(root);
  const pkgBytes = await dirSize(packageRoot()).catch(() => 0);
  const out = { package: { bytes: pkgBytes, human: formatBytes(pkgBytes) }, storage: report };
  if (flag(args, '--json')) return console.log(JSON.stringify(out, null, 2));
  console.log('ㅅㅋㅅ Stats');
  console.log(`Package: ${out.package.human}`);
  console.log(`State:   ${report.total_human || '0 B'}`);
}
