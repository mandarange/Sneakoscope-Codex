import { sha256 } from '../fsx.js'
import type { CodexTaskInput } from '../codex-control/codex-control-plane.js'
import { SksLruCache } from '../perf/lru-cache.js'
import type { DecisionBinding, JevExecutionPlan } from '../decisions/types.js'

const cache = new SksLruCache<unknown>(128)
const JEV_PLAN_TTL_MS = 45_000

export function codexRouteCacheKey(input: CodexTaskInput) {
  return sha256(JSON.stringify({
    route: input.route,
    tier: input.tier || null,
    prompt: String(input.prompt || '').slice(0, 4000),
    files: input.inputFiles || [],
    images: (input.inputImages || []).length,
    sandbox: input.sandboxPolicy,
    backend_preference: input.backendPreference || [],
    write_paths: input.requestedScopeContract?.write_paths || [],
    allowed_paths: input.requestedScopeContract?.allowed_paths || []
  }))
}

export function readRouteCache<T>(key: string): T | null {
  return cache.get(key) as T | null
}

export function writeRouteCache<T>(key: string, value: T) {
  cache.set(key, value)
  return value
}

/** Digest-bound key for a compiled Jev plan. Every input that can change the
 * meaning of a profile is part of the key; a prompt-only cache is unsafe. */
export function jevPlanCacheKey(input: {
  workflowId: string;
  turnId?: string | null;
  sourceDigest?: string | null;
  graphDigest?: string | null;
  candidateDigest?: string | null;
  stageManifestDigest?: string | null;
  policyRevision?: string | null;
  memoryPolicyRevision?: string | null;
  configDigest?: string | null;
}) {
  return sha256(JSON.stringify({
    workflow: input.workflowId,
    turn: input.turnId || null,
    source: input.sourceDigest || null,
    graph: input.graphDigest || null,
    candidate: input.candidateDigest || null,
    stage_manifest: input.stageManifestDigest || null,
    policy: input.policyRevision || null,
    memory_policy: input.memoryPolicyRevision || null,
    config: input.configDigest || null
  }))
}

export function clearRouteCache() {
  cache.clear()
  jevPlanMemos.clear()
}

export interface JevPlanMemo {
  called: boolean
  reason: string
  semanticRoundTrips: number
  executionPlan: JevExecutionPlan
  routeId: string | null
  baselineRouteId: string | null
  imageNeeded: boolean | null
  parallel: boolean | null
  executionProfile: JevExecutionPlan['execution_profile']
  memoryDisposition: JevExecutionPlan['memory_mode']
  contextProfile: JevExecutionPlan['context_profile']
  qaProfile: JevExecutionPlan['qa_profile']
  decisionBinding: DecisionBinding | null
  tier: { model: string; effort: string; tier: string } | null
}
const jevPlanMemos = new SksLruCache<JevPlanMemo>(128, 2)

export function readJevPlanMemo(key: string, now = Date.now()): JevPlanMemo | null {
  const memo = jevPlanMemos.getFresh(key, JEV_PLAN_TTL_MS, now)
  if (!memo || memo.executionPlan.expires_at <= now) {
    jevPlanMemos.delete(key)
    return null
  }
  return memo
}

export function writeJevPlanMemo(key: string, memo: JevPlanMemo, now = Date.now()): JevPlanMemo {
  if (memo.executionPlan.expires_at > now) jevPlanMemos.set(key, memo, now)
  return memo
}

/** One bounded cache and one single-flight owner for the complete turn plan. */
export async function memoizeJevPlan(key: string, compute: () => Promise<JevPlanMemo>): Promise<{ value: JevPlanMemo; cacheHit: boolean }> {
  readJevPlanMemo(key); // Evict expired entries before joining a flight.
  return jevPlanMemos.getOrCompute(key, compute, Date.now(), (memo) => memo.called && memo.reason === 'applied'
    && ['keep_baseline', 'ephemeral_turn'].includes(memo.memoryDisposition));
}
export function invalidateJevPlanCache(): void { jevPlanMemos.clear(); }
