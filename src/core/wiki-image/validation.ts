import { IMAGE_VOXEL_LEDGER_SCHEMA } from './image-voxel-schema.js';
import { validateBbox } from './bbox.js';

export function validateImageVoxelLedger(ledger: any = {}, opts: any = {}) {
  const issues: any[] = [];
  if (ledger.schema !== IMAGE_VOXEL_LEDGER_SCHEMA) issues.push('schema');
  const images = Array.isArray(ledger.images) ? ledger.images : [];
  const anchors = Array.isArray(ledger.anchors) ? ledger.anchors : [];
  const relations = Array.isArray(ledger.relations) ? ledger.relations : [];
  const imageById = new Map();
  const anchorById = new Map();
  for (const image of images) {
    if (!image.id) issues.push('image_id');
    if (image.id && imageById.has(image.id)) issues.push(`duplicate_image:${image.id}`);
    if (image.id) imageById.set(image.id, image);
    if (!image.path) issues.push(`image_path:${image.id || 'unknown'}`);
    if (!image.sha256) issues.push(`image_sha256:${image.id || 'unknown'}`);
    if (image.stale === true || image.freshness === 'stale') issues.push(`stale_image:${image.id || 'unknown'}`);
    if (!Number.isFinite(Number(image.width)) || !Number.isFinite(Number(image.height))) issues.push(`image_dimensions:${image.id || 'unknown'}`);
  }
  if (opts.requireAnchors && anchors.length === 0) issues.push(`missing_anchors:${opts.route || 'visual-route'}`);
  for (const anchor of anchors) {
    if (!anchor.id) issues.push('anchor_id');
    if (anchor.id && anchorById.has(anchor.id)) issues.push(`duplicate_anchor:${anchor.id}`);
    if (anchor.id) anchorById.set(anchor.id, anchor);
    if (anchor.stale === true || anchor.freshness === 'stale' || Number(anchor.voxel_layers?.fresh ?? 1) <= 0) issues.push(`stale_anchor:${anchor.id || 'unknown'}`);
    if (!anchor.image_id || !imageById.has(anchor.image_id)) issues.push(`anchor_image_ref:${anchor.id || 'unknown'}`);
    if (anchor.bbox) {
      const image = imageById.get(anchor.image_id) || {};
      if (!Number.isFinite(Number(image.width)) || !Number.isFinite(Number(image.height))) issues.push(`bbox_image_dimensions:${anchor.id || 'unknown'}`);
      const bbox = validateBbox(anchor.bbox, image);
      for (const issue of bbox.issues) issues.push(`${issue}:${anchor.id || 'unknown'}`);
    } else {
      issues.push(`anchor_bbox:${anchor.id || 'unknown'}`);
    }
  }
  if (opts.requireRelations && relations.length === 0) issues.push(`missing_relations:${opts.route || 'visual-route'}`);
  const relationKeys = new Set();
  for (const relation of relations) {
    const relationKey = [
      relation.type,
      relation.before_image_id,
      relation.after_image_id,
      relation.source_image_id,
      relation.generated_image_id,
      relation.fixed_image_id,
      relation.issue_id,
      relation.fix_task_id
    ].join('|');
    if (relationKeys.has(relationKey)) issues.push(`duplicate_relation:${relation.type || 'unknown'}`);
    relationKeys.add(relationKey);
    if (relation.before_image_id && !imageById.has(relation.before_image_id)) issues.push(`relation_before:${relation.before_image_id}`);
    if (relation.after_image_id && !imageById.has(relation.after_image_id)) issues.push(`relation_after:${relation.after_image_id}`);
    if (relation.source_image_id && !imageById.has(relation.source_image_id)) issues.push(`relation_source:${relation.source_image_id}`);
    if (relation.generated_image_id && !imageById.has(relation.generated_image_id)) issues.push(`relation_generated:${relation.generated_image_id}`);
    if (relation.fixed_image_id && !imageById.has(relation.fixed_image_id)) issues.push(`relation_fixed:${relation.fixed_image_id}`);
    if (relation.bbox) {
      const image = imageById.get(relation.generated_image_id || relation.after_image_id || relation.source_image_id || relation.before_image_id) || {};
      const bbox = validateBbox(relation.bbox, image);
      for (const issue of bbox.issues) issues.push(`${issue}:relation:${relation.type || 'unknown'}`);
    }
    for (const anchorId of relation.changed_anchor_ids || relation.anchors || []) {
      if (!anchorById.has(anchorId)) issues.push(`relation_anchor:${anchorId}`);
    }
  }
  return {
    ok: issues.length === 0,
    status: issues.length ? 'blocked' : (anchors.length ? 'verified_partial' : 'not_verified'),
    issues,
    summary: {
      images: images.length,
      anchors: anchors.length,
      relations: relations.length
    }
  };
}
