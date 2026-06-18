import crypto from 'node:crypto';
import type { GlmNarutoShard, GlmNarutoWorkGraph, GlmNarutoDependency, GlmNarutoParallelGroup, GlmNarutoPatchStrategy } from './glm-naruto-types.js';
import { GLM_NARUTO_DEFAULTS, NARUTO_PATCH_STRATEGIES } from './glm-naruto-types.js';

export interface DecomposerInput {
  readonly missionId: string;
  readonly task: string;
  readonly gitStatus?: string | undefined;
  readonly mentionedPaths: readonly string[];
  readonly lastError?: string | undefined;
}

export function decomposeTask(input: DecomposerInput): GlmNarutoWorkGraph {
  const shards: GlmNarutoShard[] = [];
  const dependencies: GlmNarutoDependency[] = [];
  const mutableShardIds: string[] = [];
  const verificationShardIds: string[] = [];

  const paths = input.mentionedPaths.length > 0
    ? input.mentionedPaths
    : ['src/'];

  let shardIndex = 0;
  for (const targetPath of paths) {
    const shardId = `shard-${shardIndex}`;
    const strategy: GlmNarutoPatchStrategy = NARUTO_PATCH_STRATEGIES[shardIndex % NARUTO_PATCH_STRATEGIES.length] || 'minimal_patch';
    const isCritical = paths.length <= 2;
    const shard: GlmNarutoShard = {
      id: shardId,
      kind: classifyShardKind(targetPath),
      task: input.task,
      target_paths: [targetPath],
      forbidden_paths: ['.github/', 'dist/', 'node_modules/'],
      base_digest: digestBase(input),
      strategy,
      patches_per_shard: isCritical ? GLM_NARUTO_DEFAULTS.critical_patches_per_shard : GLM_NARUTO_DEFAULTS.default_patches_per_shard,
      max_tokens: GLM_NARUTO_DEFAULTS.default_max_tokens,
      reasoning: 'none',
      mutable: true
    };
    shards.push(shard);
    mutableShardIds.push(shardId);
    shardIndex++;
  }

  const verifyShard: GlmNarutoShard = {
    id: 'shard-verify',
    kind: 'verification',
    task: `Verify all patches for: ${input.task}`,
    target_paths: paths,
    forbidden_paths: ['.github/', 'dist/', 'node_modules/'],
    base_digest: digestBase(input),
    strategy: 'minimal_patch',
    patches_per_shard: 0,
    max_tokens: 4096,
    reasoning: 'low',
    mutable: false
  };
  shards.push(verifyShard);
  verificationShardIds.push(verifyShard.id);

  for (const mutableId of mutableShardIds) {
    dependencies.push({ from: mutableId, to: verifyShard.id, kind: 'verifies' });
  }

  const parallelGroup: GlmNarutoParallelGroup = {
    id: 'parallel-patch-wave',
    shard_ids: mutableShardIds,
    parallel: true
  };

  return {
    schema: 'sks.glm-naruto-work-graph.v1',
    mission_id: input.missionId,
    task: input.task,
    shards,
    dependencies,
    parallel_groups: [parallelGroup],
    mutable_shards: mutableShardIds,
    verification_shards: verificationShardIds
  };
}

function classifyShardKind(path: string): GlmNarutoShard['kind'] {
  if (path.includes('test') || path.includes('__tests__') || path.includes('.test.')) return 'test_fix';
  if (path.endsWith('.md') || path.endsWith('.txt')) return 'doc_patch';
  if (path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml') || path.endsWith('.toml')) return 'config_patch';
  if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.mjs')) return 'file_patch';
  return 'file_patch';
}

function digestBase(input: DecomposerInput): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    task: input.task,
    gitStatus: input.gitStatus || '',
    paths: input.mentionedPaths
  })).digest('hex').slice(0, 16);
}

export function validateWorkGraph(graph: GlmNarutoWorkGraph, isVerifyOnly: boolean): { ok: boolean; reason?: string } {
  if (isVerifyOnly) return { ok: true };
  const mutableCount = graph.mutable_shards.length;
  if (mutableCount === 0) return { ok: false, reason: 'glm_naruto_invalid_verify_only_plan' };
  // Check ratio of mutable shards to total shards (excluding verification shards from the denominator)
  const totalWorkShards = graph.shards.filter(s => s.mutable || s.kind !== 'verification').length;
  const ratio = totalWorkShards > 0 ? mutableCount / totalWorkShards : 0;
  if (ratio < GLM_NARUTO_DEFAULTS.patch_worker_ratio) {
    return { ok: false, reason: 'glm_naruto_insufficient_patch_workers' };
  }
  return { ok: true };
}
