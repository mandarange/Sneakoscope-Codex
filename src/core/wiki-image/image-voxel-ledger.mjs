import path from 'node:path';
import { ensureDir, exists, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { emptyImageVoxelLedger } from './image-voxel-schema.mjs';
import { sha256File, imageDimensions } from './image-hash.mjs';
import { validateImageVoxelLedger } from './validation.mjs';
import { createImageRelation, createVisualAnchor } from './visual-anchor.mjs';

export function wikiImageLedgerPath(root = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'image-voxel-ledger.json');
}

export function wikiImageAssetsPath(root = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'image-assets.json');
}

export function wikiVisualAnchorsPath(root = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'visual-anchors.json');
}

export function missionImageLedgerPath(root = packageRoot(), missionId) {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'image-voxel-ledger.json');
}

export function missionVisualAnchorsPath(root = packageRoot(), missionId) {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'visual-anchors.json');
}

export async function readImageVoxelLedger(root = packageRoot(), file = wikiImageLedgerPath(root)) {
  if (!await exists(file)) return emptyImageVoxelLedger();
  return readJson(file);
}

async function readScopedImageVoxelLedger(root = packageRoot(), missionId = null) {
  if (!missionId) return readImageVoxelLedger(root);
  const file = missionImageLedgerPath(root, missionId);
  if (!await exists(file)) return emptyImageVoxelLedger({ mission_id: missionId });
  return readImageVoxelLedger(root, file);
}

export async function writeImageVoxelLedger(root = packageRoot(), ledger = emptyImageVoxelLedger()) {
  await ensureDir(path.dirname(wikiImageLedgerPath(root)));
  const normalized = { ...emptyImageVoxelLedger(), ...ledger, generated_at: nowIso() };
  await writeJsonAtomic(wikiImageLedgerPath(root), normalized);
  await writeJsonAtomic(wikiImageAssetsPath(root), {
    schema: 'sks.image-assets.v1',
    version: normalized.version,
    generated_at: normalized.generated_at,
    images: normalized.images
  });
  await writeJsonAtomic(wikiVisualAnchorsPath(root), {
    schema: 'sks.visual-anchors.v1',
    version: normalized.version,
    generated_at: normalized.generated_at,
    anchors: normalized.anchors
  });
  if (normalized.mission_id) {
    const missionDir = path.dirname(missionImageLedgerPath(root, normalized.mission_id));
    await ensureDir(missionDir);
    await writeJsonAtomic(missionImageLedgerPath(root, normalized.mission_id), normalized);
    await writeJsonAtomic(missionVisualAnchorsPath(root, normalized.mission_id), {
      schema: 'sks.visual-anchors.v1',
      version: normalized.version,
      generated_at: normalized.generated_at,
      anchors: normalized.anchors
    });
  }
  return normalized;
}

export async function ingestImage(root = packageRoot(), imagePath, opts = {}) {
  if (!imagePath) throw new Error('image path required');
  const absolute = path.resolve(root, imagePath);
  const dims = await imageDimensions(absolute);
  const sha256 = await sha256File(absolute);
  const ledger = await readScopedImageVoxelLedger(root, opts.missionId || null);
  const rel = path.relative(root, absolute).split(path.sep).join('/');
  const id = opts.id || stableImageId(rel, sha256);
  const image = {
    id,
    path: rel,
    sha256,
    width: dims.width,
    height: dims.height,
    format: dims.format,
    source: opts.source || 'manual',
    captured_at: opts.capturedAt || nowIso()
  };
  const images = [...(ledger.images || []).filter((entry) => entry.id !== id), image];
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: opts.missionId || ledger.mission_id || null, images });
  const validation = validateImageVoxelLedger(next);
  return { ok: validation.ok, image, ledger: next, validation };
}

export async function imageVoxelSummary(root = packageRoot(), ledgerFile = wikiImageLedgerPath(root)) {
  const ledger = await readImageVoxelLedger(root, ledgerFile);
  const validation = validateImageVoxelLedger(ledger);
  return {
    schema: 'sks.image-voxel-summary.v1',
    status: validation.status,
    ok: validation.ok,
    images: ledger.images?.length || 0,
    anchors: ledger.anchors?.length || 0,
    anchor_count: ledger.anchors?.length || 0,
    relations: ledger.relations?.length || 0,
    issues: validation.issues
  };
}

export async function addVisualAnchor(root = packageRoot(), input = {}) {
  const ledger = await readScopedImageVoxelLedger(root, input.missionId || null);
  const image = (ledger.images || []).find((entry) => entry.id === input.imageId);
  const anchor = createVisualAnchor({
    id: input.id || stableAnchorId(input.imageId, input.label, ledger.anchors?.length || 0),
    imageId: input.imageId,
    bbox: input.bbox,
    label: input.label,
    source: input.source || 'manual',
    evidencePath: input.evidencePath || null,
    trustScore: input.trustScore ?? 0.82,
    route: input.route || null,
    claimId: input.claimId || null
  });
  const anchors = [...(ledger.anchors || []).filter((entry) => entry.id !== anchor.id), anchor];
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: input.missionId || ledger.mission_id || null, anchors });
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, route: input.route || '$Wiki' });
  return { ok: validation.ok && Boolean(image), anchor, ledger: next, validation: image ? validation : { ...validation, ok: false, issues: [...validation.issues, `missing_image:${input.imageId}`] } };
}

export async function addImageRelation(root = packageRoot(), input = {}) {
  const ledger = await readScopedImageVoxelLedger(root, input.missionId || null);
  const relation = createImageRelation({
    type: input.type || 'before_after',
    beforeImageId: input.beforeImageId,
    afterImageId: input.afterImageId,
    anchors: input.anchors || [],
    verification: input.verification || 'changed-screen-recheck',
    status: input.status || 'verified_partial'
  });
  const relations = [...(ledger.relations || []), relation];
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: input.missionId || ledger.mission_id || null, relations });
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, requireRelations: true, route: input.route || '$Wiki' });
  return { ok: validation.ok, relation, ledger: next, validation };
}

function stableImageId(rel, sha256) {
  const base = path.basename(rel).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'image';
  return `${base}-${sha256.slice(0, 8)}`;
}

function stableAnchorId(imageId = 'image', label = 'anchor', index = 0) {
  const image = String(imageId || 'image').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'image';
  const slug = String(label || 'anchor').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'anchor';
  return `${image}-${slug}-${String(index + 1).padStart(3, '0')}`;
}
