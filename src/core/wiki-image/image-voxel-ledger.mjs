import path from 'node:path';
import { ensureDir, exists, nowIso, packageRoot, readJson, writeJsonAtomic } from '../fsx.mjs';
import { emptyImageVoxelLedger } from './image-voxel-schema.mjs';
import { sha256File, imageDimensions } from './image-hash.mjs';
import { validateImageVoxelLedger } from './validation.mjs';

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
  const ledger = await readImageVoxelLedger(root);
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

function stableImageId(rel, sha256) {
  const base = path.basename(rel).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'image';
  return `${base}-${sha256.slice(0, 8)}`;
}
