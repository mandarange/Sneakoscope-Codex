import { PACKAGE_VERSION, nowIso } from '../fsx.mjs';

export const IMAGE_VOXEL_LEDGER_SCHEMA = 'sks.image-voxel-ledger.v1';

export function emptyImageVoxelLedger(overrides = {}) {
  return {
    schema: IMAGE_VOXEL_LEDGER_SCHEMA,
    version: PACKAGE_VERSION,
    generated_at: nowIso(),
    mission_id: null,
    images: [],
    anchors: [],
    relations: [],
    ...overrides
  };
}
