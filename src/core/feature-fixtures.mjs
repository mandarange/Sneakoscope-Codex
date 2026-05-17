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
  'cli-wiki': fixture('mock', 'sks wiki image-summary --json', ['.sneakoscope/wiki/image-voxel-ledger.json'], 'pass'),
  'cli-db': fixture('static', 'sks db policy', [], 'pass'),
  'cli-proof': fixture('mock', 'sks proof validate --json', ['.sneakoscope/proof/latest.json'], 'pass'),
  'route-team': fixture('mock', 'sks team "fixture" --json', ['completion-proof.json'], 'pass'),
  'route-qa-loop': fixture('mock', 'sks qa-loop run latest --mock --json', ['qa-loop-proof.json'], 'pass'),
  'route-research': fixture('mock', 'sks research run latest --mock --json', ['completion-proof.json'], 'pass'),
  'route-ppt': fixture('mock', 'sks ppt status latest --json', ['ppt-review-ledger.json', 'completion-proof.json'], 'pass'),
  'route-image-ux-review': fixture('mock', 'sks image-ux-review status latest --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'route-computer-use': fixture('real_optional', '$Computer-Use mock evidence ledger', ['computer-use-evidence-ledger.json'], 'blocked'),
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
