import path from 'node:path';
import { exists, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.js';
import { emptyImageVoxelLedger } from './image-voxel-schema.js';
import { sha256File, imageDimensions } from './image-hash.js';
import { imageRelationDedupeKey, validateImageVoxelLedger } from './validation.js';
import { createImageRelation, createVisualAnchor } from './visual-anchor.js';
import { parseImageVoxelLedger } from '../validators/image-voxel-validator.js';
import { withFileLock } from '../locks/file-lock.js';
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js';
import { sha256 } from '../fsx.js';
import { withTriWikiStateLock } from '../triwiki/triwiki-cleanup.js';
import { MEMORY_ID } from '../artifact-schemas.js';

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
  if (!MEMORY_ID.test(String(missionId || ''))) throw new Error('image_mission_id_invalid');
  return path.join(root, '.sneakoscope', 'missions', missionId, 'image-voxel-ledger.json');
}

export function missionVisualAnchorsPath(root: any = packageRoot(), missionId: any) {
  return path.join(path.dirname(missionImageLedgerPath(root, missionId)), 'visual-anchors.json');
}

export async function readImageVoxelLedger(root: any = packageRoot(), file: any = wikiImageLedgerPath(root)) {
  const inspected = await inspectConfinedPath(root, file);
  if (!inspected.exists) return emptyImageVoxelLedger();
  if (inspected.leafSymlink || !inspected.stat?.isFile() || inspected.stat.size > 4 * 1024 * 1024) throw new Error('image_ledger_path_or_size');
  return parseImageVoxelLedger(await readJson(file));
}

export async function validateImageVoxelLedgerFiles(root: string, ledger: any = emptyImageVoxelLedger()) {
  const validation = validateImageVoxelLedger(ledger, { root });
  const issues = [...validation.issues];
  for (const image of Array.isArray(ledger.images) ? ledger.images : []) {
    const absolute = path.resolve(root, String(image.path || ''));
    const inspected = await inspectConfinedPath(root, absolute).catch(() => null);
    if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) {
      issues.push(`image_file:${image.id || 'unknown'}`);
      continue;
    }
    const digest = await sha256File(absolute).catch(() => null);
    if (!digest || digest !== image.sha256) issues.push(`image_hash:${image.id || 'unknown'}`);
    const dims = await imageDimensions(absolute).catch(() => null);
    if (!dims || Number(dims.width) !== Number(image.width) || Number(dims.height) !== Number(image.height)) issues.push(`image_dimensions_mismatch:${image.id || 'unknown'}`);
  }
  return { ...validation, ok: issues.length === 0, issues: [...new Set(issues)] };
}

async function readScopedImageVoxelLedger(root: any = packageRoot(), missionId: any = null) {
  if (!missionId) return readImageVoxelLedger(root);
  const file = missionImageLedgerPath(root, missionId);
  if (!await exists(file)) return emptyImageVoxelLedger({ mission_id: missionId });
  return readImageVoxelLedger(root, file);
}

/** All mutations merge a delta into the current ledger under the same lock.
 * A stale caller snapshot can never delete another writer's images or anchors. */
export async function writeImageVoxelLedger(root: string = packageRoot(), delta: any = emptyImageVoxelLedger()) {
  const missionId = delta.mission_id || null;
  const target = missionId ? missionImageLedgerPath(root, missionId) : wikiImageLedgerPath(root);
  const run = async () => {
    await ensureConfinedDirectory(root, path.dirname(target));
    const current = await readScopedImageVoxelLedger(root, missionId);
    const merge = (left: any[], right: any[]) => [...new Map([...left, ...right].map(row => [row.id, row])).values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const normalized = {
      ...emptyImageVoxelLedger(), ...current, mission_id: missionId, generated_at: nowIso(),
      images: merge(current.images || [], delta.images || []),
      anchors: merge(current.anchors || [], delta.anchors || []),
      relations: dedupeRelations([...(current.relations || []), ...(delta.relations || [])])
    };
    const validation = await validateImageVoxelLedgerFiles(root, normalized);
    if (!validation.ok) throw new Error(`image_voxel_ledger_invalid:${validation.issues.join(',')}`);
    if (Buffer.byteLength(JSON.stringify(normalized)) > 4 * 1024 * 1024) throw new Error('image_ledger_capacity');
    // These projections are derived; the ledger is the sole canonical read path.
    const anchorsFile = missionId ? missionVisualAnchorsPath(root, missionId) : wikiVisualAnchorsPath(root);
    for (const file of [target, anchorsFile, ...(!missionId ? [wikiImageAssetsPath(root)] : [])]) {
      if ((await inspectConfinedPath(root, file)).leafSymlink) throw new Error('image_ledger_symlink');
    }
    await writeJsonAtomic(anchorsFile, { schema: 'sks.visual-anchors.v1', version: normalized.version, generated_at: normalized.generated_at, anchors: normalized.anchors });
    if (!missionId) await writeJsonAtomic(wikiImageAssetsPath(root), { schema: 'sks.image-assets.v1', version: normalized.version, generated_at: normalized.generated_at, images: normalized.images });
    await writeJsonAtomic(target, normalized);
    return normalized;
  };
  if (!missionId) return withTriWikiStateLock(root, run);
  const lockPath = path.join(root, '.sneakoscope', 'state', 'locks', `image-voxel-${sha256(target).slice(0, 24)}.lock`);
  await ensureConfinedDirectory(root, path.dirname(lockPath));
  if ((await inspectConfinedPath(root, lockPath)).leafSymlink) throw new Error('image_lock_symlink');
  return withFileLock({ lockPath, timeoutMs: 5000, staleMs: 30000 }, run);
}

/** Explicit promotion revalidates actual bytes before the global merge. */
export async function promoteMissionImageVoxelLedger(root: string, missionId: string) {
  const mission = await readScopedImageVoxelLedger(root, missionId);
  return writeImageVoxelLedger(root, { ...mission, mission_id: null });
}

export async function ingestImage(root: any = packageRoot(), imagePath: any, opts: any = {}) {
  if (!imagePath) throw new Error('image path required');
  const absolute = path.resolve(root, imagePath);
  const inspected = await inspectConfinedPath(root, absolute);
  if (!inspected.exists || inspected.leafSymlink || !inspected.stat?.isFile()) throw new Error('image_path_not_confined');
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
  const next = await writeImageVoxelLedger(root, { mission_id: opts.missionId || null, images: [image] });
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
    id: input.id || stableAnchorId(input.imageId, input.label, sha256(JSON.stringify(input.bbox)).slice(0, 8)),
    imageId: input.imageId,
    bbox: input.bbox,
    label: input.label,
    source: input.source || 'manual',
    evidencePath: input.evidencePath || null,
    trustScore: input.trustScore ?? 0.82,
    route: input.route || null,
    claimId: input.claimId || null
  });
  const next = await writeImageVoxelLedger(root, { mission_id: input.missionId || null, anchors: [anchor] });
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
  const next = await writeImageVoxelLedger(root, { mission_id: input.missionId || null, relations: [relation] });
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, requireRelations: true, route: input.route || '$Wiki' });
  return { ok: validation.ok, relation, ledger: next, validation };
}

function dedupeRelations(relations: any[] = []) {
  const byKey = new Map<string, any>();
  for (const relation of relations) {
    const key = imageRelationDedupeKey(relation);
    // A later write is the authoritative status/verification for the same
    // relation key. Anchor changes produce a new key and are retained.
    byKey.set(key, relation);
  }
  return [...byKey.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
