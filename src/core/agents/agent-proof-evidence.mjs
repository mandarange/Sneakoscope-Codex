import path from 'node:path';
import { readJson } from '../fsx.mjs';

export async function readAgentProofEvidence(root, missionId) {
  return readJson(path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'agent-proof-evidence.json'), null);
}
