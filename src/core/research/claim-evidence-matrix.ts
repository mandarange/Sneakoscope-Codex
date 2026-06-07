import path from 'node:path';
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js';

export interface ClaimEvidenceMatrix {
  schema: 'sks.claim-evidence-matrix.v1'
  mission_id: string
  claims: Array<{
    id: string
    claim: string
    claim_type: 'fact' | 'inference' | 'hypothesis' | 'recommendation' | 'implementation_guidance'
    importance: 'low' | 'medium' | 'high' | 'critical'
    source_ids: string[]
    local_evidence_ids: string[]
    counterevidence_ids: string[]
    triangulation: {
      source_layers: string[]
      independent_confirmation_count: number
      conflicts: string[]
    }
    confidence: 'low' | 'medium' | 'high'
    falsifiable: boolean
    test_or_probe: string
  }>
  key_claim_ids: string[]
  unsupported_claims: string[]
  triangulated_claim_count: number
  blockers: string[]
}

export interface ClaimEvidenceMatrixSummary {
  present: boolean
  matrix: ClaimEvidenceMatrix
  key_claim_ids: string[]
  unsupported_claims: string[]
  triangulated_claim_count: number
  blockers: string[]
}

export const CLAIM_EVIDENCE_MATRIX_ARTIFACT = 'claim-evidence-matrix.json';

export function defaultClaimEvidenceMatrix(missionId = ''): ClaimEvidenceMatrix {
  return {
    schema: 'sks.claim-evidence-matrix.v1',
    mission_id: missionId,
    claims: [],
    key_claim_ids: [],
    unsupported_claims: [],
    triangulated_claim_count: 0,
    blockers: []
  };
}

export async function readClaimEvidenceMatrix(dir: string): Promise<ClaimEvidenceMatrixSummary> {
  const file = path.join(dir, CLAIM_EVIDENCE_MATRIX_ARTIFACT);
  const present = await exists(file);
  const matrix = normalizeClaimEvidenceMatrix(await readJson(file, null));
  return {
    present,
    matrix,
    key_claim_ids: matrix.key_claim_ids,
    unsupported_claims: matrix.unsupported_claims,
    triangulated_claim_count: matrix.triangulated_claim_count,
    blockers: present ? matrix.blockers : ['claim_evidence_matrix_missing']
  };
}

export async function writeClaimEvidenceMatrix(dir: string, matrix: ClaimEvidenceMatrix): Promise<ClaimEvidenceMatrix> {
  const normalized = normalizeClaimEvidenceMatrix(matrix);
  await writeJsonAtomic(path.join(dir, CLAIM_EVIDENCE_MATRIX_ARTIFACT), normalized);
  return normalized;
}

