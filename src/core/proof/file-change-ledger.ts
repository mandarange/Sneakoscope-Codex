import { collectProofEvidence } from './evidence-collector.js';

export async function fileChangeLedger(root: any) {
  const evidence = await collectProofEvidence(root);
  return evidence.files || [];
}
