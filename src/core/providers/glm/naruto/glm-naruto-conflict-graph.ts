import type { GlmNarutoConflictGraph, GlmNarutoConflictEdge, PatchCandidateNode, GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { envelopesHaveHunkConflict } from './glm-naruto-hunk-conflict.js';

export function buildConflictGraph(envelopes: readonly GlmNarutoPatchEnvelope[], nodes: readonly PatchCandidateNode[]): GlmNarutoConflictGraph {
  const edges: GlmNarutoConflictEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const left = nodes[i]!;
      const right = nodes[j]!;
      const conflict = detectConflict(left, right, envelopes);
      if (conflict) edges.push(conflict);
    }
  }
  return {
    schema: 'sks.glm-naruto-conflict-graph.v1',
    nodes,
    edges
  };
}

function detectConflict(left: PatchCandidateNode, right: PatchCandidateNode, envelopes: readonly GlmNarutoPatchEnvelope[]): GlmNarutoConflictEdge | null {
  if (left.patch_id === right.patch_id) return null;

  const leftEnv = envelopes.find((e) => e.worker_id === left.patch_id || e.patch_sha256 === left.patch_sha256);
  const rightEnv = envelopes.find((e) => e.worker_id === right.patch_id || e.patch_sha256 === right.patch_sha256);

  if (leftEnv && rightEnv && leftEnv.base_digest !== rightEnv.base_digest) {
    return { left_patch_id: left.patch_id, right_patch_id: right.patch_id, reason: 'base_digest_mismatch' };
  }

  if (left.shard_id === right.shard_id) {
    return { left_patch_id: left.patch_id, right_patch_id: right.patch_id, reason: 'same_hunk' };
  }

  const leftPaths = new Set(left.target_paths);
  const rightPaths = new Set(right.target_paths);
  const sharedFiles = [...leftPaths].filter((p) => rightPaths.has(p));
  if (sharedFiles.length > 0) {
    if (leftEnv && rightEnv) {
      if (!envelopesHaveHunkConflict(leftEnv, rightEnv)) return null;
      return { left_patch_id: left.patch_id, right_patch_id: right.patch_id, reason: 'same_hunk' };
    }
    return { left_patch_id: left.patch_id, right_patch_id: right.patch_id, reason: 'same_file' };
  }

  return null;
}

export function hasConflict(graph: GlmNarutoConflictGraph, patchId: string): boolean {
  return graph.edges.some((edge) => edge.left_patch_id === patchId || edge.right_patch_id === patchId);
}

export function getNonConflictingSets(graph: GlmNarutoConflictGraph): readonly (readonly string[])[] {
  const passed = graph.nodes.filter((n) => n.gate_passed);
  if (passed.length === 0) return [];

  const conflictMap = new Map<string, Set<string>>();
  for (const node of passed) conflictMap.set(node.patch_id, new Set());
  for (const edge of graph.edges) {
    if (conflictMap.has(edge.left_patch_id) && conflictMap.has(edge.right_patch_id)) {
      conflictMap.get(edge.left_patch_id)!.add(edge.right_patch_id);
      conflictMap.get(edge.right_patch_id)!.add(edge.left_patch_id);
    }
  }

  const results: string[][] = [];
  const sorted = [...passed].sort((a, b) => b.score - a.score);
  const used = new Set<string>();

  for (const node of sorted) {
    if (used.has(node.patch_id)) continue;
    const group: string[] = [node.patch_id];
    used.add(node.patch_id);
    for (const other of sorted) {
      if (used.has(other.patch_id)) continue;
      const conflicts = conflictMap.get(other.patch_id)!;
      if (!group.some((id) => conflicts.has(id))) {
        group.push(other.patch_id);
        used.add(other.patch_id);
      }
    }
    results.push(group);
  }

  return results;
}