export function validateClaimEvidenceMatrix(matrix: ClaimEvidenceMatrix, sourceLedger: any = null, falsificationLedger: any = null): { ok: boolean; blockers: string[] } {
  const normalized = normalizeClaimEvidenceMatrix(matrix);
  const claimIds = new Set(normalized.claims.map((claim) => claim.id));
  const sourceIds = sourceIdSet(sourceLedger);
  const counterIds = new Set([
    ...Array.from(sourceIds).filter((id) => /counter/i.test(id)),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources.map((row: any) => String(row?.id || '')).filter(Boolean) : []),
    ...(Array.isArray(falsificationLedger?.cases) ? falsificationLedger.cases.flatMap((row: any) => [row?.id, ...(Array.isArray(row?.counterevidence_source_ids) ? row.counterevidence_source_ids : []), ...(Array.isArray(row?.source_ids) ? row.source_ids : [])]).map(String).filter(Boolean) : [])
  ]);
  const blockers: string[] = [];
  for (const id of normalized.key_claim_ids) if (!claimIds.has(id)) blockers.push(`key_claim_missing:${id}`);
  for (const claim of normalized.claims) {
    const important = claim.importance === 'high' || claim.importance === 'critical';
    if (important && !claim.source_ids.length) blockers.push(`claim_source_missing:${claim.id}`);
    if (claim.importance === 'critical' && !claim.counterevidence_ids.length) blockers.push(`critical_claim_counterevidence_missing:${claim.id}`);
    for (const sourceId of claim.source_ids) if (!sourceIds.has(sourceId)) blockers.push(`claim_source_unknown:${claim.id}:${sourceId}`);
    for (const counterId of claim.counterevidence_ids) if (!counterIds.has(counterId)) blockers.push(`claim_counterevidence_unknown:${claim.id}:${counterId}`);
    if (claim.claim_type === 'hypothesis' && !claim.test_or_probe.trim()) blockers.push(`hypothesis_probe_missing:${claim.id}`);
  }
  for (const id of normalized.unsupported_claims) {
    const claim = normalized.claims.find((row) => row.id === id);
    if (claim?.importance === 'high' || claim?.importance === 'critical') blockers.push(`unsupported_important_claim:${id}`);
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function normalizeClaimEvidenceMatrix(value: any): ClaimEvidenceMatrix {
  const raw = value && typeof value === 'object' ? value : {};
  const claims: ClaimEvidenceMatrix['claims'] = (Array.isArray(raw.claims) ? raw.claims : []).map(normalizeClaim).filter((claim: any) => claim.id);
  const keyClaimIds = normalizeStringList(raw.key_claim_ids).filter((id) => claims.some((claim: ClaimEvidenceMatrix['claims'][number]) => claim.id === id));
  const unsupported = normalizeStringList(raw.unsupported_claims);
  return {
    schema: 'sks.claim-evidence-matrix.v1',
    mission_id: String(raw.mission_id || ''),
    claims,
    key_claim_ids: keyClaimIds,
    unsupported_claims: unsupported,
    triangulated_claim_count: Number.isFinite(Number(raw.triangulated_claim_count))
      ? Math.max(0, Math.floor(Number(raw.triangulated_claim_count)))
      : claims.filter((claim: ClaimEvidenceMatrix['claims'][number]) => claim.triangulation.independent_confirmation_count >= 2 && claim.triangulation.source_layers.length >= 2).length,
    blockers: normalizeStringList(raw.blockers)
  };
}

export function buildClaimEvidenceMatrixFromLedgers(input: {
  missionId?: string | null
  sourceLedger?: any
  noveltyLedger?: any
  falsificationLedger?: any
} = {}): ClaimEvidenceMatrix {
  const entries = Array.isArray(input.noveltyLedger?.entries) ? input.noveltyLedger.entries : [];
  const sources = Array.isArray(input.sourceLedger?.sources) ? input.sourceLedger.sources : [];
  const counterSources = Array.isArray(input.sourceLedger?.counterevidence_sources) ? input.sourceLedger.counterevidence_sources : [];
  const fallbackSourceIds = sources.map((row: any) => String(row?.id || '')).filter(Boolean);
  const fallbackCounterIds = counterSources.map((row: any) => String(row?.id || '')).filter(Boolean);
  const claims: ClaimEvidenceMatrix['claims'] = entries.map((entry: any, index: number) => {
    const id = String(entry.id || `claim-${index + 1}`);
    const sourceIds = normalizeStringList(entry.source_ids || entry.evidence).filter((sourceId) => fallbackSourceIds.includes(sourceId));
    const counterIds = normalizeStringList(entry.counterevidence_ids || entry.falsifiers).filter((sourceId) => fallbackCounterIds.includes(sourceId));
    return normalizeClaim({
      id,
      claim: entry.claim || entry.title || id,
      claim_type: 'hypothesis',
      importance: index < 2 ? 'critical' : 'high',
      source_ids: sourceIds.length ? sourceIds : fallbackSourceIds.slice(0, 2),
      counterevidence_ids: counterIds.length ? counterIds : fallbackCounterIds.slice(0, 1),
      triangulation: {
        source_layers: sourceLayersForSourceIds(input.sourceLedger, sourceIds.length ? sourceIds : fallbackSourceIds),
        independent_confirmation_count: Math.max(1, sourceIds.length || fallbackSourceIds.length),
        conflicts: []
      },
      confidence: entry.confidence >= 2 ? 'high' : 'medium',
      falsifiable: true,
      test_or_probe: entry.next_experiment || entry.test_or_probe || 'Run the proposed replication probe.'
    });
  });
  return normalizeClaimEvidenceMatrix({
    schema: 'sks.claim-evidence-matrix.v1',
    mission_id: input.missionId || '',
    claims,
    key_claim_ids: claims.slice(0, 8).map((claim: ClaimEvidenceMatrix['claims'][number]) => claim.id),
    unsupported_claims: [],
    triangulated_claim_count: claims.filter((claim: ClaimEvidenceMatrix['claims'][number]) => claim.triangulation.source_layers.length >= 2).length,
    blockers: []
  });
}

function normalizeClaim(value: any) {
  const importance = ['low', 'medium', 'high', 'critical'].includes(value?.importance) ? value.importance : 'medium';
  const claimType = ['fact', 'inference', 'hypothesis', 'recommendation', 'implementation_guidance'].includes(value?.claim_type) ? value.claim_type : 'hypothesis';
  const confidence = ['low', 'medium', 'high'].includes(value?.confidence) ? value.confidence : 'medium';
  return {
    id: String(value?.id || '').trim(),
    claim: String(value?.claim || '').trim(),
    claim_type: claimType,
    importance,
    source_ids: normalizeStringList(value?.source_ids),
    local_evidence_ids: normalizeStringList(value?.local_evidence_ids),
    counterevidence_ids: normalizeStringList(value?.counterevidence_ids),
    triangulation: {
      source_layers: normalizeStringList(value?.triangulation?.source_layers),
      independent_confirmation_count: Math.max(0, Math.floor(Number(value?.triangulation?.independent_confirmation_count || 0))),
      conflicts: normalizeStringList(value?.triangulation?.conflicts)
    },
    confidence,
    falsifiable: value?.falsifiable !== false,
    test_or_probe: String(value?.test_or_probe || '').trim()
  };
}

function sourceIdSet(sourceLedger: any): Set<string> {
  return new Set([
    ...(Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : [])
  ].map((row: any) => String(row?.id || '')).filter(Boolean));
}

function sourceLayersForSourceIds(sourceLedger: any, ids: string[]): string[] {
  const idSet = new Set(ids);
  return [...new Set([
    ...(Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : [])
  ].filter((row: any) => idSet.has(String(row?.id || ''))).map((row: any) => String(row?.layer || row?.source_layer || '')).filter(Boolean))];
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))];
}
