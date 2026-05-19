export function validateBbox(bbox: unknown, image: Record<string, unknown> = {}) {
  const issues: string[] = [];
  if (!Array.isArray(bbox) || bbox.length !== 4) return { ok: false, issues: ['bbox_shape'] };
  const x = Number(bbox[0]);
  const y = Number(bbox[1]);
  const width = Number(bbox[2]);
  const height = Number(bbox[3]);
  if (![x, y, width, height].every(Number.isFinite)) issues.push('bbox_number');
  if (x < 0 || y < 0 || width <= 0 || height <= 0) issues.push('bbox_positive');
  if (Number.isFinite(Number(image.width)) && x + width > Number(image.width)) issues.push('bbox_width_out_of_bounds');
  if (Number.isFinite(Number(image.height)) && y + height > Number(image.height)) issues.push('bbox_height_out_of_bounds');
  return { ok: issues.length === 0, issues };
}
