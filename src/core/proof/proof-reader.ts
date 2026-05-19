import path from 'node:path';
import { exists, packageRoot, readJson, readText } from '../fsx.js';
import { emptyCompletionProof } from './proof-schema.js';
import { proofDir } from './proof-writer.js';
import { parseCompletionProof } from '../validators/completion-proof-validator.js';

export async function readLatestProof(root: any = packageRoot()) {
  const file = path.join(proofDir(root), 'latest.json');
  if (!await exists(file)) return emptyCompletionProof({
    status: 'not_verified',
    unverified: ['No completion proof has been written yet.']
  });
  return parseCompletionProof(await readJson(file));
}

export async function readLatestProofMarkdown(root: any = packageRoot()) {
  const file = path.join(proofDir(root), 'latest.md');
  if (!await exists(file)) return '# SKS Completion Proof\n\nNo completion proof has been written yet.\n';
  return readText(file);
}

export async function readRouteProof(root: any = packageRoot(), missionId: any = null) {
  if (missionId) {
    const missionProof = path.join(root, '.sneakoscope', 'missions', missionId, 'completion-proof.json');
    if (await exists(missionProof)) return parseCompletionProof(await readJson(missionProof));
    return null;
  }
  const latest = path.join(proofDir(root), 'latest.json');
  if (await exists(latest)) return parseCompletionProof(await readJson(latest));
  return null;
}
