import path from 'node:path';
import { readJson, writeJsonAtomic } from '../fsx.js';

export interface ResearchQualityContract {
  schema: 'sks.research-quality-contract.v1'
  min_sources_total: number
  min_source_layers_covered: number
  min_counterevidence_sources: number
  min_trianguled_claims: number
  min_key_claims: number
  min_implementation_blueprint_sections: number
  min_falsification_cases: number
  min_experiment_steps: number
  min_report_words: number
  required_artifacts: string[]
}

export const RESEARCH_QUALITY_CONTRACT_ARTIFACT = 'research-quality-contract.json';

export const DEFAULT_RESEARCH_QUALITY_CONTRACT: ResearchQualityContract = {
  schema: 'sks.research-quality-contract.v1',
  min_sources_total: 12,
  min_source_layers_covered: 5,
  min_counterevidence_sources: 2,
  min_trianguled_claims: 6,
  min_key_claims: 8,
  min_implementation_blueprint_sections: 8,
  min_falsification_cases: 4,
  min_experiment_steps: 5,
  min_report_words: 2200,
  required_artifacts: [
    'research-report.md',
    'implementation-blueprint.md',
    'implementation-blueprint.json',
    'claim-evidence-matrix.json',
    'source-ledger.json',
    'source-quality-report.json',
    'falsification-ledger.json',
    'experiment-plan.md',
    'replication-pack.json',
    'research-gate.json'
  ]
};

export function normalizeResearchQualityContract(input: any = {}): ResearchQualityContract {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ...DEFAULT_RESEARCH_QUALITY_CONTRACT,
    ...source,
    schema: 'sks.research-quality-contract.v1',
    min_sources_total: positiveInt(source.min_sources_total, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_sources_total),
    min_source_layers_covered: positiveInt(source.min_source_layers_covered, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_source_layers_covered),
    min_counterevidence_sources: positiveInt(source.min_counterevidence_sources, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_counterevidence_sources),
    min_trianguled_claims: positiveInt(source.min_trianguled_claims ?? source.min_triangulated_claims, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_trianguled_claims),
    min_key_claims: positiveInt(source.min_key_claims, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_key_claims),
    min_implementation_blueprint_sections: positiveInt(source.min_implementation_blueprint_sections, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_implementation_blueprint_sections),
    min_falsification_cases: positiveInt(source.min_falsification_cases, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_falsification_cases),
    min_experiment_steps: positiveInt(source.min_experiment_steps, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_experiment_steps),
    min_report_words: positiveInt(source.min_report_words, DEFAULT_RESEARCH_QUALITY_CONTRACT.min_report_words),
    required_artifacts: Array.isArray(source.required_artifacts) && source.required_artifacts.length
      ? source.required_artifacts.map(String)
      : [...DEFAULT_RESEARCH_QUALITY_CONTRACT.required_artifacts]
  };
}

export async function readResearchQualityContract(dir: string): Promise<ResearchQualityContract> {
  const contract = await readJson(path.join(dir, RESEARCH_QUALITY_CONTRACT_ARTIFACT), null);
  return normalizeResearchQualityContract(contract || {});
}

export async function writeResearchQualityContract(dir: string, contract: Partial<ResearchQualityContract> = {}): Promise<ResearchQualityContract> {
  const normalized = normalizeResearchQualityContract(contract);
  await writeJsonAtomic(path.join(dir, RESEARCH_QUALITY_CONTRACT_ARTIFACT), normalized);
  return normalized;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
