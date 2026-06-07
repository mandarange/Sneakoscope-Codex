#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './lib/codex-sdk-gate-lib.js';

const mode = process.argv[2] || 'all';

const checks = {
  'quality-contract': () => {
    assertFileIncludes('src/core/research/research-quality-contract.ts', [
      'min_sources_total: 12',
      'min_source_layers_covered: 5',
      'min_counterevidence_sources: 2',
      'min_trianguled_claims: 6',
      'min_key_claims: 8',
      'min_report_words: 2200'
    ]);
    assertFileIncludes('src/core/research.ts', ['quality_contract', 'writeResearchQualityContract', 'research_report_too_short']);
  },
  'claim-matrix': () => {
    assertFileIncludes('src/core/research/claim-evidence-matrix.ts', ['CLAIM_EVIDENCE_MATRIX_ARTIFACT', 'validateClaimEvidenceMatrix', 'buildClaimEvidenceMatrixFromLedgers']);
    assertFileIncludes('src/core/research.ts', ['claim_evidence_matrix_missing', 'key_claims_below_contract', 'triangulated_claims_below_contract']);
  },
  'source-quality-report': () => {
    assertFileIncludes('src/core/research/source-quality-report.ts', ['SOURCE_QUALITY_REPORT_ARTIFACT', 'buildSourceQualityReport', 'claim_ids']);
    assertFileIncludes('src/core/research.ts', ['source_quality_report_missing', 'writeSourceQualityReport']);
  },
  'implementation-blueprint': () => {
    assertFileIncludes('src/core/research/implementation-blueprint.ts', ['IMPLEMENTATION_BLUEPRINT_ARTIFACT', 'validateImplementationBlueprint']);
    assertFileIncludes('src/core/research.ts', ['implementation_blueprint_missing', 'renderImplementationBlueprintMarkdown']);
  },
  'experiment-plan': () => {
    assertFileIncludes('src/core/research/experiment-plan.ts', ['EXPERIMENT_PLAN_JSON_ARTIFACT', 'min_experiment_steps', 'validateExperimentPlan']);
    assertFileIncludes('src/core/research/experiment-plan.ts', ['experiment_plan_missing', 'experiment_plan_too_thin']);
    assertFileIncludes('src/core/research.ts', ['experiment_plan_missing', 'validateExperimentPlan']);
  },
  'replication-pack': () => {
    assertFileIncludes('src/core/research/replication-pack.ts', ['REPLICATION_PACK_ARTIFACT', 'validateReplicationPack']);
    assertFileIncludes('src/core/research.ts', ['replication_pack_missing']);
  },
  'final-reviewer': () => {
    assertFileIncludes('src/core/research/research-final-reviewer.ts', ['RESEARCH_FINAL_REVIEW_ARTIFACT', 'approved', 'runResearchFinalReviewer']);
    assertFileIncludes('src/core/research.ts', ['research_final_review_not_approved']);
  },
  'work-graph': () => {
    assertFileIncludes('src/core/research/research-work-graph.ts', ['RESEARCH_WORK_GRAPH_ARTIFACT', 'buildResearchWorkGraph', 'sks.naruto-work-graph.v1']);
    assertFileIncludes('src/core/commands/research-command.ts', ['narutoWorkGraph: researchWorkGraph', 'readonly: true', 'runResearchCycle']);
  },
  'prompt-contract': () => {
    assertFileIncludes('src/core/research/research-prompt-contract.ts', ['researchPromptContractText', 'validateResearchPromptContract']);
    assertFileIncludes('src/core/research.ts', ['QUALITY CONTRACT:', 'researchPromptContractText()']);
  },
  'gate-thresholds': () => {
    assertFileIncludes('src/core/research.ts', [
      'source_entries_below_research_quality_contract',
      'source_layer_coverage_below_contract',
      'counterevidence_below_contract',
      'required_artifact_missing'
    ]);
    assertFileIncludes('src/core/research/falsification.ts', ['falsification_cases_below_contract']);
  },
  'schemas': () => {
    for (const file of [
      'schemas/research/research-quality-contract.schema.json',
      'schemas/research/claim-evidence-matrix.schema.json',
      'schemas/research/source-quality-report.schema.json',
      'schemas/research/implementation-blueprint.schema.json',
      'schemas/research/experiment-plan.schema.json',
      'schemas/research/replication-pack.schema.json',
      'schemas/research/research-final-review.schema.json'
    ]) assertGate(readText(file).includes('"$schema"'), `${file} missing JSON Schema header`);
  }
};

if (mode === 'all') {
  for (const check of Object.values(checks)) check();
} else {
  assertGate(Boolean(checks[mode]), `unknown research quality check: ${mode}`);
  checks[mode]();
}

emitGate(`research:${mode}`, { mode });

function assertFileIncludes(file, tokens) {
  const text = readText(file);
  for (const token of tokens) assertGate(text.includes(token), `${file} missing token ${token}`);
}
