import path from 'node:path'
import { ensureDir, readJson, writeJsonAtomic } from './fsx.js'
import { validateWikiCoordinateIndex } from './wiki-coordinate.js'
import { validateTriWikiContextPackProvenance } from './triwiki-provenance.js'

// Inference-path TriWiki consumption. Routes/the agent kernel READ the deployed
// context pack written by `sks wiki refresh|pack` (the SSOT); they never rebuild
// it on the hot path. This is the seam that turns the TriWiki engine from an
// advisory prompt note into an actually-consulted, proof-referenced context source.
export const TRIWIKI_CONTEXT_PACK_REL = '.sneakoscope/wiki/context-pack.json'
export const TRIWIKI_RUNTIME_SCHEMA = 'sks.triwiki-runtime-context.v1'

export interface TriWikiRuntimeContext {
  schema: string
  present: boolean
  context_pack_path: string
  context_pack_hash: string | null
  mission: string | null
  use_first: any[]
  hydrate_first: any[]
  claim_count: number
  anchor_count: number
  trust_avg: number | null
  warning: string | null
}

function emptyContext(file: string, warning = 'no_triwiki_context_pack (run `sks wiki refresh` to populate the project memory pack)'): TriWikiRuntimeContext {
  return {
    schema: TRIWIKI_RUNTIME_SCHEMA,
    present: false,
    context_pack_path: file,
    context_pack_hash: null,
    mission: null,
    use_first: [],
    hydrate_first: [],
    claim_count: 0,
    anchor_count: 0,
    trust_avg: null,
    warning
  }
}

/**
 * Load the deployed TriWiki context pack for a project root. Read-only; tolerant
 * of an absent/corrupt pack (returns present:false + a warning so the route still
 * runs as a graceful fallback). Never invokes pack rebuild or any model call.
 */
export async function loadTriWikiRuntimeContext(root: string): Promise<TriWikiRuntimeContext> {
  const file = path.join(path.resolve(root), TRIWIKI_CONTEXT_PACK_REL)
  let pack: any = null
  try {
    pack = await readJson(file, null)
  } catch {
    pack = null
  }
  if (!pack || typeof pack !== 'object') return emptyContext(file)
  const attention = pack.attention
  const wiki = pack.wiki
  if (!wiki || typeof wiki !== 'object') {
    return emptyContext(file, 'invalid_triwiki_context_pack:wiki_index_missing (run `sks wiki refresh`)')
  }
  const coordinateValidation = validateWikiCoordinateIndex(wiki, { root, claims: pack.claims })
  const provenanceValidation = validateTriWikiContextPackProvenance(pack, { root })
  const issues = [...coordinateValidation.issues, ...provenanceValidation.issues]
  if (issues.length) {
    const issueIds = issues.map((issue: any) => String(issue.id || 'unknown')).slice(0, 8)
    return emptyContext(file, `invalid_triwiki_context_pack:${issueIds.join(',')} (run \`sks wiki refresh\`)`)
  }
  if (!attention || !Array.isArray(attention.use_first) || !Array.isArray(attention.hydrate_first) || !Array.isArray(pack.claims)) {
    return emptyContext(file, 'invalid_triwiki_context_pack:attention_or_claims_missing (run `sks wiki refresh`)')
  }
  const anchorCount = Array.isArray(wiki.a) ? wiki.a.length : (Array.isArray(wiki.anchors) ? wiki.anchors.length : 0)
  return {
    schema: TRIWIKI_RUNTIME_SCHEMA,
    present: true,
    context_pack_path: file,
    context_pack_hash: pack.provenance.payload_sha256,
    mission: typeof pack.mission === 'string' ? pack.mission : null,
    use_first: Array.isArray(attention.use_first) ? attention.use_first : [],
    hydrate_first: Array.isArray(attention.hydrate_first) ? attention.hydrate_first : [],
    claim_count: Array.isArray(pack.claims) ? pack.claims.length : 0,
    anchor_count: anchorCount,
    trust_avg: typeof pack.trust_summary?.avg === 'number' ? pack.trust_summary.avg : null,
    warning: null
  }
}

/** Compact instruction block injected into read-only agents / route additionalContext. */
export function triWikiContextBlock(ctx: TriWikiRuntimeContext): string {
  if (!ctx.present) return `TriWiki unavailable: ${ctx.warning || 'context pack missing or invalid'}; do not rely on cached project memory.`
  const ids = (rows: any[]) => rows.map((row: any) => (Array.isArray(row) ? row[0] : row?.id)).filter(Boolean).slice(0, 6)
  const use = ids(ctx.use_first)
  const hyd = ids(ctx.hydrate_first)
  return [
    `TriWiki context pack: ${ctx.claim_count} claims, ${ctx.anchor_count} anchors (trust avg ${ctx.trust_avg ?? 'n/a'}).`,
    use.length ? `use_first (high-trust; recall first): ${use.join(', ')}` : 'use_first: none',
    hyd.length ? `hydrate_first (verify source before risky/user-visible actions): ${hyd.join(', ')}` : 'hydrate_first: none'
  ].join('\n')
}

/** Proof fields recorded by the kernel/route so its proof references the wiki it acted on. */
export function triWikiProofRecord(ctx: TriWikiRuntimeContext) {
  return {
    triwiki_context_consulted: ctx.present,
    context_pack_hash: ctx.context_pack_hash,
    context_pack_path: ctx.context_pack_path,
    triwiki_use_first_count: ctx.use_first.length,
    triwiki_hydrate_first_count: ctx.hydrate_first.length,
    triwiki_claim_count: ctx.claim_count,
    triwiki_anchor_count: ctx.anchor_count,
    warning: ctx.warning
  }
}

/** Persist the consulted TriWiki context as a per-mission proof artifact. */
export async function writeTriWikiContextArtifact(ledgerRoot: string, ctx: TriWikiRuntimeContext): Promise<string> {
  const file = path.join(path.resolve(ledgerRoot), 'agent-triwiki-context.json')
  await ensureDir(path.dirname(file))
  await writeJsonAtomic(file, { ...ctx, proof: triWikiProofRecord(ctx) })
  return file
}
