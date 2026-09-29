/**
 * Voxel/Trie architecture context adapter.
 * When no structured provider exists, returns an explicit empty context (provider: none).
 * Never parses generated AGENTS.md for structural facts.
 */
import type { ArchitectureMapProfile, VoxelArchitectureContext } from './contracts.js';
import { hashCanonical } from './fingerprint.js';

export function emptyVoxelContext(
  profile: ArchitectureMapProfile = 'global'
): VoxelArchitectureContext {
  return Object.freeze({
    provider: 'none',
    version: '0',
    seedNodeIds: Object.freeze([]),
    seedPaths: Object.freeze([]),
    riskDomains: Object.freeze([]),
    profile,
    workstreamHints: Object.freeze([]),
    tokenBudgetHint: null,
    protectedAreaIds: Object.freeze([])
  });
}

export function voxelContextHash(context: VoxelArchitectureContext): string {
  return hashCanonical(context);
}
