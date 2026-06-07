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
    assertFileIncludes('src/core/research/research-final-reviewer.ts', ['RESEARCH_FINAL_REVIEW_ARTIFACT', 'approved', 'runResearchFinalReviewer', 'runResearchStaticFinalReview', 'runResearchCodexFinalReviewer']);
    assertFileIncludes('src/core/research.ts', ['research_final_review_not_approved']);
  },
  'work-graph': () => {
    assertFileIncludes('src/core/research/research-work-graph.ts', ['RESEARCH_WORK_GRAPH_ARTIFACT', 'buildResearchWorkGraph', 'sks.naruto-work-graph.v1', 'RESEARCH_SOURCE_LAYERS', 'source_shard_local_project_evidence']);
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
  'report-quality': () => {
    assertFileIncludes('src/core/research/research-report-quality.ts', ['analyzeResearchReportQuality', 'REQUIRED_RESEARCH_REPORT_HEADINGS', 'research_report_references_missing_source_ids']);
    assertFileIncludes('src/core/research.ts', ['report_word_count', 'report_quality', 'research_report_too_short']);
  },
  'schemas': () => {
    for (const file of [
      'schemas/research/research-quality-contract.schema.json',
      'schemas/research/claim-evidence-matrix.schema.json',
      'schemas/research/source-quality-report.schema.json',
      'schemas/research/implementation-blueprint.schema.json',
      'schemas/research/experiment-plan.schema.json',
      'schemas/research/replication-pack.schema.json',
      'schemas/research/research-final-review.schema.json',
      'schemas/research/research-source-shard.schema.json'
    ]) assertGate(readText(file).includes('"$schema"'), `${file} missing JSON Schema header`);
  },
  'stage-cycle-runner': () => {
    assertFileIncludes('src/core/research/research-cycle-runner.ts', ['readyStages', 'Promise.race', 'max_observed_parallel', 'critical_path_length']);
    assertFileIncludes('src/core/research/research-stage-runner.ts', ['ResearchStageResult', 'runSourceShardStage', 'runFinalReviewStage', 'cycle-${input.cycle}', 'stages']);
  },
  'parallel-source-shards': () => {
    assertFileIncludes('src/core/research/research-work-graph.ts', ['source_shard_academic_literature', 'source_shard_official_government_data', 'source_shard_counterevidence_factcheck', 'source_shard_local_project_evidence']);
    assertFileIncludes('src/core/research/research-source-shards.ts', ['ResearchSourceShardOutput', 'validateResearchSourceShardOutput', 'source_shard_empty_without_blocker']);
  },
  'source-ledger-merge': () => {
    assertFileIncludes('src/core/research/research-source-ledger-merge.ts', ['mergeResearchSourceShards', 'source-ledger.json', 'source-quality-report.json', 'dedupeSources']);
  },
  'claim-builder': () => {
    assertFileIncludes('src/core/research/research-claim-builder.ts', ['buildClaimEvidenceMatrixFromSourceShards', 'unsupported_important_claim', 'counterevidence_ids']);
  },
  'blueprint-densifier': () => {
    assertFileIncludes('src/core/research/implementation-blueprint-densifier.ts', ['densifyImplementationBlueprint', 'git', 'ls-files', 'existing_files', 'parallel_work_decomposition']);
  },
  'real-cycle-no-legacy-final-md': () => {
    assertFileIncludes('src/core/commands/research-command.ts', ['--legacy-research-cycle', 'SKS_RESEARCH_LEGACY_CYCLE', 'const cycleResult = await runResearchCycle({', 'legacy_final_md_loop']);
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
