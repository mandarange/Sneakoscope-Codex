import path from 'node:path';
import { ensureDir, nowIso, randomId, writeJsonAtomic, appendJsonl, readJson, exists } from './fsx.mjs';

export function missionId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `M-${stamp}-${randomId(4)}`;
}

export function sineDir(root) { return path.join(root, '.sneakoscope'); }
export function missionsDir(root) { return path.join(sineDir(root), 'missions'); }
export function missionDir(root, id) { return path.join(missionsDir(root), id); }
export function stateFile(root) { return path.join(sineDir(root), 'state', 'current.json'); }

export async function createMission(root, { mode, prompt }) {
  const id = missionId();
  const dir = missionDir(root, id);
  await ensureDir(dir);
  await ensureDir(path.join(dir, 'bus'));
  await ensureDir(path.join(dir, 'goal'));
  await ensureDir(path.join(dir, 'sessions'));
  const mission = {
    id,
    mode,
    prompt,
    created_at: nowIso(),
    phase: mode === 'goal' ? 'GOAL_PREPARE' : 'PREPARE',
    questions_allowed: true,
    implementation_allowed: false
  };
  await writeJsonAtomic(path.join(dir, 'mission.json'), mission);
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mission.created', mission: id, mode, prompt });
  await writeJsonAtomic(stateFile(root), { mission_id: id, mode: mode.toUpperCase(), phase: mission.phase, updated_at: nowIso() });
  return { id, dir, mission };
}

export async function loadMission(root, id) {
  const dir = missionDir(root, id);
  const mission = await readJson(path.join(dir, 'mission.json'));
  return { id, dir, mission };
}

export async function findLatestMission(root) {
  const dir = missionsDir(root);
  if (!(await exists(dir))) return null;
  const fs = await import('node:fs/promises');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const ids = entries.filter((e) => e.isDirectory() && e.name.startsWith('M-')).map((e) => e.name);
  const candidates = await Promise.all(ids.map(async (id) => {
    const dirPath = missionDir(root, id);
    const stat = await fs.stat(dirPath).catch(() => null);
    const mission = await readJson(path.join(dirPath, 'mission.json'), {}).catch(() => ({}));
    const createdMs = Date.parse(mission.created_at || mission.updated_at || '');
    return {
      id,
      createdMs: Number.isFinite(createdMs) ? createdMs : 0,
      mtimeMs: stat?.mtimeMs || 0
    };
  }));
  candidates.sort((a, b) => (a.createdMs - b.createdMs) || (a.mtimeMs - b.mtimeMs) || a.id.localeCompare(b.id));
  return candidates.at(-1)?.id || null;
}

export async function setCurrent(root, patch) {
  const current = await readJson(stateFile(root), {});
  await writeJsonAtomic(stateFile(root), { ...current, ...patch, updated_at: nowIso() });
}
