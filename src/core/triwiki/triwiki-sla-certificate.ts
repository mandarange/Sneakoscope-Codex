import fs from 'node:fs';
import path from 'node:path';
import type { TriWikiAffectedGraph } from './triwiki-affected-graph.js';

export const TRIWIKI_SLA_CERTIFICATE_SCHEMA = 'sks.triwiki-sla-certificate.v1';

export interface TriWikiSlaCertificate {
  schema: typeof TRIWIKI_SLA_CERTIFICATE_SCHEMA;
  ok: boolean;
  created_at: string;
  tier: string;
  sla_ms: number;
  estimated_critical_path_ms: number;
  estimated_sequential_ms: number;
  reduction_ratio: number;
  sla_met: boolean;
  release_equivalent_within_scope: boolean;
  gates: number;
  gate_packs: string[];
  blockers: string[];
  mode: 'plan' | 'actual';
  actual_duration_ms?: number;
  executed_gates?: number;
  executed_packs?: number;
  reused_proofs?: number;
  invalidated_proofs?: number;
  new_proofs?: number;
  skipped_as_valid_cache?: number;
  skipped_as_unaffected?: number;
  background_full_release?: boolean;
}

export function buildTriWikiSlaCertificate(input: {
  graph: TriWikiAffectedGraph;
  slaMs: number;
  estimatedCriticalPathMs: number;
  estimatedSequentialMs: number;
  blockers?: string[];
  mode?: 'plan' | 'actual';
  actualDurationMs?: number;
  executedGates?: number;
  executedPacks?: number;
  reusedProofs?: number;
  invalidatedProofs?: number;
  newProofs?: number;
  skippedAsValidCache?: number;
  skippedAsUnaffected?: number;
  backgroundFullRelease?: boolean;
}): TriWikiSlaCertificate {
  const reductionRatio = input.estimatedSequentialMs <= 0 ? 1 : input.estimatedCriticalPathMs / input.estimatedSequentialMs;
  const blockers = input.blockers || [];
  const mode = input.mode || 'plan';
  if (input.estimatedCriticalPathMs > input.slaMs) blockers.push('sla_estimate_exceeds_budget');
  if (mode === 'actual' && input.actualDurationMs !== undefined && input.actualDurationMs > input.slaMs) blockers.push('actual_duration_exceeds_budget');
  if (mode === 'actual' && input.actualDurationMs === undefined) blockers.push('actual_mode_missing_execution_stats');
  const certificate: TriWikiSlaCertificate = {
    schema: TRIWIKI_SLA_CERTIFICATE_SCHEMA,
    ok: blockers.length === 0,
    created_at: new Date().toISOString(),
    tier: input.graph.tier,
    sla_ms: input.slaMs,
    estimated_critical_path_ms: input.estimatedCriticalPathMs,
    estimated_sequential_ms: input.estimatedSequentialMs,
    reduction_ratio: Number(reductionRatio.toFixed(4)),
    sla_met: blockers.length === 0,
    release_equivalent_within_scope: input.graph.release_equivalent_within_scope,
    gates: input.graph.gates.length,
    gate_packs: input.graph.gate_packs,
    blockers,
    mode
  };
  if (input.actualDurationMs !== undefined) certificate.actual_duration_ms = input.actualDurationMs;
  if (input.executedGates !== undefined) certificate.executed_gates = input.executedGates;
  if (input.executedPacks !== undefined) certificate.executed_packs = input.executedPacks;
  if (input.reusedProofs !== undefined) certificate.reused_proofs = input.reusedProofs;
  if (input.invalidatedProofs !== undefined) certificate.invalidated_proofs = input.invalidatedProofs;
  if (input.newProofs !== undefined) certificate.new_proofs = input.newProofs;
  if (input.skippedAsValidCache !== undefined) certificate.skipped_as_valid_cache = input.skippedAsValidCache;
  if (input.skippedAsUnaffected !== undefined) certificate.skipped_as_unaffected = input.skippedAsUnaffected;
  if (input.backgroundFullRelease !== undefined) certificate.background_full_release = input.backgroundFullRelease;
  return certificate;
}

export function writeTriWikiSlaCertificate(root: string, certificate: TriWikiSlaCertificate): string {
  const file = path.join(root, '.sneakoscope', 'reports', 'triwiki-sla-certificate.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(certificate, null, 2)}\n`);
  return file;
}
