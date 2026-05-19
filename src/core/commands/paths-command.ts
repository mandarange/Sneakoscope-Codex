import { projectRoot } from '../fsx.js';
import { managedPathManifest } from '../managed-paths.js';
import { ensureGitPolicy, defaultSharedMemoryManifest } from '../git-hygiene/git-policy.js';
import { flag } from './command-utils.js';

export async function pathsCommand(args: any = []) {
  const action = args[0] || 'managed';
  if (action !== 'managed' && action !== 'git-policy') {
    console.error('Usage: sks paths managed|git-policy [--json]');
    process.exitCode = 2;
    return;
  }
  const root = await projectRoot();
  if (action === 'git-policy') {
    const policy = await ensureGitPolicy(root, { write: flag(args, '--write') });
    const manifest = defaultSharedMemoryManifest(policy);
    const result = { schema: 'sks.paths-git-policy.v1', root, policy, manifest };
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS git policy paths');
    for (const row of manifest.shared_memory_plane) console.log(`- tracked ${row.path}`);
    for (const row of manifest.generated_indexes) console.log(`- ignored ${row.path}`);
    return;
  }
  const manifest = await managedPathManifest(root);
  if (flag(args, '--json')) return console.log(JSON.stringify({ ...manifest, root }, null, 2));
  console.log('SKS managed paths');
  for (const row of manifest.paths || []) console.log(`- ${row.path} (${row.rollback ? 'rollback' : 'preserve'})`);
}
