export const FEATURE_FIXTURE_SCHEMA = 'sks.feature-fixtures.v1';

const FIXTURES = Object.freeze({
  'cli-help': fixture('static', 'sks help', [], 'pass'),
  'cli-version': fixture('static', 'sks --version', [], 'pass'),
  'cli-root': fixture('static', 'sks root --json', [], 'pass'),
  'cli-doctor': fixture('real_optional', 'sks doctor --json', [], 'pass'),
  'cli-setup': fixture('real_optional', 'sks setup --json --local-only', [], 'pass'),
  'cli-codex-app': fixture('real_optional', 'sks codex-app check --json', [], 'pass'),
  'cli-codex-lb': fixture('mock', 'sks codex-lb metrics --json', ['.sneakoscope/reports/codex-lb-health.json'], 'pass'),
  'cli-hooks': fixture('mock', 'sks hooks trust-report --json', [], 'pass'),
  'cli-features': fixture('static', 'sks features check --json', [], 'pass'),
  'cli-commands': fixture('static', 'sks commands --json', [], 'pass'),
  'cli-usage': fixture('static', 'sks usage overview', [], 'pass'),
  'cli-quickstart': fixture('static', 'sks quickstart', [], 'pass'),
  'cli-update-check': fixture('static', 'sks update-check --json', [], 'pass'),
  'cli-guard': fixture('static', 'sks guard check --json', [], 'pass'),
  'cli-conflicts': fixture('static', 'sks conflicts check --json', [], 'pass'),
  'cli-versioning': fixture('static', 'sks versioning status --json', [], 'pass'),
  'cli-aliases': fixture('static', 'sks aliases', [], 'pass'),
  'cli-fix-path': fixture('static', 'sks fix-path --json', [], 'pass'),
  'cli-init': fixture('static', 'sks init --local-only', [], 'pass'),
  'cli-selftest': fixture('static', 'sks selftest --mock', [], 'pass'),
  'cli-goal': fixture('mock', 'sks goal status latest --json', ['goal-workflow.json'], 'pass'),
  'cli-research': fixture('mock', 'sks research status latest --json', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'cli-qa-loop': fixture('mock', 'sks qa-loop status latest --json', ['qa-loop-proof.json', 'completion-proof.json'], 'pass'),
  'cli-ppt': fixture('mock', 'sks ppt status latest --json', ['ppt-review-ledger.json', 'completion-proof.json'], 'pass'),
  'cli-image-ux-review': fixture('mock', 'sks image-ux-review status latest --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'cli-pipeline': fixture('mock', 'sks pipeline status latest --json', ['pipeline-plan.json'], 'pass'),
  'cli-validate-artifacts': fixture('mock', 'sks validate-artifacts latest --json', ['validation-report.json'], 'pass'),
  'cli-hproof': fixture('mock', 'sks hproof check latest', ['completion-proof.json'], 'pass'),
  'cli-proof-field': fixture('static', 'sks proof-field scan --json --intent fixture', [], 'pass'),
  'cli-recallpulse': fixture('mock', 'sks recallpulse status latest --json', ['recallpulse-report.json'], 'pass'),
  'cli-gx': fixture('mock', 'sks gx validate fixture', ['gx-validation.json'], 'pass'),
  'cli-perf': fixture('static', 'sks perf cold-start --json --iterations 1', [], 'pass'),
  'cli-code-structure': fixture('static', 'sks code-structure scan --json', [], 'pass'),
  'cli-skill-dream': fixture('static', 'sks skill-dream status --json', [], 'pass'),
  'cli-gc': fixture('static', 'sks gc --dry-run --json', [], 'pass'),
  'cli-memory': fixture('static', 'sks memory --dry-run --json', [], 'pass'),
  'cli-stats': fixture('static', 'sks stats --json', [], 'pass'),
  'cli-dollar-commands': fixture('static', 'sks dollar-commands --json', [], 'pass'),
  'cli-dfix': fixture('static', 'sks dfix', [], 'pass'),
  'cli-wiki': fixture('mock', 'sks wiki image-summary --json', ['.sneakoscope/wiki/image-voxel-ledger.json'], 'pass'),
  'cli-db': fixture('static', 'sks db policy', [], 'pass'),
  'cli-proof': fixture('mock', 'sks proof validate --json', ['.sneakoscope/proof/latest.json'], 'pass'),
  'route-team': fixture('mock', 'sks team "fixture" --json', ['completion-proof.json'], 'pass'),
  'route-qa-loop': fixture('mock', 'sks qa-loop run latest --mock --json', ['qa-loop-proof.json'], 'pass'),
  'route-research': fixture('mock', 'sks research run latest --mock --json', ['completion-proof.json'], 'pass'),
  'route-ppt': fixture('mock', 'sks ppt status latest --json', ['ppt-review-ledger.json', 'completion-proof.json'], 'pass'),
  'route-image-ux-review': fixture('mock', 'sks image-ux-review status latest --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'route-computer-use': fixture('mock', '$Computer-Use mock evidence ledger', ['computer-use-evidence-ledger.json', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-cu': fixture('mock', '$CU mock evidence ledger', ['computer-use-evidence-ledger.json', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-dfix': fixture('static', '$DFix tiny edit route policy', ['completion-proof.json'], 'pass'),
  'route-answer': fixture('static', '$Answer answer-only route policy', [], 'pass'),
  'route-goal': fixture('mock', '$Goal bridge route', ['goal-workflow.json', 'completion-proof.json'], 'pass'),
  'route-autoresearch': fixture('mock', '$AutoResearch fixture route', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'route-mad-sks': fixture('mock', '$MAD-SKS permission gate route', ['mad-sks-gate.json', 'completion-proof.json'], 'pass'),
  'route-from-chat-img': fixture('mock', '$From-Chat-IMG visual work order route', ['from-chat-img-work-order.md', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-ux-review': fixture('mock', '$UX-Review image UX alias route', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'route-db': fixture('static', 'sks db policy', [], 'pass'),
  'route-wiki': fixture('mock', 'sks wiki image-summary --json', ['.sneakoscope/wiki/image-voxel-ledger.json'], 'pass'),
  'route-gx': fixture('mock', 'sks gx validate fixture', [], 'pass')
});

export function fixtureForFeature(featureId) {
  return FIXTURES[featureId] || fixture('static', null, [], 'not_required');
}

export function fixtureSummary(features = []) {
  const counts = {};
  const missing = [];
  for (const feature of features) {
    const status = feature.fixture?.status || 'missing';
    counts[status] = (counts[status] || 0) + 1;
    if (!feature.fixture) missing.push(feature.id);
  }
  return {
    schema: FEATURE_FIXTURE_SCHEMA,
    counts,
    missing,
    ok: missing.length === 0 && !counts.missing
  };
}

export function validateFeatureFixtures(features = []) {
  const blockers = [];
  for (const feature of features) {
    const fx = feature.fixture;
    if (!fx) {
      blockers.push(`${feature.id}:fixture_missing`);
      continue;
    }
    if (!['mock', 'static', 'real_optional', 'not_available'].includes(fx.kind)) blockers.push(`${feature.id}:fixture_kind`);
    if (!['pass', 'missing', 'blocked', 'not_required'].includes(fx.status)) blockers.push(`${feature.id}:fixture_status`);
    if ((fx.kind === 'mock' || fx.kind === 'static') && !fx.command && fx.status !== 'not_required') blockers.push(`${feature.id}:fixture_command`);
    if (!Array.isArray(fx.expected_artifacts)) blockers.push(`${feature.id}:fixture_expected_artifacts`);
  }
  return { ok: blockers.length === 0, blockers };
}

function fixture(kind, command, expected_artifacts, status) {
  return { kind, command, expected_artifacts, status };
}
