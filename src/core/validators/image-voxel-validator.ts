import { isImageVoxelLedger, type ImageVoxelLedger } from '../wiki-image/image-voxel-schema.js';
import { ValidationError } from './validation-error.js';

export function parseImageVoxelLedger(value: unknown): ImageVoxelLedger {
  if (!isImageVoxelLedger(value)) throw new ValidationError('sks.image-voxel-ledger.v1');
  return value;
}
