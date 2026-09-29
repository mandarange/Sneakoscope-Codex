import type { ArchitectureMapProfile, ArchitectureScope } from './contracts.js';
import { byCodePoint } from './contracts.js';

export const SELECTION_RULE_VERSION = 'architecture-slice.v1' as const;

export function buildArchitectureScope(input: {
  profile: ArchitectureMapProfile;
  seedNodeIds?: readonly string[];
  seedPaths?: readonly string[];
}): ArchitectureScope {
  return Object.freeze({
    profile: input.profile,
    seedNodeIds: Object.freeze([...(input.seedNodeIds ?? [])].sort(byCodePoint)),
    seedPaths: Object.freeze([...(input.seedPaths ?? [])].sort(byCodePoint)),
    selectionRuleVersion: SELECTION_RULE_VERSION
  });
}

