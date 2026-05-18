// @ts-nocheck
import { collectProofEvidence } from './evidence-collector.js';

export async function fileChangeLedger(root) {
  const evidence = await collectProofEvidence(root);
  return evidence.files || [];
}
