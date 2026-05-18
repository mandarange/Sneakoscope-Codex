export const IMAGE_VOXEL_LEDGER_SCHEMA = 'sks.image-voxel-ledger.v1' as const;

export interface ImageVoxelImage {
  id: string;
  path: string;
  sha256: string | null;
  width?: number;
  height?: number;
}

export interface ImageVoxelAnchor {
  id: string;
  image_id: string;
  bbox: [number, number, number, number];
  label?: string;
}

export interface ImageVoxelLedger {
  schema: typeof IMAGE_VOXEL_LEDGER_SCHEMA;
  images: ImageVoxelImage[];
  anchors: ImageVoxelAnchor[];
  relations: unknown[];
}

export function isImageVoxelLedger(value: unknown): value is ImageVoxelLedger {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as Partial<ImageVoxelLedger>;
  return ledger.schema === IMAGE_VOXEL_LEDGER_SCHEMA
    && Array.isArray(ledger.images)
    && Array.isArray(ledger.anchors)
    && Array.isArray(ledger.relations);
}
