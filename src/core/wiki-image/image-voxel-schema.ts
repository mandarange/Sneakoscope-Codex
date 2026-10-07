import { PACKAGE_VERSION, nowIso } from '../fsx.js';

export const IMAGE_VOXEL_LEDGER_SCHEMA = 'sks.image-voxel-ledger.v1';

export function emptyImageVoxelLedger(overrides: Record<string, unknown> = {}) {
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
  rgba?: string;
  coord?: Record<string, unknown>;
  evidence_path?: string | null;
  claim_id?: string | null;
  relation_id?: string | null;
}

export interface ImageVoxelRelation {
  id: string;
  relation_id?: string;
  type: string;
  before_image_id?: string | null;
  after_image_id?: string | null;
  source_image_id?: string | null;
  generated_image_id?: string | null;
  fixed_image_id?: string | null;
  changed_anchor_ids?: string[];
  verification?: string;
  status?: string;
}

export interface ImageVoxelLedger {
  schema: typeof IMAGE_VOXEL_LEDGER_SCHEMA;
  version?: string;
  generated_at?: string;
  mission_id?: string | null;
  images: ImageVoxelImage[];
  anchors: ImageVoxelAnchor[];
  relations: ImageVoxelRelation[];
}

export function isImageVoxelLedger(value: unknown): value is ImageVoxelLedger {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as Partial<ImageVoxelLedger>;
  return ledger.schema === IMAGE_VOXEL_LEDGER_SCHEMA
    && Array.isArray(ledger.images)
    && Array.isArray(ledger.anchors)
    && Array.isArray(ledger.relations);
}
