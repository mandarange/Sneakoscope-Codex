import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { digestPatch } from './glm-naruto-patch-envelope.js';

export interface QuorumResult {
  readonly shardId: string;
  readonly consensusDigest: string | null;
  readonly voteCount: number;
  readonly totalCandidates: number;
  readonly consensusPatches: readonly string[];
}

export function evaluateQuorum(envelopes: readonly GlmNarutoPatchEnvelope[]): readonly QuorumResult[] {
  const byShard = new Map<string, GlmNarutoPatchEnvelope[]>();
  for (const env of envelopes) {
    if (env.status !== 'gate_passed' && env.status !== 'candidate') continue;
    const list = byShard.get(env.shard_id) || [];
    list.push(env);
    byShard.set(env.shard_id, list);
  }

  const results: QuorumResult[] = [];
  for (const [shardId, envs] of byShard) {
    const digestCounts = new Map<string, { count: number; patches: string[] }>();
    for (const env of envs) {
      const digest = digestPatch(env.patch);
      const existing = digestCounts.get(digest) || { count: 0, patches: [] };
      existing.count++;
      existing.patches.push(env.patch);
      digestCounts.set(digest, existing);
    }

    let best: { count: number; patches: string[]; digest: string } | null = null;
    for (const [digest, info] of digestCounts) {
      if (!best || info.count > best.count) {
        best = { count: info.count, patches: info.patches, digest };
      }
    }

    results.push({
      shardId,
      consensusDigest: best ? best.digest : null,
      voteCount: best ? best.count : 0,
      totalCandidates: envs.length,
      consensusPatches: best ? best.patches : []
    });
  }

  return results;
}
