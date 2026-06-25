export const ULTRA_SEARCH_PROOF_SCHEMA = 'sks.ultra-search-proof.v1'
export const ULTRA_SEARCH_GATE_SCHEMA = 'sks.ultra-search-gate.v1'

export type UltraSearchMode =
  | 'fast'
  | 'balanced'
  | 'deep'
  | 'exhaustive'
  | 'url_acquisition'
  | 'x_search'
  | 'offline_cache'

export type SearchIntent =
  | 'current_fact'
  | 'official_documentation'
  | 'code_implementation'
  | 'known_url_fetch'
  | 'social_discourse'
  | 'x_specific'
  | 'academic'
  | 'news'
  | 'market_or_financial'
  | 'legal_or_policy'
  | 'media_transcript'
  | 'comparative_research'
  | 'counter_evidence'
  | 'unknown'

export type AcquisitionVerdict =
  | 'verified_content'
  | 'weak_content'
  | 'partial_content'
  | 'challenge'
  | 'blocked'
  | 'auth_required'
  | 'not_found'
  | 'rate_limited'
  | 'unknown'

export interface UltraSearchAxis {
  axis_id: string
  question: string
  territories: string[]
  done_when: string[]
  priority: 'P0' | 'P1' | 'P2'
  overlap_keys: string[]
}

export interface UltraSourceRecord {
  source_id: string
  provider_id: string
  source_family: string
  source_type: string
  title: string
  canonical_url: string | null
  original_url: string | null
  domain: string | null
  author: string | null
  published_at: string | null
  updated_at: string | null
  retrieved_at: string
  language: string | null
  snippet: string
  content_artifact: string | null
  content_sha256: string | null
  content_length: number | null
  acquisition_verdict: AcquisitionVerdict
  acquisition_path: string[]
  authority_tier: 'A0' | 'A1' | 'B' | 'C' | 'D' | 'E'
  freshness_score: number
  relevance_score: number
  trust_score: number
  primary_source: boolean
  authenticated_source: boolean
  local_only_raw: boolean
  duplicate_cluster_id: string | null
  independence_cluster_id: string | null
  warnings: string[]
  blockers: string[]
}

export interface LeadRaisedEvent {
  event_id: string
  parent_task_id: string
  wave: number
  lead_id: string
  kind: 'source' | 'claim' | 'contradiction' | 'repo' | 'person' | 'version' | 'dead_end'
  summary: string
  why_it_matters: string
  suggested_query: string
  source_ids: string[]
  priority: 'P0' | 'P1' | 'P2'
}

export interface UltraClaim {
  claim_id: string
  text: string
  claim_type: 'code_behavior' | 'numeric' | 'dated' | 'legal' | 'financial' | 'causal' | 'capability' | 'opinion' | 'social_signal'
  risk: 'low' | 'normal' | 'high'
  source_ids: string[]
  independent_domains: string[]
  primary_source_ids: string[]
  counter_search_ids: string[]
  verification_artifacts: string[]
  status: 'verified' | 'supported' | 'unresolved' | 'refuted'
}

export interface UltraSearchConvergence {
  schema: 'sks.ultra-search-convergence.v1'
  waves_completed: number
  minimum_waves_required: number
  new_leads_per_wave: number[]
  unchecked_leads: number
  consecutive_zero_lead_waves: number
  max_depth: number
  status: 'converged' | 'bounded_with_open_leads' | 'blocked_by_source_access' | 'budget_exhausted' | 'cancelled'
  reason: string
}

export interface UltraSearchProof {
  schema: typeof ULTRA_SEARCH_PROOF_SCHEMA
  ok: boolean
  mode: UltraSearchMode
  intent: SearchIntent
  provider_independent: boolean
  xai_runtime_dependency: false
  snippet_only_final_claims: number
  weak_content_final_claims: number
  source_count: number
  verified_source_count: number
  claim_count: number
  unresolved_high_risk_claims: number
  convergence: UltraSearchConvergence
  blockers: string[]
  warnings: string[]
}

export interface UltraSearchResult {
  schema: 'sks.ultra-search-result.v1'
  generated_at: string
  ok: boolean
  mission_id: string
  artifact_dir: string
  query: string
  mode: UltraSearchMode
  intent: SearchIntent
  axes: UltraSearchAxis[]
  query_variants: string[]
  provider_plan: {
    selected_capabilities: string[]
    selected_providers: string[]
    blockers: string[]
    warnings: string[]
  }
  sources: UltraSourceRecord[]
  leads: LeadRaisedEvent[]
  claims: UltraClaim[]
  convergence: UltraSearchConvergence
  proof: UltraSearchProof
  synthesis: string
  blockers: string[]
  warnings: string[]
  cache: {
    key: string
    hit: boolean
    stale: boolean
    ttl_ms: number
    age_ms: number | null
    artifact: string
  }
}

export type UltraSearchSourceFunction = (query: string) => Promise<unknown>
