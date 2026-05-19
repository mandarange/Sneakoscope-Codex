import path from 'node:path';
import { appendJsonl, ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { missionDir } from '../mission.js';
import { EVIDENCE_INDEX_SCHEMA, PROJECT_EVIDENCE_INDEX_SCHEMA } from './evidence-schema.js';
import { parseEvidenceIndex } from '../validators/evidence-validator.js';

export function missionEvidenceIndexPath(root: any, missionId: any) {
  return path.join(missionDir(root, missionId), 'evidence-index.json');
}

export function missionEvidenceJsonlPath(root: any, missionId: any) {
  return path.join(missionDir(root, missionId), 'evidence.jsonl');
}

export function projectEvidenceIndexPath(root: any) {
  return path.join(root, '.sneakoscope', 'evidence', 'project-index.json');
}

export async function readEvidenceIndex(root: any, missionId: any) {
  const file = missionEvidenceIndexPath(root, missionId);
  if (!missionId || !(await exists(file))) return null;
  const value = await readJson(file, null);
  return value ? parseEvidenceIndex(value) : null;
}

export async function writeEvidenceIndex(root: any, {
  missionId,
  route = null,
  records = [],
  issues = [],
  status = 'not_verified'
}: any = {}) {
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

async function appendProjectEvidenceIndex(root: any, index: any) {
  const file = projectEvidenceIndexPath(root);
  const current = await readJson(file, {
    schema: PROJECT_EVIDENCE_INDEX_SCHEMA,
    generated_at: nowIso(),
    missions: []
  });
  const missions = [
    ...(current.missions || []).filter((row: any) => row.mission_id !== index.mission_id),
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
