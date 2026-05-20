import path from 'node:path';
import { ensureDir, exists, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { emptyImageVoxelLedger } from './image-voxel-schema.js';
import { sha256File, imageDimensions } from './image-hash.js';
import { validateImageVoxelLedger } from './validation.js';
import { createImageRelation, createVisualAnchor } from './visual-anchor.js';
import { parseImageVoxelLedger } from '../validators/image-voxel-validator.js';

export function wikiImageLedgerPath(root: any = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'image-voxel-ledger.json');
}

export function wikiImageAssetsPath(root: any = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'image-assets.json');
}

export function wikiVisualAnchorsPath(root: any = packageRoot()) {
  return path.join(root, '.sneakoscope', 'wiki', 'visual-anchors.json');
}

export function missionImageLedgerPath(root: any = packageRoot(), missionId: any) {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'image-voxel-ledger.json');
}

export function missionVisualAnchorsPath(root: any = packageRoot(), missionId: any) {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'visual-anchors.json');
}

export async function readImageVoxelLedger(root: any = packageRoot(), file: any = wikiImageLedgerPath(root)) {
  if (!await exists(file)) return emptyImageVoxelLedger();
  return parseImageVoxelLedger(await readJson(file));
}

async function readScopedImageVoxelLedger(root: any = packageRoot(), missionId: any = null) {
  if (!missionId) return readImageVoxelLedger(root);
  const file = missionImageLedgerPath(root, missionId);
  if (!await exists(file)) return emptyImageVoxelLedger({ mission_id: missionId });
  return readImageVoxelLedger(root, file);
}

export async function writeImageVoxelLedger(root: any = packageRoot(), ledger: any = emptyImageVoxelLedger()) {
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

export async function ingestImage(root: any = packageRoot(), imagePath: any, opts: any = {}) {
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
  const images = [...(ledger.images || []).filter((entry: any) => entry.id !== id), image];
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: opts.missionId || ledger.mission_id || null, images });
  const validation = validateImageVoxelLedger(next);
  return { ok: validation.ok, image, ledger: next, validation };
}

export async function imageVoxelSummary(root: any = packageRoot(), ledgerFile: any = wikiImageLedgerPath(root)) {
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

export async function addVisualAnchor(root: any = packageRoot(), input: any = {}) {
  const ledger = await readScopedImageVoxelLedger(root, input.missionId || null);
  const image = (ledger.images || []).find((entry: any) => entry.id === input.imageId);
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
  const anchors = [...(ledger.anchors || []).filter((entry: any) => entry.id !== anchor.id), anchor];
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: input.missionId || ledger.mission_id || null, anchors });
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, route: input.route || '$Wiki' });
  return { ok: validation.ok && Boolean(image), anchor, ledger: next, validation: image ? validation : { ...validation, ok: false, issues: [...validation.issues, `missing_image:${input.imageId}`] } };
}

export async function addImageRelation(root: any = packageRoot(), input: any = {}) {
  const ledger = await readScopedImageVoxelLedger(root, input.missionId || null);
  const relation = createImageRelation({
    type: input.type || 'before_after',
    beforeImageId: input.beforeImageId,
    afterImageId: input.afterImageId,
    sourceImageId: input.sourceImageId,
    generatedImageId: input.generatedImageId,
    fixedImageId: input.fixedImageId,
    issueId: input.issueId,
    fixTaskId: input.fixTaskId,
    anchors: input.anchors || [],
    verification: input.verification || 'changed-screen-recheck',
    status: input.status || 'verified_partial'
  });
  const relations = dedupeRelations([...(ledger.relations || []), relation]);
  const next = await writeImageVoxelLedger(root, { ...ledger, mission_id: input.missionId || ledger.mission_id || null, relations });
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, requireRelations: true, route: input.route || '$Wiki' });
  return { ok: validation.ok, relation, ledger: next, validation };
}

function dedupeRelations(relations: any[] = []) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const relation of relations) {
    const key = [
      relation.type,
      relation.before_image_id,
      relation.after_image_id,
      relation.source_image_id,
      relation.generated_image_id,
      relation.fixed_image_id,
      relation.issue_id,
      relation.fix_task_id,
      JSON.stringify(relation.changed_anchor_ids || relation.anchors || [])
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relation);
  }
  return out;
}

function stableImageId(rel: any, sha256: any) {
  const base = path.basename(rel).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'image';
  return `${base}-${sha256.slice(0, 8)}`;
}

function stableAnchorId(imageId: any = 'image', label: any = 'anchor', index: any = 0) {
  const image = String(imageId || 'image').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'image';
  const slug = String(label || 'anchor').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'anchor';
  return `${image}-${slug}-${String(index + 1).padStart(3, '0')}`;
}
