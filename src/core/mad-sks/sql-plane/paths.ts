import path from 'node:path';
import { missionDir } from '../../mission.js';

export const MAD_SKS_SQL_PLANE_CAPABILITY_FILE = 'capability.json';
export const MAD_SKS_SQL_PLANE_CLOSED_CAPABILITY_FILE = 'capability.closed.json';
export const MAD_SKS_SQL_PLANE_LEDGER_FILE = 'ledger.jsonl';
export const MAD_SKS_SQL_PLANE_LATEST_LEDGER_FILE = 'ledger.latest.json';
export const MAD_SKS_SQL_PLANE_RESULT_FILE = 'result.json';

export function madSksSqlPlaneDir(root: string, missionId: string): string {
  return path.join(missionDir(root, missionId), 'mad-sks', 'sql-plane');
}

export function madSksSqlPlaneRuntimeDir(root: string, missionId: string): string {
  return path.join(madSksSqlPlaneDir(root, missionId), 'runtime');
}

export function madSksSqlPlaneRelativePath(...segments: string[]): string {
  return path.posix.join('mad-sks', 'sql-plane', ...segments);
}
