import path from 'node:path';
import { packageRoot, readJson, runProcess, which } from '../fsx.mjs';
import { codexLbMetrics, readCodexLbCircuit } from '../codex-lb-circuit.mjs';
import { imageVoxelSummary } from '../wiki-image/image-voxel-ledger.mjs';

export async function collectProofEvidence(root = packageRoot()) {
  return {
    files: await collectGitFileChanges(root),
    image_voxels: await imageVoxelSummary(root).catch(() => null),
    triwiki: await readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null).then((pack) => pack ? {
      status: 'present',
      schema: pack.schema || null,
      claims: pack.trust_summary?.claims || pack.wiki?.a?.length || 0
    } : null).catch(() => null),
    codex_lb: await readCodexLbCircuit(root).then((circuit) => codexLbMetrics(circuit)).catch(() => null),
    db_safety: await readJson(path.join(root, '.sneakoscope', 'db-safety.json'), null).then((policy) => policy ? {
      status: 'present',
      mode: policy.mode || null,
      destructive_operations: policy.destructive_operations || null
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
