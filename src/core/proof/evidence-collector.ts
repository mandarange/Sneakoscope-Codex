import path from 'node:path';
import { packageRoot, readJson, runProcess, which } from '../fsx.js';
import { codexLbMetrics, readCodexLbCircuit } from '../codex-lb-circuit.js';
import { imageVoxelSummary } from '../wiki-image/image-voxel-ledger.js';
import { wrongnessProofEvidence } from '../triwiki-wrongness/wrongness-proof-linker.js';

export async function collectProofEvidence(root: any = packageRoot()) {
  /* intentional: each field below is optional supplementary evidence for the proof report — a missing/unreadable source just omits that field rather than failing the whole collection */
  return {
    files: await collectGitFileChanges(root),
    image_voxels: await imageVoxelSummary(root).catch(() => null),
    wrongness: await wrongnessProofEvidence(root, null).catch(() => null),
    triwiki: await readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null).then((pack: any) => pack ? {
      status: 'present',
      schema: pack.schema || null,
      claims: pack.trust_summary?.claims || pack.wiki?.a?.length || 0
    } : null).catch(() => null),
    codex_lb: await readCodexLbCircuit(root).then((circuit: any) => codexLbMetrics(circuit)).catch(() => null),
    db_safety: await readJson(path.join(root, '.sneakoscope', 'db-safety.json'), null).then((policy: any) => policy ? {
      status: 'present',
      mode: policy.mode || null,
      destructive_operations: policy.destructive_operations || null
    } : null).catch(() => null)
  };
}

async function collectGitFileChanges(root: any) {
  /* intentional: git absent or the status call failing just means no file-change evidence is available, not a collection error */
  const git = await which('git').catch(() => null);
  if (!git) return [];
  const result = await runProcess(git, ['status', '--short'], { cwd: root, timeoutMs: 5000, maxOutputBytes: 64 * 1024 }).catch(() => null);
  if (!result || result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line: any) => ({
    status: line.slice(0, 2).trim() || 'changed',
    path: line.slice(3).trim()
  }));
}
