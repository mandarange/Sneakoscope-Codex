import { imageVoxelSummary } from './image-voxel-ledger.mjs';

export async function imageVoxelProofEvidence(root, ledgerFile) {
  const summary = await imageVoxelSummary(root, ledgerFile);
  return {
    schema: 'sks.image-voxel-proof-link.v1',
    ok: summary.ok,
    evidence: {
      image_voxels: summary
    }
  };
}
