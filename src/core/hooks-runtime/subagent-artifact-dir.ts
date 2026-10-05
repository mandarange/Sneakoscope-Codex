import path from 'node:path';
import { sha256 } from '../fsx.js';
import { ensureConfinedDirectory } from '../managed-path-safety.js';
import { missionDir } from '../mission.js';

/**
 * Where a session's official-subagent artifacts live: the mission directory
 * when a mission is active, otherwise a per-session state directory. A leaf
 * module on purpose — PreToolUse gates need only this path, not the lifecycle.
 */
export function officialSubagentArtifactDir(root: any, state: any = {}, sessionKey: any = null): string {
  if (state?.mission_id) return missionDir(root, state.mission_id);
  return path.join(root, '.sneakoscope', 'state', 'subagents', sha256(String(sessionKey || 'default')).slice(0, 32));
}

export async function ensureOfficialSubagentArtifactDirConfined(root: string, artifactDir: string): Promise<void> {
  await ensureConfinedDirectory(path.resolve(root), path.resolve(artifactDir));
}
