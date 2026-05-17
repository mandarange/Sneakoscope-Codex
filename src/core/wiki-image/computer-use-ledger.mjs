import path from 'node:path';
import { nowIso, packageRoot, readJson } from '../fsx.mjs';
import { addVisualAnchor, readImageVoxelLedger, writeImageVoxelLedger } from './image-voxel-ledger.mjs';
import { validateImageVoxelLedger } from './validation.mjs';

export async function importComputerUseEvidence(root = packageRoot(), file, opts = {}) {
  const ledger = await readJson(path.resolve(root, file), {});
  const current = await readImageVoxelLedger(root);
  const screens = Array.isArray(ledger.screens) ? ledger.screens : [];
  const images = [
    ...(current.images || []),
    ...screens.map((screen) => ({
      id: screen.id,
      path: screen.path,
      sha256: screen.sha256 || 'fixture',
      width: screen.width,
      height: screen.height,
      source: screen.source || 'codex-computer-use',
      captured_at: screen.captured_at || nowIso()
    }))
  ].filter((image, index, all) => image.id && all.findIndex((entry) => entry.id === image.id) === index);
  let next = await writeImageVoxelLedger(root, { ...current, mission_id: opts.missionId || current.mission_id || null, images });
  for (const action of ledger.actions || []) {
    if (!action.bbox) continue;
    const result = await addVisualAnchor(root, {
      imageId: action.screen_id,
      bbox: action.bbox,
      label: action.target || action.type || 'Computer Use action',
      source: 'codex-computer-use',
      evidencePath: file,
      route: opts.route || '$Computer-Use',
      missionId: opts.missionId
    });
    next = result.ledger;
  }
  const validation = validateImageVoxelLedger(next, { requireAnchors: true, route: opts.route || '$Computer-Use' });
  return { schema: 'sks.computer-use-image-voxel-import.v1', ok: validation.ok, mode: ledger.mode || 'mock', ledger: next, validation };
}
