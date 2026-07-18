import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProofField, SPEED_LANE_POLICY, validateProofFieldReport } from '../proof-field.js';
import { buildPipelinePlan, validatePipelinePlan } from '../pipeline-internals/runtime-core.js';
import { runWorkflowPerfBench, validateWorkflowPerfReport } from '../perf-bench.js';
import { PRODUCT_DESIGN_PIPELINE_STAGES, productDesignPluginPolicyText } from '../product-design-plugin.js';
import { buildEvidenceEnvelope, buildRecallPulseGovernanceReport } from '../recallpulse.js';
import { createSkillForgeReport, decideSkillInjection } from '../skill-forge.js';
import { createWorkOrderLedger } from '../work-order-ledger.js';
import { ambientGoalContinuation } from '../commands/command-utils.js';

const ACTIVE_IDENTITY_SOURCES = [
  'src/core/proof-field.ts',
  'src/core/decision-lattice.ts',
  'src/core/perf-bench.ts',
  'src/core/pipeline-internals/runtime-core.ts',
  'src/core/product-design-plugin.ts',
  'src/core/recallpulse.ts',
  'src/core/skill-forge.ts',
  'src/core/work-order-ledger.ts',
  'src/core/code-structure.ts',
  'src/core/commands/wiki-command.ts',
  'src/core/commands/command-utils.ts',
  'src/core/questions.ts',
  'src/core/hooks-runtime/naruto-decision-gate.ts',
  'src/core/hooks-runtime.ts',
  'src/core/retention.ts',
  'src/scripts/check-architecture.ts'
] as const;

const RETIRED_ACTIVE_IDENTITY = /team-inbox|team-gate\.json|team-session-cleanup\.json|team_live|team_trigger_matrix|full_team_recommended|full_team_honest_path|balanced_team_lane|team_trigger_count|active_team_triggers|explicit_team|fresh_executor_team|Balanced Team Lane|Full Team Honest Path|full Team\/Honest proof path|\$Team\b|\bsks\.team(?:[-.]|\b)|routes:\s*\[[^\]]*['"]Team['"]|\broute\s*=\s*['"]team['"]|\broute:\s*[^\n]*['"]team['"]/i;

test('active runtime source surfaces contain no retired Team route or schema identity', async () => {
  for (const relative of ACTIVE_IDENTITY_SOURCES) {
    const source = await fsp.readFile(path.join(process.cwd(), relative), 'utf8');
    assert.doesNotMatch(source, RETIRED_ACTIVE_IDENTITY, relative);
  }
});

test('architecture route-domain inventory uses Naruto and cannot revive Team', async () => {
  const source = await fsp.readFile(path.join(process.cwd(), 'src/scripts/check-architecture.ts'), 'utf8');
  const declaration = source.match(/CURRENT_ROUTE_DOMAIN_IMPORT_SEGMENTS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || '';
  assert.match(declaration, /['"]naruto['"]/);
  assert.doesNotMatch(declaration, /['"]team['"]/i);
});

test('Proof Field, pipeline economy, and perf reports expose only Naruto trigger identity', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-active-runtime-identity-'));
  try {
    const proof = await buildProofField(root, {
      intent: '$Naruto implement the scoped runtime identity cleanup',
      changedFiles: [
        'src/core/proof-field.ts',
        'src/core/decision-lattice.ts',
        'src/core/perf-bench.ts',
        'src/core/pipeline-internals/runtime-core.ts'
      ]
    });
    assert.equal(validateProofFieldReport(proof).ok, true);
    assert.equal(Object.hasOwn(proof, 'team_trigger_matrix'), false);
    assert.equal(proof.naruto_trigger_matrix.full_naruto_honest_path_recommended, true);
    assert.ok(proof.naruto_trigger_matrix.active_triggers.includes('explicit_naruto'));
    assert.equal(SPEED_LANE_POLICY.full_lane, 'full_naruto_honest_path');
    assert.ok(proof.decision_lattice.candidate_paths.some((candidate: any) => candidate.id === 'balanced_naruto_lane'));
    assert.ok(proof.decision_lattice.candidate_paths.some((candidate: any) => candidate.id === 'full_naruto_honest_path'));

    const plan = buildPipelinePlan({
      task: '$Naruto implement the scoped runtime identity cleanup',
      proofField: proof
    });
    assert.equal(validatePipelinePlan(plan).ok, true);
    assert.equal(plan.route_economy.naruto_trigger_count, proof.naruto_trigger_matrix.active_triggers.length);
    assert.deepEqual(plan.route_economy.active_naruto_triggers, proof.naruto_trigger_matrix.active_triggers);
    assert.equal(Object.hasOwn(plan.route_economy, 'team_trigger_count'), false);

    const perf = await runWorkflowPerfBench(root, {
      iterations: 1,
      intent: '$Naruto implement one focused fix',
      changedFiles: ['src/core/proof-field.ts']
    });
    assert.ok(perf.proof_field);
    assert.equal(validateWorkflowPerfReport(perf).ok, true);
    assert.equal(perf.metrics.naruto_trigger_count, perf.proof_field.naruto_trigger_matrix.active_triggers.length);
    assert.equal(Object.hasOwn(perf.metrics, 'team_trigger_count'), false);
    assert.doesNotMatch(JSON.stringify({ proof, plan, perf }), RETIRED_ACTIVE_IDENTITY);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('active defaults, plugin mappings, and RecallPulse samples use Naruto identity', async () => {
  assert.equal(decideSkillInjection().route, 'naruto');
  assert.equal(createSkillForgeReport().injection.route, 'naruto');
  assert.equal(createWorkOrderLedger().route, 'Naruto');
  assert.match(ambientGoalContinuation().rule, /Naruto/);
  assert.doesNotMatch(ambientGoalContinuation().rule, /\bTeam\b/);
  assert.ok(PRODUCT_DESIGN_PIPELINE_STAGES.every((stage: any) => !stage.routes.includes('Team')));
  assert.ok(PRODUCT_DESIGN_PIPELINE_STAGES.some((stage: any) => stage.routes.includes('Naruto')));
  assert.doesNotMatch(productDesignPluginPolicyText(), /\bTeam\b/);

  const envelope = buildEvidenceEnvelope({});
  assert.ok(Object.hasOwn(envelope.route_extensions, 'Naruto'));
  assert.equal(Object.hasOwn(envelope.route_extensions, 'Team'), false);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-recallpulse-current-route-'));
  try {
    const governance = await buildRecallPulseGovernanceReport(root, { writeDecisions: false });
    const sampleRoutes = governance.rollout.requested_samples.map((sample: any) => sample.route_id);
    assert.ok(sampleRoutes.includes('Naruto'));
    assert.equal(sampleRoutes.includes('Team'), false);
    assert.doesNotMatch(JSON.stringify(governance.route_gate_inventory), /\bTeam\b/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
