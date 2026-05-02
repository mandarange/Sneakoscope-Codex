import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateMistakeLedger } from './artifact-schemas.mjs';

export function fingerprintMistake(input = {}) {
  const parts = [
    input.route || 'route',
    input.gate || input.test || 'gate',
    input.error_code || input.reason || input.message || 'failure'
  ].map((part) => String(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48));
  return parts.filter(Boolean).join(':');
}

export async function recordMistake(dir, input = {}) {
  const file = path.join(dir, ARTIFACT_FILES.mistake_ledger);
  const ledger = await readJson(file, { schema_version: 1, entries: [] });
  const fingerprint = input.fingerprint || fingerprintMistake(input);
  const now = nowIso();
  const entries = [...(ledger.entries || [])];
  const existing = entries.find((entry) => entry.fingerprint === fingerprint);
  if (existing) {
    existing.last_seen_at = now;
    existing.count = Number(existing.count || 1) + 1;
    existing.symptoms = Array.from(new Set([...(existing.symptoms || []), ...(input.symptoms || [input.message || input.reason || fingerprint])]));
    existing.status = existing.count >= 3 ? 'systemic' : 'watching';
    if (existing.count >= 2 && !existing.prevention) existing.prevention = preventionFor(input);
  } else {
    entries.push({
      fingerprint,
      first_seen_at: now,
      last_seen_at: now,
      count: 1,
      route: input.route || 'unknown',
      symptoms: input.symptoms || [input.message || input.reason || fingerprint],
      root_cause: input.root_cause || null,
      prevention: input.prevention || null,
      status: 'active'
    });
  }
  const next = { schema_version: 1, updated_at: now, entries };
  await writeJsonAtomic(file, next);
  return { ledger: next, validation: validateMistakeLedger(next) };
}

export async function createMistakeMemoryReport(dir, opts = {}) {
  const ledger = await readJson(path.join(dir, ARTIFACT_FILES.mistake_ledger), { schema_version: 1, entries: [] });
  const relevant = (ledger.entries || []).filter((entry) => matchesTask(entry, opts));
  return {
    schema_version: 1,
    mission_id: opts.mission_id || null,
    created_at: nowIso(),
    checked_fingerprints: ledger.entries || [],
    relevant_fingerprints: relevant,
    recovery_required: relevant.some((entry) => Number(entry.count || 0) >= 2 && entry.status !== 'resolved'),
    required_regression_tests: relevant.map((entry) => entry.prevention?.test).filter(Boolean),
    validation: {
      repeated_mistakes_have_prevention: (ledger.entries || []).every((entry) => Number(entry.count || 0) < 2 || entry.prevention?.gate || entry.prevention?.test || entry.prevention?.skill)
    }
  };
}

export async function writeMistakeMemoryReport(dir, opts = {}) {
  const report = await createMistakeMemoryReport(dir, opts);
  await writeJsonAtomic(path.join(dir, 'mistake-memory-report.json'), report);
  return report;
}

function preventionFor(input = {}) {
  const base = fingerprintMistake(input).replace(/[^a-z0-9-]+/g, '-');
  return {
    gate: input.gate ? `${input.gate}-anti-regression` : `${base}-gate`,
    test: input.test ? `${input.test}-regression` : `test:${base}`,
    skill: input.skill || null
  };
}

function matchesTask(entry = {}, opts = {}) {
  const hay = `${opts.route || ''} ${opts.task || ''} ${(opts.files || []).join(' ')}`.toLowerCase();
  return [entry.route, ...(entry.files_or_modules || []), ...(entry.trigger_conditions || []), entry.fingerprint]
    .filter(Boolean)
    .some((part) => hay.includes(String(part).toLowerCase()));
}
