import path from 'node:path';
import fsp from 'node:fs/promises';
import { ensureDir, exists, packageRoot } from '../fsx.mjs';
import { addImageRelation, addVisualAnchor, ingestImage, missionImageLedgerPath, readImageVoxelLedger, writeImageVoxelLedger } from './image-voxel-ledger.mjs';
import { validateImageVoxelLedger } from './validation.mjs';
import { emptyImageVoxelLedger } from './image-voxel-schema.mjs';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axX7V8AAAAASUVORK5CYII=';

export async function ensureRouteImageEvidence(root = packageRoot(), {
  missionId,
  route,
  mock = false,
  requireRelation = false,
  source = 'route-finalizer'
} = {}) {
  if (!missionId) return { ok: false, status: 'blocked', issues: ['mission_id_missing'] };
  const missionLedger = missionImageLedgerPath(root, missionId);
  let ledger = await readImageVoxelLedger(root, await exists(missionLedger) ? missionLedger : undefined);
  if (ledger?.mission_id !== missionId) ledger = { ...emptyImageVoxelLedger(), ...ledger, mission_id: missionId };
  let existingValidation = validateImageVoxelLedger(ledger, { requireAnchors: true, requireRelations: requireRelation, route });
  if (existingValidation.ok && ledger.anchors?.length) {
    await writeImageVoxelLedger(root, ledger);
    return { ok: true, status: 'verified_partial', ledger, validation: existingValidation, created_mock: false };
  }
  if (!mock) {
    return {
      ok: false,
      status: 'blocked',
      issues: existingValidation.issues.length ? existingValidation.issues : ['image_voxel_anchors_missing'],
      validation: existingValidation
    };
  }
  ledger = sanitizeMissionLedger(ledger, missionId);
  existingValidation = validateImageVoxelLedger(ledger, { requireAnchors: true, requireRelations: requireRelation, route });
  await writeImageVoxelLedger(root, ledger);
  const imagePath = path.join(root, '.sneakoscope', 'missions', missionId, 'visual-fixture.png');
  await ensureDir(path.dirname(imagePath));
  await fsp.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'));
  await ingestImage(root, path.relative(root, imagePath), { missionId, source: `${source}:mock`, id: `${missionId}-mock-before` });
  await ingestImage(root, path.relative(root, imagePath), { missionId, source: `${source}:mock`, id: `${missionId}-mock-after` });
  const anchorId = `${missionId}-mock-anchor`;
  const anchor = await addVisualAnchor(root, {
    id: anchorId,
    missionId,
    imageId: `${missionId}-mock-after`,
    bbox: [0, 0, 1, 1],
    label: `${route || 'visual route'} mock visual anchor`,
    source: `${source}:mock`,
    evidencePath: `.sneakoscope/missions/${missionId}/visual-fixture.png`,
    route,
    trustScore: 0.5
  });
  let relation = null;
  if (requireRelation) {
    relation = await addImageRelation(root, {
      missionId,
      route,
      beforeImageId: `${missionId}-mock-before`,
      afterImageId: `${missionId}-mock-after`,
      anchors: [anchorId],
      status: 'verified_partial',
      verification: 'mock-before-after-fixture'
    });
  }
  const nextLedger = relation?.ledger || anchor.ledger;
  const validation = validateImageVoxelLedger(nextLedger, { requireAnchors: true, requireRelations: requireRelation, route });
  return {
    ok: validation.ok,
    status: validation.ok ? 'verified_partial' : 'blocked',
    ledger: nextLedger,
    validation,
    created_mock: true,
    mock: true,
    issues: validation.issues
  };
}

function sanitizeMissionLedger(ledger = emptyImageVoxelLedger(), missionId) {
  const marker = String(missionId || '');
  const images = (ledger.images || []).filter((image) => {
    const id = String(image.id || '');
    const file = String(image.path || '');
    return id.startsWith(`${marker}-`) || file.includes(`/missions/${marker}/`) || file.includes(`missions/${marker}/`);
  });
  const imageIds = new Set(images.map((image) => image.id));
  const anchors = (ledger.anchors || []).filter((anchor) => {
    const id = String(anchor.id || '');
    const evidence = String(anchor.evidence_path || anchor.evidencePath || '');
    return imageIds.has(anchor.image_id) && (id.startsWith(`${marker}-`) || evidence.includes(marker));
  });
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const relations = (ledger.relations || []).filter((relation) => {
    const changed = relation.changed_anchor_ids || relation.anchors || [];
    return imageIds.has(relation.before_image_id)
      && imageIds.has(relation.after_image_id)
      && changed.every((anchorId) => anchorIds.has(anchorId));
  });
  return {
    ...emptyImageVoxelLedger(),
    ...ledger,
    mission_id: missionId,
    images,
    anchors,
    relations
  };
}
