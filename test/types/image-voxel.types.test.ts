import {
  IMAGE_VOXEL_LEDGER_SCHEMA,
  isImageVoxelLedger,
  type ImageVoxelLedger
} from '../../src/core/wiki-image/image-voxel-schema.js';

const ledger: ImageVoxelLedger = {
  schema: IMAGE_VOXEL_LEDGER_SCHEMA,
  images: [{ id: 'image-001', path: 'test/fixtures/images/one-by-one.png', sha256: null, width: 1, height: 1 }],
  anchors: [{ id: 'anchor-001', image_id: 'image-001', bbox: [0, 0, 1, 1], label: 'pixel' }],
  relations: []
};

const guardResult: boolean = isImageVoxelLedger(ledger);

void guardResult;
