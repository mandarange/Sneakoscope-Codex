// @ts-nocheck
import { projectRoot } from '../fsx.js';
import { managedPathManifest } from '../managed-paths.js';
import { flag } from './command-utils.js';

export async function pathsCommand(args = []) {
  const action = args[0] || 'managed';
  if (action !== 'managed') {
    console.error('Usage: sks paths managed [--json]');
    process.exitCode = 2;
    return;
  }
  const root = await projectRoot();
  const manifest = await managedPathManifest(root);
  if (flag(args, '--json')) return console.log(JSON.stringify({ ...manifest, root }, null, 2));
  console.log('SKS managed paths');
  for (const row of manifest.paths || []) console.log(`- ${row.path} (${row.rollback ? 'rollback' : 'preserve'})`);
}
