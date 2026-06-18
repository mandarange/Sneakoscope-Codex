import path from 'node:path';
import fsp from 'node:fs/promises';
import { exists, readJson, sha256 } from '../fsx.js';
import { missionDir, missionsDir, stateFile, findLatestMission } from '../mission.js';
import type { StopGateResolution } from './stop-gate-types.js';

const GATE_FILE_CANDIDATES = ['stop-gate.json', 'naruto-gate.json'];
const GLM_NARUTO_DIR = '.sneakoscope/glm-naruto';

async function statOrNull(filePath: string): Promise<{ mtime: string; sha: string; size: number } | null> {
  try {
    const stat = await fsp.stat(filePath);
    const content = await fsp.readFile(filePath, 'utf8');
    return { mtime: stat.mtime.toISOString(), sha: sha256(content), size: stat.size };
  } catch {
    return null;
  }
}

export async function resolveStopGate(input: {
  readonly root: string;
  readonly route?: string | undefined;
  readonly missionId?: string | undefined;
  readonly explicitGatePath?: string | undefined;
}): Promise<StopGateResolution> {
  const root = path.resolve(input.root);
  const checkedPaths: string[] = [];
  const route = input.route ?? null;

  // 1. explicit absolute path
  if (input.explicitGatePath) {
    const abs = path.isAbsolute(input.explicitGatePath) ? input.explicitGatePath : path.resolve(root, input.explicitGatePath);
    checkedPaths.push(abs);
    if (await exists(abs)) {
      const raw = await readJson(abs, null) as Record<string, unknown> | null;
      return makeResolution(root, route, null, abs, raw, checkedPaths, null, null, 'explicit_gate_path');
    }
  }

  // 2. current.json → mission_id + stop_gate_abs_path
  const statePath = stateFile(root);
  let state: Record<string, unknown> = {};
  let stateMissionId: string | null = null;
  if (await exists(statePath)) {
    checkedPaths.push(statePath);
    state = await readJson(statePath, {}) as Record<string, unknown>;
    stateMissionId = typeof state.mission_id === 'string' ? state.mission_id : null;
  }

  const missionId = input.missionId ?? stateMissionId;

  // 2a. stop_gate_abs_path from current state
  if (typeof state.stop_gate_abs_path === 'string' && state.stop_gate_abs_path) {
    const abs = path.isAbsolute(state.stop_gate_abs_path) ? state.stop_gate_abs_path : path.resolve(root, state.stop_gate_abs_path);
    checkedPaths.push(abs);
    if (await exists(abs)) {
      const raw = await readJson(abs, null) as Record<string, unknown> | null;
      return makeResolution(root, route, missionId, abs, raw, checkedPaths, statePath, stateMissionId, 'state.stop_gate_abs_path');
    }
  }

  // 3. mission dir candidates
  if (missionId) {
    const dir = missionDir(root, missionId);
    for (const file of GATE_FILE_CANDIDATES) {
      const p = path.join(dir, file);
      checkedPaths.push(p);
      if (await exists(p)) {
        const raw = await readJson(p, null) as Record<string, unknown> | null;
        return makeResolution(root, route, missionId, p, raw, checkedPaths, statePath, stateMissionId, 'mission_dir');
      }
    }

    // GLM Naruto termination / mission-result
    const glmDir = path.join(root, GLM_NARUTO_DIR, missionId);
    for (const file of ['termination.json', 'mission-result.json']) {
      const p = path.join(glmDir, file);
      checkedPaths.push(p);
      if (await exists(p)) {
        const raw = await readJson(p, null) as Record<string, unknown> | null;
        return makeResolution(root, route, missionId, p, raw, checkedPaths, statePath, stateMissionId, 'glm_naruto_dir');
      }
    }
  }

  // 4. latest mission fallback
  const latest = await findLatestMission(root);
  if (latest) {
    const dir = missionDir(root, latest);
    for (const file of GATE_FILE_CANDIDATES) {
      const p = path.join(dir, file);
      checkedPaths.push(p);
      if (await exists(p)) {
        const raw = await readJson(p, null) as Record<string, unknown> | null;
        return makeResolution(root, route, latest, p, raw, checkedPaths, statePath, stateMissionId, 'latest_mission');
      }
    }
  }

  return makeResolution(root, route, missionId, null, null, checkedPaths, statePath, stateMissionId, 'no_gate_found');
}

function makeResolution(
  root: string,
  route: string | null,
  missionId: string | null,
  gatePath: string | null,
  gateRaw: Record<string, unknown> | null,
  checkedPaths: readonly string[],
  statePath: string | null,
  stateMissionId: string | null,
  reason: string
): StopGateResolution {
  let gateSchema: string | null = null;
  if (gateRaw) {
    gateSchema = typeof gateRaw.schema === 'string' ? gateRaw.schema : guessSchemaFromPath(gatePath);
  }
  return {
    root,
    route,
    mission_id: missionId,
    gate_path: gatePath,
    gate_schema: gateSchema,
    gate_raw: gateRaw,
    checked_paths: checkedPaths,
    current_state_path: statePath,
    current_state_mission_id: stateMissionId,
    reason,
  };
}

function guessSchemaFromPath(gatePath: string | null): string | null {
  if (!gatePath) return null;
  const base = path.basename(gatePath);
  if (base === 'stop-gate.json' || base === 'stop-gate.latest.json') return 'sks.stop-gate.v1';
  if (base === 'naruto-gate.json') return 'sks.naruto-gate';
  if (base === 'termination.json') return 'sks.glm-naruto-termination';
  if (base === 'mission-result.json') return 'sks.glm-naruto-mission-result';
  return 'sks.gate';
}

export async function gateStatInfo(gatePath: string): Promise<{ mtime: string | null; sha256: string | null }> {
  const info = await statOrNull(gatePath);
  return { mtime: info?.mtime ?? null, sha256: info?.sha ?? null };
}
