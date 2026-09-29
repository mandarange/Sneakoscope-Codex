import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from './fsx.js';
import { ARTIFACT_FILES } from './artifact-schemas.js';

export async function createMistakeMemoryReport(dir: any, opts: any = {}) {
  const ledger = await readJson(path.join(dir, ARTIFACT_FILES.mistake_ledger), { schema_version: 1, entries: [] });
  const relevant = (ledger.entries || []).filter((entry: any) => matchesTask(entry, opts));
  return {
    schema_version: 1,
    mission_id: opts.mission_id || null,
    created_at: nowIso(),
    checked_fingerprints: ledger.entries || [],
    relevant_fingerprints: relevant,
    recovery_required: relevant.some((entry: any) => Number(entry.count || 0) >= 2 && entry.status !== 'resolved'),
    required_regression_tests: relevant.map((entry: any) => entry.prevention?.test).filter(Boolean),
    validation: {
      repeated_mistakes_have_prevention: (ledger.entries || []).every((entry: any) => Number(entry.count || 0) < 2 || entry.prevention?.gate || entry.prevention?.test || entry.prevention?.skill)
    }
  };
}

export async function writeMistakeMemoryReport(dir: any, opts: any = {}) {
  const report = await createMistakeMemoryReport(dir, opts);
  await writeJsonAtomic(path.join(dir, 'mistake-memory-report.json'), report);
  return report;
}

function matchesTask(entry: any = {}, opts: any = {}) {
  const hay = `${opts.route || ''} ${opts.task || ''} ${(opts.files || []).join(' ')}`.toLowerCase();
  return [entry.route, ...(entry.files_or_modules || []), ...(entry.trigger_conditions || []), entry.fingerprint]
    .filter(Boolean)
    .some((part: any) => hay.includes(String(part).toLowerCase()));
}
