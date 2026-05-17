import path from 'node:path';
import { exists, packageRoot, readJson, readText } from '../fsx.mjs';
import { emptyCompletionProof } from './proof-schema.mjs';
import { proofDir } from './proof-writer.mjs';

export async function readLatestProof(root = packageRoot()) {
  const file = path.join(proofDir(root), 'latest.json');
  if (!await exists(file)) return emptyCompletionProof({
    status: 'not_verified',
    unverified: ['No completion proof has been written yet.']
  });
  return readJson(file);
}

export async function readLatestProofMarkdown(root = packageRoot()) {
  const file = path.join(proofDir(root), 'latest.md');
  if (!await exists(file)) return '# SKS Completion Proof\n\nNo completion proof has been written yet.\n';
  return readText(file);
}
