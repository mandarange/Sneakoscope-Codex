// @ts-nocheck
import fsp from 'node:fs/promises';

export async function fileFreshness(file, { staleAfter = null } = {}) {
  let stat = null;
  try {
    stat = await fsp.stat(file);
  } catch {
    return { exists: false, freshness: 'unknown', mtime_ms: null, issues: ['path_missing'] };
  }
  if (!staleAfter) return { exists: true, freshness: 'fresh', mtime_ms: stat.mtimeMs, issues: [] };
  const cutoff = typeof staleAfter === 'number' ? staleAfter : Date.parse(staleAfter);
  if (Number.isFinite(cutoff) && stat.mtimeMs < cutoff) {
    return { exists: true, freshness: 'stale', mtime_ms: stat.mtimeMs, issues: ['stale'] };
  }
  return { exists: true, freshness: 'fresh', mtime_ms: stat.mtimeMs, issues: [] };
}

export async function lastJsonlEventTime(file) {
  let text = '';
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return null;
  }
  let latest = null;
  for (const line of text.split(/\n/).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      const ts = Date.parse(parsed.ts || parsed.time || parsed.created_at || '');
      if (Number.isFinite(ts) && (latest == null || ts > latest)) latest = ts;
    } catch {}
  }
  return latest;
}
