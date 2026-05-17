import { collectProofEvidence } from './evidence-collector.mjs';

export async function fileChangeLedger(root) {
  const evidence = await collectProofEvidence(root);
  return evidence.files || [];
}
