export const FEATURE_FIXTURE_SCHEMA = 'sks.feature-fixtures.v1';
export const FEATURE_QUALITY_LEVELS = Object.freeze([
  'runtime_verified',
  'runtime_mock_verified',
  'integration_optional',
  'static_contract',
  'missing'
]);

const FIXTURES = Object.freeze({
  'cli-help': fixture('execute', 'sks help', [], 'pass'),
  'cli-version': fixture('execute', 'sks --version', [], 'pass'),
  'cli-root': fixture('execute', 'sks root --json', [], 'pass'),
  'cli-doctor': fixture('real_optional', 'sks doctor --json', [], 'pass'),
  'cli-paths': fixture('execute_and_validate_artifacts', 'sks paths managed --json', ['.sneakoscope/managed-paths.json'], 'pass'),
  'cli-rollback': fixture('execute', 'sks rollback list --json', [], 'pass'),
  'cli-setup': fixture('real_optional', 'sks setup --json --local-only', [], 'pass'),
  'cli-codex-app': fixture('real_optional', 'sks codex-app check --json', [], 'pass'),
  'cli-codex-lb': fixture('execute_and_validate_artifacts', 'sks codex-lb metrics --json', [], 'pass'),
  'cli-hooks': fixture('mock', 'sks hooks trust-report --json', [], 'pass'),
  'cli-features': fixture('execute', 'sks features check --json', [], 'pass'),
  'cli-commands': fixture('execute', 'sks commands --json', [], 'pass'),
  'cli-run': fixture('execute_and_validate_artifacts', 'sks run "fixture" --mock --json', ['run-classification.json', 'completion-proof.json', 'evidence-index.json', 'route-completion-contract.json', 'trust-report.json'], 'pass'),
  'cli-status': fixture('execute', 'sks status --json', [], 'pass'),
  'cli-usage': fixture('execute', 'sks usage overview', [], 'pass'),
  'cli-quickstart': fixture('execute', 'sks quickstart', [], 'pass'),
  'cli-update-check': fixture('static', 'sks update-check --json', [], 'pass'),
  'cli-guard': fixture('execute', 'sks guard check --json', [], 'pass'),
  'cli-conflicts': fixture('execute', 'sks conflicts check --json', [], 'pass'),
  'cli-versioning': fixture('execute', 'sks versioning status --json', [], 'pass'),
  'cli-aliases': fixture('execute', 'sks aliases', [], 'pass'),
  'cli-fix-path': fixture('execute', 'sks fix-path --json', [], 'pass'),
  'cli-init': fixture('static', 'sks init --local-only', [], 'pass'),
  'cli-selftest': fixture('execute', 'sks selftest --mock', [], 'pass'),
  'cli-goal': fixture('mock', 'sks goal status latest --json', ['goal-workflow.json'], 'pass'),
  'cli-research': fixture('mock', 'sks research status latest --json', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'cli-qa-loop': fixture('mock', 'sks qa-loop status latest --json', ['qa-loop-proof.json', 'completion-proof.json'], 'pass'),
  'cli-ppt': fixture('mock', 'sks ppt status latest --json', ['ppt-review-ledger.json', 'completion-proof.json'], 'pass'),
  'cli-image-ux-review': fixture('mock', 'sks image-ux-review status latest --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'cli-pipeline': fixture('mock', 'sks pipeline status latest --json', ['pipeline-plan.json'], 'pass'),
  'cli-validate-artifacts': fixture('mock', 'sks validate-artifacts latest --json', ['validation-report.json'], 'pass'),
  'cli-hproof': fixture('mock', 'sks hproof check latest', ['completion-proof.json'], 'pass'),
  'cli-proof-field': fixture('execute', 'sks proof-field scan --json --intent fixture', [], 'pass'),
  'cli-recallpulse': fixture('mock', 'sks recallpulse status latest --json', ['recallpulse-report.json'], 'pass'),
  'cli-scouts': fixture('execute_and_validate_artifacts', 'sks scouts run latest --engine local-static --mock --json', ['scout-team-plan.json', 'scout-consensus.json', 'scout-handoff.md', 'scout-gate.json', 'scout-engine-result.json'], 'pass'),
  'cli-scout': fixture('mock', 'sks scout status latest --json', ['scout-gate.json'], 'pass'),
  'cli-gx': fixture('mock', 'sks gx validate fixture', ['gx-validation.json'], 'pass'),
  'cli-perf': fixture('execute', 'sks perf cold-start --json --iterations 1', [], 'pass'),
  'cli-bench': fixture('execute_and_validate_artifacts', 'sks bench core --json --iterations 1', ['.sneakoscope/reports/performance/core-bench.json'], 'pass'),
  'cli-code-structure': fixture('execute', 'sks code-structure scan --json', [], 'pass'),
  'cli-rust': fixture('execute', 'sks rust smoke --json', [], 'pass'),
  'cli-skill-dream': fixture('execute', 'sks skill-dream status --json', [], 'pass'),
  'cli-gc': fixture('execute', 'sks gc --dry-run --json', [], 'pass'),
  'cli-memory': fixture('execute', 'sks memory --dry-run --json', [], 'pass'),
  'cli-stats': fixture('execute', 'sks stats --json', [], 'pass'),
  'cli-dollar-commands': fixture('execute', 'sks dollar-commands --json', [], 'pass'),
  'cli-dfix': fixture('execute', 'sks dfix', [], 'pass'),
  'cli-wiki': fixture('execute_and_validate_artifacts', 'sks wiki image-ingest test/fixtures/images/one-by-one.png --json', [{ path: '.sneakoscope/wiki/image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1', require_anchors: false }], 'pass'),
  'cli-db': fixture('execute', 'sks db policy', [], 'pass'),
  'cli-wizard': fixture('mock', 'sks wizard', [], 'pass'),
  'cli-bootstrap': fixture('mock', 'sks bootstrap --dry-run', [], 'pass'),
  'cli-deps': fixture('mock', 'sks deps check --json', [], 'pass'),
  'cli-auth': fixture('mock', 'sks auth status --json', [], 'pass'),
  'cli-openclaw': fixture('mock', 'sks openclaw status --json', [], 'pass'),
  'cli-tmux': fixture('mock', 'sks tmux check --json', [], 'pass'),
  'cli-mad': fixture('mock', 'sks mad --help', [], 'pass'),
  'cli-auto-review': fixture('mock', 'sks auto-review status --json', [], 'pass'),
  'cli-commit': fixture('mock', 'sks commit --dry-run', [], 'pass'),
  'cli-commit-and-push': fixture('mock', 'sks commit-and-push --dry-run', [], 'pass'),
  'cli-context7': fixture('real_optional', 'sks context7 check --json', [], 'pass'),
  'cli-all-features': fixture('mock', 'sks all-features selftest --mock --json', [], 'pass'),
  'cli-init': fixture('mock', 'sks init --local-only --dry-run', [], 'pass'),
  'cli-eval': fixture('mock', 'sks eval run --mock --json', [], 'pass'),
  'cli-harness': fixture('mock', 'sks harness fixture --mock --json', [], 'pass'),
  'cli-team': fixture('mock', 'sks team "fixture" --mock --json', ['completion-proof.json', 'team-gate.json'], 'pass'),
  'cli-reasoning': fixture('mock', 'sks reasoning status --json', [], 'pass'),
  'cli-profile': fixture('mock', 'sks profile status --json', [], 'pass'),
  'skill-db-safety-guard': fixture('mock', 'sks db check --sql "SELECT 1" --json', ['db-operation-report.json', 'completion-proof.json'], 'pass'),
  'skill-honest-mode': fixture('mock', 'sks proof smoke --json', ['completion-proof.json', 'trust-report.json'], 'pass'),
  'skill-imagegen': fixture('mock', 'sks image-ux-review fixture --mock --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'skill-gx-visual-validate': fixture('mock', 'sks gx validate fixture --mock --json', ['gx-validation.json'], 'pass'),
  'skill-context7-docs': fixture('real_optional', 'sks context7 check --json', [], 'pass'),
  'cli-proof': fixture('execute_and_validate_artifacts', 'sks proof smoke --json', ['.sneakoscope/proof/latest.json'], 'pass'),
  'cli-trust': fixture('execute_and_validate_artifacts', 'sks trust report latest --json', ['trust-report.json'], 'pass'),
  'route-team': fixture('execute_and_validate_artifacts', 'sks team "fixture" --mock --json', ['completion-proof.json', 'team-gate.json', 'team-session-cleanup.json'], 'pass'),
  'route-qa-loop': fixture('execute_and_validate_artifacts', 'sks qa-loop run latest --mock --json', ['completion-proof.json', 'qa-gate.json'], 'pass'),
  'route-research': fixture('execute_and_validate_artifacts', 'sks research run latest --mock --json', ['completion-proof.json', 'research-gate.json'], 'pass'),
  'route-ppt': fixture('execute_and_validate_artifacts', 'sks ppt fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'ppt-review-ledger.json'], 'pass'),
  'route-image-ux-review': fixture('execute_and_validate_artifacts', 'sks image-ux-review fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'image-ux-generated-review-ledger.json'], 'pass'),
  'route-computer-use': fixture('execute_and_validate_artifacts', 'sks computer-use import-fixture --mock --json', ['computer-use-evidence-ledger.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'completion-proof.json'], 'pass'),
  'route-cu': fixture('mock', '$CU mock evidence ledger', ['computer-use-evidence-ledger.json', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-dfix': fixture('mock', '$DFix tiny edit route policy', ['completion-proof.json'], 'pass'),
  'route-answer': fixture('mock', '$Answer answer-only route policy', [], 'pass'),
  'route-goal': fixture('mock', '$Goal bridge route', ['goal-workflow.json', 'completion-proof.json'], 'pass'),
  'route-autoresearch': fixture('mock', '$AutoResearch fixture route', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'route-mad-sks': fixture('mock', '$MAD-SKS permission gate route', ['mad-sks-gate.json', 'completion-proof.json'], 'pass'),
  'route-from-chat-img': fixture('mock', '$From-Chat-IMG visual work order route', ['from-chat-img-work-order.md', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-ux-review': fixture('mock', '$UX-Review image UX alias route', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'route-db': fixture('execute_and_validate_artifacts', 'sks db check --sql "SELECT 1" --json', ['completion-proof.json', 'db-operation-report.json'], 'pass'),
  'route-wiki': fixture('execute_and_validate_artifacts', 'sks wiki image-ingest test/fixtures/images/one-by-one.png --json', [{ path: 'completion-proof.json', schema: 'sks.completion-proof.v1' }, { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }], 'pass'),
  'route-gx': fixture('execute_and_validate_artifacts', 'sks gx validate fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'gx-validation.json'], 'pass'),
  'route-sks': fixture('mock', '$SKS control-surface route', ['completion-proof.json'], 'pass'),
  'route-help': fixture('mock', '$Help lightweight route', [], 'pass'),
  'route-commit': fixture('mock', '$Commit git route', ['completion-proof.json'], 'pass'),
  'route-commit-and-push': fixture('mock', '$Commit-And-Push git route', ['completion-proof.json'], 'pass'),
  'route-five-scout-intake': fixture('mock', 'sks scouts validate latest --strict --json', ['scout-team-plan.json', 'scout-consensus.json', 'scout-handoff.md', 'scout-gate.json'], 'pass'),
  'proof-scout-evidence': fixture('mock', 'sks team "fixture" --mock --json', ['completion-proof.json', 'scout-gate.json'], 'pass')
});

const STATIC_CONTRACT_FEATURES = new Set([
  'cli-wizard',
  'cli-bootstrap',
  'cli-deps',
  'cli-auth',
  'cli-openclaw',
  'cli-tmux',
  'cli-mad',
  'cli-auto-review',
  'cli-commit',
  'cli-commit-and-push',
  'cli-context7',
  'cli-all-features',
  'cli-eval',
  'cli-harness',
  'cli-team',
  'cli-reasoning',
  'cli-profile',
  'handler-$',
  'handler-autoresearch',
  'handler-autoreview',
  'handler-computer-use',
  'handler-cu',
  'handler-dollars',
  'handler-mad-sks',
  'handler-postinstall'
]);

export function fixtureForFeature(featureId) {
  if (FIXTURES[featureId]) return FIXTURES[featureId];
  if (STATIC_CONTRACT_FEATURES.has(featureId)) {
    return fixture('static', `explicit static contract fixture: ${featureId}`, [], 'pass', {
      quality: 'static_contract',
      root_mode: 'source_checkout_required'
    });
  }
  if (String(featureId || '').startsWith('skill-')) {
    return fixture('static', `skill contract: ${featureId}`, [], 'pass', { quality: 'static_contract', root_mode: 'source_checkout_required' });
  }
  return fixture('not_available', null, [], 'missing', {
    quality: 'missing',
    fallback_removed: true,
    reason: 'No explicit fixture registered for this feature.'
  });
}

export function fixtureSummary(features = []) {
  const counts = {};
  const quality_counts = Object.fromEntries(FEATURE_QUALITY_LEVELS.map((level) => [level, 0]));
  const missing = [];
  for (const feature of features) {
    const status = feature.fixture?.status || 'missing';
    counts[status] = (counts[status] || 0) + 1;
    const quality = feature.fixture?.quality || 'missing';
    quality_counts[quality] = (quality_counts[quality] || 0) + 1;
    if (!feature.fixture) missing.push(feature.id);
  }
  return {
    schema: FEATURE_FIXTURE_SCHEMA,
    counts,
    quality_counts,
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
    if (!['contract', 'execute', 'execute_and_validate_artifacts', 'mock', 'static', 'real_optional', 'not_available'].includes(fx.kind)) blockers.push(`${feature.id}:fixture_kind`);
    if (!FEATURE_QUALITY_LEVELS.includes(fx.quality)) blockers.push(`${feature.id}:fixture_quality`);
    if (!['pass', 'missing', 'blocked', 'not_required'].includes(fx.status)) blockers.push(`${feature.id}:fixture_status`);
    if ((fx.kind === 'mock' || fx.kind === 'static') && !fx.command && fx.status !== 'not_required') blockers.push(`${feature.id}:fixture_command`);
    if (!Array.isArray(fx.expected_artifacts)) blockers.push(`${feature.id}:fixture_expected_artifacts`);
  }
  return { ok: blockers.length === 0, blockers };
}

function fixture(kind, command, expected_artifacts, status, extra = {}) {
  const quality = extra.quality || qualityForKind(kind);
  const rootMode = extra.root_mode || (kind === 'execute_and_validate_artifacts' || kind === 'execute' || kind === 'mock' ? 'hermetic_temp_project' : 'source_checkout_required');
  return {
    kind,
    quality,
    root_mode: rootMode,
    command,
    expected_artifacts,
    status,
    explicit: true,
    fallback_removed: true,
    ...extra
  };
}

function qualityForKind(kind) {
  if (kind === 'execute' || kind === 'execute_and_validate_artifacts') return 'runtime_verified';
  if (kind === 'mock') return 'runtime_mock_verified';
  if (kind === 'real_optional') return 'integration_optional';
  if (kind === 'not_available') return 'missing';
  return 'static_contract';
}
