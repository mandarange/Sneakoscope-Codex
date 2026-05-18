export function dedupeEvidence(records = []) {
  const byKey = new Map();
  for (const record of records) {
    const key = evidenceDedupeKey(record);
    const current = byKey.get(key);
    if (!current || trustRank(record.trust) > trustRank(current.trust)) byKey.set(key, record);
  }
  return [...byKey.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function evidenceDedupeKey(record = {}) {
  if (record.sha256) return `${record.kind}:sha:${record.sha256}`;
  if (record.path) return `${record.kind}:path:${record.path}`;
  return `${record.kind}:id:${record.id}`;
}

function trustRank(trust = 'low') {
  return { blocked: 0, low: 1, medium: 2, high: 3 }[trust] ?? 1;
}
