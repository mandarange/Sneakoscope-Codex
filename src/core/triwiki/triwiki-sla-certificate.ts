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
  release_equivalent_within_scope: boolean;
  gates: number;
  gate_packs: string[];
  blockers: string[];
}

export function buildTriWikiSlaCertificate(input: {
  graph: TriWikiAffectedGraph;
  slaMs: number;
  estimatedCriticalPathMs: number;
  estimatedSequentialMs: number;
  blockers?: string[];
}): TriWikiSlaCertificate {
  const reductionRatio = input.estimatedSequentialMs <= 0 ? 1 : input.estimatedCriticalPathMs / input.estimatedSequentialMs;
  const blockers = input.blockers || [];
  if (input.estimatedCriticalPathMs > input.slaMs) blockers.push('sla_estimate_exceeds_budget');
  return {
    schema: TRIWIKI_SLA_CERTIFICATE_SCHEMA,
    ok: blockers.length === 0,
    created_at: new Date().toISOString(),
    tier: input.graph.tier,
    sla_ms: input.slaMs,
    estimated_critical_path_ms: input.estimatedCriticalPathMs,
    estimated_sequential_ms: input.estimatedSequentialMs,
    reduction_ratio: Number(reductionRatio.toFixed(4)),
    release_equivalent_within_scope: input.graph.release_equivalent_within_scope,
    gates: input.graph.gates.length,
    gate_packs: input.graph.gate_packs,
    blockers
  };
}

export function writeTriWikiSlaCertificate(root: string, certificate: TriWikiSlaCertificate): string {
  const file = path.join(root, '.sneakoscope', 'reports', 'triwiki-sla-certificate.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(certificate, null, 2)}\n`);
  return file;
}
