import path from 'node:path';
import { packageRoot, readJson, runProcess, which } from '../fsx.mjs';
import { imageVoxelSummary } from '../wiki-image/image-voxel-ledger.mjs';

export async function collectProofEvidence(root = packageRoot()) {
  return {
    files: await collectGitFileChanges(root),
    image_voxels: await imageVoxelSummary(root).catch(() => null),
    triwiki: await readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null).then((pack) => pack ? {
      status: 'present',
      schema: pack.schema || null,
      claims: pack.trust_summary?.claims || pack.wiki?.a?.length || 0
    } : null).catch(() => null)
  };
}

async function collectGitFileChanges(root) {
  const git = await which('git').catch(() => null);
  if (!git) return [];
  const result = await runProcess(git, ['status', '--short'], { cwd: root, timeoutMs: 5000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  if (!result || result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => ({
    status: line.slice(0, 2).trim() || 'changed',
    path: line.slice(3).trim()
  }));
}
