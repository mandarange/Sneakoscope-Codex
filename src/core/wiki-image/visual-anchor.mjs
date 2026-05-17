import { rgbaKey, rgbaToWikiCoord } from '../wiki-coordinate.mjs';

export function createVisualAnchor({ id, imageId, bbox, label, source, evidencePath, trustScore = 0.5, rgba = [58, 132, 210, 240] } = {}) {
  const key = Array.isArray(rgba) ? rgbaKey(rgba) : String(rgba || '3a84d2f0');
  const rgbaTuple = Array.isArray(rgba)
    ? rgba
    : [Number.parseInt(key.slice(0, 2), 16), Number.parseInt(key.slice(2, 4), 16), Number.parseInt(key.slice(4, 6), 16), Number.parseInt(key.slice(6, 8), 16)];
  return {
    id,
    image_id: imageId,
    rgba: key,
    coord: rgbaToWikiCoord(rgbaTuple),
    bbox,
    label,
    source,
    evidence_path: evidencePath || null,
    trust_score: trustScore,
    trust_band: source || 'visual-anchor',
    voxel_layers: {
      sem: 0.7,
      trust: trustScore,
      fresh: 1,
      prio: 0.75,
      conflict: 0,
      route: 0.9,
      cost: 0.2
    }
  };
}
