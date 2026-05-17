export function parseGeneratedReviewCallouts(ledger = {}) {
  const items = Array.isArray(ledger.callouts)
    ? ledger.callouts
    : Array.isArray(ledger.issues)
      ? ledger.issues
      : [];
  return items.map((item, index) => ({
    id: item.id || `callout-${String(index + 1).padStart(3, '0')}`,
    image_id: item.image_id || item.imageId || ledger.image_id || null,
    bbox: item.bbox || item.box || null,
    label: item.label || item.title || item.issue || `Callout ${index + 1}`,
    source: item.source || ledger.source || 'gpt-image-2-annotated-review',
    evidence_path: item.evidence_path || ledger.path || null,
    trust_score: item.trust_score ?? 0.82
  }));
}
