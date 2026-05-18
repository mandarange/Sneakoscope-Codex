import path from 'node:path';
import { appendJsonl, ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.mjs';
import { missionDir } from '../mission.mjs';
import { EVIDENCE_INDEX_SCHEMA, PROJECT_EVIDENCE_INDEX_SCHEMA } from './evidence-schema.mjs';

export function missionEvidenceIndexPath(root, missionId) {
  return path.join(missionDir(root, missionId), 'evidence-index.json');
}

export function missionEvidenceJsonlPath(root, missionId) {
  return path.join(missionDir(root, missionId), 'evidence.jsonl');
}

export function projectEvidenceIndexPath(root) {
  return path.join(root, '.sneakoscope', 'evidence', 'project-index.json');
}

export async function readEvidenceIndex(root, missionId) {
  const file = missionEvidenceIndexPath(root, missionId);
  if (!missionId || !(await exists(file))) return null;
  return readJson(file, null);
}

export async function writeEvidenceIndex(root, {
  missionId,
  route = null,
  records = [],
  issues = [],
  status = 'not_verified'
} = {}) {
  const index = {
    schema: EVIDENCE_INDEX_SCHEMA,
    generated_at: nowIso(),
    mission_id: missionId || null,
    route,
    status,
    ok: issues.length === 0 && status !== 'blocked' && status !== 'failed',
    records,
    issues
  };
  if (missionId) {
    await ensureDir(missionDir(root, missionId));
    await writeJsonAtomic(missionEvidenceIndexPath(root, missionId), index);
    for (const record of records) await appendJsonl(missionEvidenceJsonlPath(root, missionId), record);
  }
  await appendProjectEvidenceIndex(root, index);
  return index;
}

async function appendProjectEvidenceIndex(root, index) {
  const file = projectEvidenceIndexPath(root);
  const current = await readJson(file, {
    schema: PROJECT_EVIDENCE_INDEX_SCHEMA,
    generated_at: nowIso(),
    missions: []
  });
  const missions = [
    ...(current.missions || []).filter((row) => row.mission_id !== index.mission_id),
    {
      mission_id: index.mission_id,
      route: index.route,
      status: index.status,
      ok: index.ok,
      evidence_count: index.records?.length || 0,
      generated_at: index.generated_at
    }
  ].slice(-200);
  await writeJsonAtomic(file, {
    schema: PROJECT_EVIDENCE_INDEX_SCHEMA,
    generated_at: nowIso(),
    missions
  });
}
