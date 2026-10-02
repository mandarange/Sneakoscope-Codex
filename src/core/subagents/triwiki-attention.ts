/**
 * Bounded TriWiki attention for official subagents.
 *
 * Anchors are now the answer to a Context Graph query: seeds resolved from the
 * goal, a profile-bounded traversal, deterministic ranking, and a token-packed
 * selection where every anchor carries a reason path and provenance back to a
 * repository path. The token-overlap scorer this module used to run is gone —
 * not renamed, not kept behind a flag, and not reachable from a catch handler.
 *
 * When the stored graph is missing, corrupt or stale the result is
 * `available: false` with the matching `context_graph_*` reason and the repair
 * command. A subagent preface that quietly degrades to text matching is worse
 * than one that says it has no anchors, because the caller cannot tell the
 * difference from the output.
 */
import { CONTEXT_GRAPH_REPAIR_COMMAND } from '../triwiki/context-graph/contracts.js'
import type { ContextGraphFreshness } from '../triwiki/context-graph/contracts.js'
import type { ContextGraphQueryProfileName } from '../triwiki/context-graph/profiles.js'
import {
  readContextGraphAttention,
  type ContextGraphAttentionOptions,
  type ContextGraphAttentionReason
} from '../triwiki/context-graph/projections/attention.js'
import type { ProjectedAttentionAnchor } from '../triwiki/context-graph/projections/anchors.js'

export const BOUNDED_TRIWIKI_ATTENTION_SCHEMA = 'sks.subagent-triwiki-attention.v1'
export const DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT = 8
export const MAX_TRIWIKI_ATTENTION_ANCHOR_LIMIT = 16
/** Anchors are a preface, not a briefing. */
export const DEFAULT_TRIWIKI_ATTENTION_TOKEN_BUDGET = 2000

export const TRIWIKI_ATTENTION_GRAPH_SOURCE = '.sneakoscope/wiki/context-graph.json'

export type BoundedTriwikiAttentionSource = typeof TRIWIKI_ATTENTION_GRAPH_SOURCE

export interface BoundedTriwikiAttentionProvenance {
  path: string
  line?: number
  hash: string
}

export interface BoundedTriwikiAttentionAnchor {
  id: string
  claim_hash: string | null
  source_hash: string | null
  hydrate_hint: string | null
  /** Hop chain the query walked to reach this anchor; empty when it was declared, not traversed. */
  reason_path: string[]
  trust_score: number
  freshness: ContextGraphFreshness
  token_cost: number
  provenance: BoundedTriwikiAttentionProvenance[]
  /** Exact source excerpt materialized by SKS, never an LLM summary. */
  excerpt?: string
  source_path?: string
  optional?: boolean
}

export interface BoundedTriwikiAttention {
  schema: typeof BOUNDED_TRIWIKI_ATTENTION_SCHEMA
  source: BoundedTriwikiAttentionSource
  available: boolean
  attention_mode: string | null
  anchor_limit: number
  anchors: BoundedTriwikiAttentionAnchor[]
  hydration_policy: 'on_demand_only'
  full_pack_injected: false
  /** Explicit unavailability reason; never a silent empty set. */
  reason: ContextGraphAttentionReason | null
  repair_command: typeof CONTEXT_GRAPH_REPAIR_COMMAND
  snapshot_hash: string | null
  snapshot_freshness: 'fresh' | 'stale' | null
  profile: ContextGraphQueryProfileName | null
  token_cost: number
  token_budget: number
}

export interface ReadBoundedTriwikiAttentionOptions extends ContextGraphAttentionOptions {
  /** `implementation` (default) for build work, `answer` for knowledge retrieval. */
  readonly profile?: ContextGraphQueryProfileName | undefined
  readonly tokenBudget?: number | undefined
  readonly risk?: 'normal' | 'high' | undefined
  /**
   * Workspace-relative paths the mission already names — a slice's declared
   * write scope, the files a fix touches. A goal sentence almost never contains
   * them, so without this the anchors are chosen from prose alone.
   */
  readonly changedPaths?: readonly string[] | undefined
}

/**
 * Resolve bounded attention anchors for `root` from the Context Graph.
 *
 * The signature is unchanged; the selection mechanism is not. `query` is the
 * subagent goal and is used as the graph query, so relevance comes from the
 * repository's own structure rather than from words shared with an anchor id.
 */
export async function readBoundedTriwikiAttention(
  root: string,
  limit: number = DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT,
  query: string = '',
  options: ReadBoundedTriwikiAttentionOptions = {}
): Promise<BoundedTriwikiAttention> {
  const anchorLimit = normalizeLimit(limit)
  const tokenBudget = Math.max(0, options.tokenBudget ?? DEFAULT_TRIWIKI_ATTENTION_TOKEN_BUDGET)
  const result = await readContextGraphAttention(
    {
      root,
      query,
      limit: anchorLimit,
      profile: options.profile ?? 'implementation',
      tokenBudget,
      risk: options.risk,
      changedPaths: options.changedPaths
    },
    options
  )

  return {
    schema: BOUNDED_TRIWIKI_ATTENTION_SCHEMA,
    source: TRIWIKI_ATTENTION_GRAPH_SOURCE,
    available: result.available,
    attention_mode: result.available ? `context_graph:${result.profile}` : null,
    anchor_limit: anchorLimit,
    anchors: result.anchors.map(toAnchor),
    hydration_policy: 'on_demand_only',
    full_pack_injected: false,
    reason: result.reason,
    repair_command: CONTEXT_GRAPH_REPAIR_COMMAND,
    snapshot_hash: result.snapshotHash,
    snapshot_freshness: result.snapshotFreshness,
    profile: result.available ? result.profile : null,
    token_cost: result.tokenCost,
    token_budget: result.tokenBudget
  }
}

function toAnchor(anchor: ProjectedAttentionAnchor): BoundedTriwikiAttentionAnchor {
  return {
    id: anchor.id,
    claim_hash: anchor.claim_hash,
    source_hash: anchor.source_hash,
    hydrate_hint: anchor.hydrate_hint,
    reason_path: anchor.reason_path,
    trust_score: anchor.trust_score,
    freshness: anchor.freshness,
    token_cost: anchor.token_cost,
    provenance: anchor.provenance.map((ref) => ({
      path: ref.path,
      ...(ref.line === undefined ? {} : { line: ref.line }),
      hash: ref.hash
    }))
  }
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT
  return Math.max(1, Math.min(MAX_TRIWIKI_ATTENTION_ANCHOR_LIMIT, Math.floor(parsed)))
}
