import { runCodex0140RealProbes } from './codex-0140-real-probes.js';

export async function runCodex0140ProbeRunner(input: { root: string; requireReal?: boolean; allowNetwork?: boolean }) {
  return runCodex0140RealProbes(input);
}
