import { IMAGE_VOXEL_LEDGER_SCHEMA } from './image-voxel-schema.mjs';
import { validateBbox } from './bbox.mjs';

export function validateImageVoxelLedger(ledger = {}) {
  const issues = [];
  if (ledger.schema !== IMAGE_VOXEL_LEDGER_SCHEMA) issues.push('schema');
  const images = Array.isArray(ledger.images) ? ledger.images : [];
  const anchors = Array.isArray(ledger.anchors) ? ledger.anchors : [];
  const imageById = new Map();
  for (const image of images) {
    if (!image.id) issues.push('image_id');
    if (image.id && imageById.has(image.id)) issues.push(`duplicate_image:${image.id}`);
    if (image.id) imageById.set(image.id, image);
    if (!image.path) issues.push(`image_path:${image.id || 'unknown'}`);
    if (!image.sha256) issues.push(`image_sha256:${image.id || 'unknown'}`);
    if (!Number.isFinite(Number(image.width)) || !Number.isFinite(Number(image.height))) issues.push(`image_dimensions:${image.id || 'unknown'}`);
  }
  for (const anchor of anchors) {
    if (!anchor.id) issues.push('anchor_id');
    if (!anchor.image_id || !imageById.has(anchor.image_id)) issues.push(`anchor_image_ref:${anchor.id || 'unknown'}`);
    if (anchor.bbox) {
      const bbox = validateBbox(anchor.bbox, imageById.get(anchor.image_id) || {});
      for (const issue of bbox.issues) issues.push(`${issue}:${anchor.id || 'unknown'}`);
    } else {
      issues.push(`anchor_bbox:${anchor.id || 'unknown'}`);
    }
  }
  for (const relation of Array.isArray(ledger.relations) ? ledger.relations : []) {
    if (relation.before_image_id && !imageById.has(relation.before_image_id)) issues.push(`relation_before:${relation.before_image_id}`);
    if (relation.after_image_id && !imageById.has(relation.after_image_id)) issues.push(`relation_after:${relation.after_image_id}`);
  }
  return {
    ok: issues.length === 0,
    status: issues.length ? 'blocked' : 'verified_partial',
    issues,
    summary: {
      images: images.length,
      anchors: anchors.length,
      relations: Array.isArray(ledger.relations) ? ledger.relations.length : 0
    }
  };
}
