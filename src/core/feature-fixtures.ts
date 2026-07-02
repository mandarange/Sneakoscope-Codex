import { PACKAGE_VERSION } from './fsx.js';

export const FEATURE_FIXTURE_SCHEMA = 'sks.feature-fixtures.v1';
export const FEATURE_QUALITY_LEVELS = Object.freeze([
  'runtime_verified',
  'wiring_only',
  'integration_optional',
  'static_contract',
  'missing'
]);

const FIXTURES = Object.freeze({
  'cli-help': fixture('execute', 'sks help', [], 'pass'),
  'cli-version': fixture('execute', 'sks --version', [], 'pass'),
  'cli-root': fixture('execute', 'sks root --json', [], 'pass'),
  'cli-doctor': fixture('real_optional', 'sks doctor --json', [], 'pass'),
  'doctor:imagegen-repair': fixture('execute_and_validate_artifacts', 'sks doctor --json', [{ path: '.sneakoscope/reports/feature-fixtures/doctor-imagegen-repair.json', schema: 'sks.doctor-imagegen-repair.v1', optional: true }], 'pass', {
    quality: 'runtime_verified',
    validates_json_fields: ['imagegen_repair', 'repair.imagegen']
  }),
  'cli-paths': fixture('execute_and_validate_artifacts', 'sks paths managed --json', ['.sneakoscope/managed-paths.json'], 'pass'),
  'cli-rollback': fixture('execute', 'sks rollback list --json', [], 'pass'),
  'cli-setup': fixture('real_optional', 'sks setup --json --local-only', [], 'pass'),
  'cli-codex': fixture('execute', 'sks codex compatibility --json', [], 'pass'),
  'cli-codex-app': fixture('real_optional', 'sks codex-app check --json', [], 'pass'),
  'cli-codex-lb': fixture('execute_and_validate_artifacts', 'sks codex-lb metrics --json', [], 'pass'),
  'cli-hooks': fixture('execute', 'sks hooks trust-report --json', [], 'pass'),
  'cli-features': fixture('execute', 'sks features check --json', [], 'pass'),
  'cli-commands': fixture('execute', 'sks commands --json', [], 'pass'),
  'cli-check': fixture('execute', 'sks check --tier confidence --sla 5m --plan --json', [], 'pass'),
  'cli-plan': fixture('execute', 'sks plan "fixture" --json', [], 'pass'),
  'cli-review': fixture('execute', 'sks review --diff HEAD --json', [], 'pass'),
  'cli-ui': fixture('static', 'sks ui [--port 4477] [--mission latest] [--once] [--json]', [], 'pass', {
    quality: 'static_contract',
    reason: 'UI command opens a localhost dashboard; release fixture tracks the CLI contract without launching a server.'
  }),
  'cli-run': fixture('execute_and_validate_artifacts', 'sks run "fixture" --mock --json', ['run-classification.json', 'completion-proof.json', 'evidence-index.json', 'route-completion-contract.json', 'trust-report.json'], 'pass'),
  'cli-status': fixture('execute', 'sks status --json', [], 'pass'),
  'cli-usage': fixture('execute', 'sks usage overview', [], 'pass'),
  'cli-quickstart': fixture('execute', 'sks quickstart', [], 'pass'),
  'cli-update': fixture('execute', 'sks update now --dry-run --json', [], 'pass'),
  'cli-update-check': fixture('static', 'sks update-check --json', [], 'pass'),
  'cli-guard': fixture('execute', 'sks guard check --json', [], 'pass'),
  'cli-conflicts': fixture('execute', 'sks conflicts check --json', [], 'pass'),
  'cli-versioning': fixture('execute', 'sks versioning status --json', [], 'pass'),
  'cli-aliases': fixture('execute', 'sks aliases', [], 'pass'),
  'cli-fix-path': fixture('execute', 'sks fix-path --json', [], 'pass'),
  'cli-selftest': fixture('execute', 'sks selftest --mock', [], 'pass'),
  'cli-git': fixture('execute', 'sks git policy --json', [], 'pass'),
  'cli-uninstall': fixture('execute', 'sks uninstall --dry-run --json', [], 'pass'),
  'cli-goal': fixture('execute_and_validate_artifacts', 'sks goal status latest --json', ['goal-workflow.json'], 'pass'),
  'cli-seo-geo-optimizer': fixture('execute_and_validate_artifacts', 'sks seo-geo-optimizer fixture --mode seo --json', ['search-visibility/site-inventory.json', 'search-visibility/seo-findings.json', 'search-visibility/verification-report.json', 'seo-gate.json', 'completion-proof.json'], 'pass'),
  'cli-research': fixture('execute_and_validate_artifacts', 'sks research status latest --json', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'cli-qa-loop': fixture('execute_and_validate_artifacts', 'sks qa-loop status latest --json', ['qa-loop-proof.json', 'completion-proof.json'], 'pass'),
  'cli-ppt': fixture('execute_and_validate_artifacts', 'sks ppt fixture --mock --json', ['ppt-imagegen-review-gate.json', 'completion-proof.json'], 'pass'),
  'cli-image-ux-review': fixture('execute_and_validate_artifacts', 'sks image-ux-review status latest --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'cli-computer-use': fixture('real_optional', 'sks computer-use status --json', [], 'pass'),
  'cli-pipeline': fixture('execute_and_validate_artifacts', 'sks pipeline status latest --json', ['pipeline-plan.json'], 'pass'),
  'cli-validate-artifacts': fixture('execute_and_validate_artifacts', 'sks validate-artifacts latest --json', ['validation-report.json'], 'pass'),
  'cli-hproof': fixture('execute_and_validate_artifacts', 'sks hproof check latest', ['completion-proof.json'], 'pass'),
  'cli-proof-field': fixture('execute', 'sks proof-field scan --json --intent fixture', [], 'pass'),
  'cli-recallpulse': fixture('execute_and_validate_artifacts', 'sks recallpulse status latest --json', ['recallpulse-report.json'], 'pass'),
  'cli-agent': fixture('execute_and_validate_artifacts', 'sks agent run fixture --mock --json', ['agents/agent-central-ledger.json', 'agents/agent-task-board.json', 'agents/agent-leases.json', 'agents/agent-no-overlap-proof.json', 'agents/agent-session-cleanup.json', 'agents/agent-proof-evidence.json', 'agents/agent-effort-policy.json'], 'pass'),
  'cli-gx': fixture('execute_and_validate_artifacts', 'sks gx validate fixture', ['gx-validation.json'], 'pass'),
  'cli-perf': fixture('execute', 'sks perf cold-start --json --iterations 1', [], 'pass'),
  'cli-bench': fixture('execute_and_validate_artifacts', 'sks bench core --tier npx-one-shot --json --iterations 1', ['.sneakoscope/reports/performance/core-bench.json'], 'pass'),
  'cli-code-structure': fixture('execute', 'sks code-structure scan --json', [], 'pass'),
  'cli-rust': fixture('execute', 'sks rust smoke --json', [], 'pass'),
  'cli-skill-dream': fixture('execute', 'sks skill-dream status --json', [], 'pass'),
  'cli-gc': fixture('execute', 'sks gc --dry-run --json', [], 'pass'),
  'cli-memory': fixture('execute', 'sks memory --dry-run --json', [], 'pass'),
  'cli-stats': fixture('execute', 'sks stats --json', [], 'pass'),
  'cli-dollar-commands': fixture('execute', 'sks dollar-commands --json', [], 'pass'),
  'cli-fast-mode': fixture('execute', 'sks fast-mode status --json', [], 'pass'),
  'cli-with-local-llm': fixture('execute', 'sks with-local-llm status --json', [], 'pass'),
  'cli-dfix': fixture('execute_and_validate_artifacts', 'sks dfix fixture --json', ['completion-proof.json', 'dfix-gate.json', 'dfix-verification.json'], 'pass'),
  'cli-wiki': fixture('execute_and_validate_artifacts', 'sks wiki image-ingest test/fixtures/images/one-by-one.png --json', [{ path: '.sneakoscope/wiki/image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1', require_anchors: false }], 'pass'),
  'cli-db': fixture('execute', 'sks db policy', [], 'pass'),
  'cli-wizard': fixture('execute', 'sks wizard', [], 'pass'),
  'cli-bootstrap': fixture('execute', 'sks bootstrap --dry-run', [], 'pass'),
  'cli-deps': fixture('execute', 'sks deps check --json', [], 'pass'),
  'cli-auth': fixture('execute', 'sks auth status --json', [], 'pass'),
  'cli-codex-native': fixture('execute', 'sks codex-native status --json', [], 'pass'),
  'cli-zellij': fixture('mock', 'npm run zellij:capability --silent', [], 'pass'),
  'cli-tmux': fixture('mock', 'removed runtime migration notice: sks tmux --json', [], 'pass'),
  'cli-mad': fixture('execute', 'sks mad --help', [], 'pass'),
  'cli-mad-sks': fixture('static', 'sks mad-sks status --json', [], 'pass'),
  'cli-auto-review': fixture('execute', 'sks auto-review status --json', [], 'pass'),
  'cli-commit': fixture('mock', 'sks commit --dry-run', [], 'pass'),
  'cli-commit-and-push': fixture('mock', 'sks commit-and-push --dry-run', [], 'pass'),
  'cli-context7': fixture('real_optional', 'sks context7 check --json', [], 'pass'),
  'cli-insane-search': fixture('execute', 'sks insane-search doctor --json', [], 'pass'),
  'cli-ultra-search': fixture('execute', 'sks ultra-search doctor --json', [], 'pass'),
  'cli-xai': fixture('real_optional', 'sks xai check --json', [], 'pass'),
  'cli-task': fixture('execute', 'sks task instant --plan --json', [], 'pass'),
  'cli-release': fixture('execute', 'sks release affected --json', [], 'pass'),
  'cli-triwiki': fixture('execute', 'sks triwiki index --json', [], 'pass'),
  'cli-daemon': fixture('execute', 'sks daemon status --json', [], 'pass'),
  'cli-all-features': fixture('execute_and_validate_artifacts', 'sks all-features complete --json', [`.sneakoscope/reports/all-feature-completion-${PACKAGE_VERSION}.json`], 'pass'),
  'cli-init': fixture('execute', 'sks init --local-only --dry-run', [], 'pass'),
  'cli-eval': fixture('execute', 'sks eval run --mock --json', [], 'pass'),
  'cli-harness': fixture('execute', 'sks harness fixture --mock --json', [], 'pass'),
  'cli-naruto': fixture('execute_and_validate_artifacts', 'sks naruto run "fixture" --backend fake --work-items 4 --json', ['completion-proof.json', 'naruto-gate.json'], 'pass'),
  'cli-team': fixture('execute_and_validate_artifacts', 'sks team "fixture" --mock --clones 4 --backend fake --work-items 4 --json', ['naruto-gate.json', 'team-alias-to-naruto.json'], 'pass'),
  'cli-reasoning': fixture('execute', 'sks reasoning status --json', [], 'pass'),
  'cli-profile': fixture('execute', 'sks profile status --json', [], 'pass'),
  'skill-db-safety-guard': fixture('execute_and_validate_artifacts', 'sks db check --sql "SELECT 1" --json', ['db-operation-report.json', 'completion-proof.json'], 'pass'),
  'skill-honest-mode': fixture('execute_and_validate_artifacts', 'sks proof smoke --json', ['completion-proof.json', 'trust-report.json'], 'pass'),
  'skill-imagegen': fixture('execute_and_validate_artifacts', 'sks image-ux-review fixture --mock --json', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'ux-review:run-wires-imagegen': fixture('execute_and_validate_artifacts', 'npm run ux-review:run-wires-imagegen --silent', [{ path: 'image-ux-review-gate.json', schema: 'sks.image-ux-review-gate.v2', optional: true }], 'pass', {
    validates_source_contracts: ['requireCodexImagegen', 'generateGptImage2CalloutReview', 'evidence_class', 'output_sha256']
  }),
  'ppt:real-imagegen-wiring': fixture('execute_and_validate_artifacts', 'npm run ppt:real-imagegen-wiring --silent', [{ path: 'ppt-imagegen-review-gate.json', schema: 'sks.ppt-imagegen-review-gate.v1', optional: true }], 'pass', {
    validates_source_contracts: ['generateGptImage2CalloutReview', 'buildSlideImagegenEvidence', 'imagegen_evidence']
  }),
  'skill-gx-visual-validate': fixture('execute_and_validate_artifacts', 'sks gx validate fixture --mock --json', ['gx-validation.json'], 'pass'),
  'skill-context7-docs': fixture('real_optional', 'sks context7 check --json', [], 'pass'),
  'skill-seo-geo-optimizer': fixture('execute_and_validate_artifacts', 'sks seo-geo-optimizer fixture --mode geo --json', ['search-visibility/site-inventory.json', 'search-visibility/geo-findings.json', 'geo-gate.json', 'completion-proof.json'], 'pass'),
  'cli-proof': fixture('execute_and_validate_artifacts', 'sks proof smoke --json', ['.sneakoscope/proof/latest.json'], 'pass'),
  'cli-trust': fixture('execute_and_validate_artifacts', 'sks trust report latest --json', ['trust-report.json'], 'pass'),
  'cli-wrongness': fixture('execute_and_validate_artifacts', 'sks wrongness add --kind missing_evidence --claim "fixture wrongness" --json', ['.sneakoscope/wiki/wrongness-ledger.json'], 'pass'),
  'route-team': fixture('execute_and_validate_artifacts', 'sks team "fixture" --mock --clones 4 --backend fake --work-items 4 --json', ['naruto-gate.json', 'team-alias-to-naruto.json'], 'pass'),
  'route-team-alias': fixture('execute_and_validate_artifacts', 'sks team "fixture" --mock --clones 4 --backend fake --work-items 4 --json', ['naruto-gate.json', 'team-alias-to-naruto.json'], 'pass'),
  'route-naruto': fixture('execute_and_validate_artifacts', 'sks naruto run "fixture" --clones 4 --backend fake --work-items 4 --json', ['agents/agent-proof-evidence.json', 'agents/agent-scheduler-state.json'], 'pass'),
  'route-work': fixture('execute_and_validate_artifacts', 'sks naruto run "fixture" --backend fake --work-items 4 --json', ['completion-proof.json', 'naruto-gate.json'], 'pass'),
  'route-swarm': fixture('execute_and_validate_artifacts', 'sks naruto run "fixture" --backend fake --work-items 4 --json', ['completion-proof.json', 'naruto-gate.json'], 'pass'),
  'route-plan': fixture('execute', 'sks plan "fixture" --json', [], 'pass'),
  'route-review': fixture('execute', 'sks review --diff HEAD --json', [], 'pass'),
  'route-shadowclone': fixture('mock', '$ShadowClone alias of $Naruto shadow-clone swarm route', [], 'pass'),
  'route-kagebunshin': fixture('mock', '$Kagebunshin alias of $Naruto shadow-clone swarm route', [], 'pass'),
  'route-qa-loop': fixture('execute_and_validate_artifacts', 'sks qa-loop run latest --mock --json', ['completion-proof.json', 'qa-gate.json'], 'pass'),
  'route-research': fixture('execute_and_validate_artifacts', 'sks research run latest --mock --json', ['completion-proof.json', 'research-gate.json'], 'pass'),
  'route-ppt': fixture('execute_and_validate_artifacts', 'sks ppt fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'ppt-imagegen-review-gate.json', 'ppt-slide-issue-ledger.json'], 'pass'),
  'route-image-ux-review': fixture('execute_and_validate_artifacts', 'sks image-ux-review fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'image-ux-generated-review-ledger.json'], 'pass'),
  'route-computer-use': fixture('execute_and_validate_artifacts', 'sks computer-use import-fixture --mock --json', ['computer-use-evidence-ledger.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'completion-proof.json'], 'pass'),
  'route-cu': fixture('mock', '$CU mock evidence ledger', ['computer-use-evidence-ledger.json', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-dfix': fixture('execute_and_validate_artifacts', 'sks dfix fixture --json', ['completion-proof.json', 'dfix-gate.json', 'dfix-verification.json'], 'pass'),
  'route-answer': fixture('mock', '$Answer answer-only route policy', [], 'pass'),
  'route-goal': fixture('mock', '$Goal bridge route', ['goal-workflow.json', 'completion-proof.json'], 'pass'),
  'route-insane-search': fixture('execute', 'sks run "$Insane-Search source intelligence fixture" --execute --json', [], 'pass'),
  'route-insanesearch': fixture('execute', 'sks run "$InsaneSearch source intelligence fixture" --execute --json', [], 'pass'),
  'route-ultra-search': fixture('execute', 'sks run "$Ultra-Search source intelligence fixture" --execute --json', [], 'pass'),
  'route-ultrasearch': fixture('execute', 'sks run "$UltraSearch source intelligence fixture" --execute --json', [], 'pass'),
  'route-seo-geo-optimizer': fixture('execute_and_validate_artifacts', 'sks seo-geo-optimizer fixture --mode geo --json', ['search-visibility/site-inventory.json', 'search-visibility/geo-findings.json', 'search-visibility/verification-report.json', 'geo-gate.json', 'completion-proof.json'], 'pass'),
  'route-autoresearch': fixture('mock', '$AutoResearch fixture route', ['research-gate.json', 'completion-proof.json'], 'pass'),
  'route-mad-sks': fixture('mock', '$MAD-SKS permission gate + sql_plane route', [{ path: 'mad-sks-gate.json', schema: 'sks.mad-sks-gate.v1' }, 'completion-proof.json'], 'pass'),
  'route-from-chat-img': fixture('mock', '$From-Chat-IMG visual work order route', ['from-chat-img-work-order.md', 'image-voxel-ledger.json', 'completion-proof.json'], 'pass'),
  'route-ux-review': fixture('mock', '$UX-Review image UX alias route', ['image-ux-generated-review-ledger.json', 'image-voxel-ledger.json'], 'pass'),
  'route-db': fixture('execute_and_validate_artifacts', 'sks db check --sql "SELECT 1" --json', ['completion-proof.json', 'db-operation-report.json'], 'pass'),
  'route-mad-db': fixture('mock', '$MAD-DB deprecated alias to $MAD-SKS sql-plane contract', ['mad-sks-gate.json', 'completion-proof.json'], 'pass'),
  'route-wiki': fixture('execute_and_validate_artifacts', 'sks wiki image-ingest test/fixtures/images/one-by-one.png --json', [{ path: 'completion-proof.json', schema: 'sks.completion-proof.v1' }, { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }], 'pass'),
  'route-gx': fixture('execute_and_validate_artifacts', 'sks gx validate fixture --mock --json', ['completion-proof.json', { path: 'image-voxel-ledger.json', schema: 'sks.image-voxel-ledger.v1' }, 'gx-validation.json'], 'pass'),
  'route-sks': fixture('mock', '$SKS control-surface route', ['completion-proof.json'], 'pass'),
  'route-fast-mode': fixture('execute', 'sks fast-mode status --json', [], 'pass'),
  'route-fast-on': fixture('mock', '$Fast-On covered by hermetic fast-mode blackbox toggle test', [], 'pass'),
  'route-fast-off': fixture('mock', '$Fast-Off covered by hermetic fast-mode blackbox toggle test', [], 'pass'),
  'route-local-model': fixture('execute', 'sks with-local-llm status --json', [], 'pass'),
  'route-with-local-llm-on': fixture('mock', '$with-local-llm-on covered by hermetic local-model dollar-command blackbox toggle test', [], 'pass'),
  'route-with-local-llm-off': fixture('mock', '$with-local-llm-off covered by hermetic local-model dollar-command blackbox toggle test', [], 'pass'),
  'route-help': fixture('mock', '$Help lightweight route', [], 'pass'),
  'route-commit': fixture('mock', '$Commit git route', ['completion-proof.json'], 'pass'),
  'route-commit-and-push': fixture('mock', '$Commit-And-Push git route', ['completion-proof.json'], 'pass'),
  'route-release-review': fixture('mock', 'sks agent run "release audit" --route "$Release-Review" --agents 10 --concurrency 5 --mock --json', ['release-review-native-agent-plan.json', 'agents/agent-proof-evidence.json', 'agents/agent-effort-policy.json'], 'pass'),
  'route-native-agent-intake': fixture('mock', 'sks agent run "fixture" --route "$Team" --agents 5 --concurrency 5 --mock --json', ['agents/agent-central-ledger.json', 'agents/agent-task-board.json', 'agents/agent-leases.json', 'agents/agent-no-overlap-proof.json', 'agents/agent-session-cleanup.json', 'agents/agent-proof-evidence.json', 'agents/agent-effort-policy.json'], 'pass'),
  'proof-agent-evidence': fixture('mock', 'sks naruto run "fixture" --backend fake --work-items 4 --json', ['naruto-gate.json', 'agents/agent-proof-evidence.json'], 'pass')
});

const STATIC_CONTRACT_FEATURES = new Set([
  'cli-wizard',
  'cli-bootstrap',
  'cli-deps',
  'cli-auth',
  'cli-codex-native',
  'cli-zellij',
  'cli-tmux',
  'cli-mad',
  'cli-auto-review',
  'cli-commit',
  'cli-commit-and-push',
  'cli-context7',
  'cli-all-features',
  'cli-eval',
  'cli-harness',
  'cli-naruto',
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

export function fixtureForFeature(featureId: any) {
  const fixtures = FIXTURES as Record<string, any>;
  if (fixtures[featureId]) return fixtures[featureId];
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

export function fixtureSummary(features: any = []) {
  const counts: Record<string, number> = {};
  const quality_counts: Record<string, number> = Object.fromEntries(FEATURE_QUALITY_LEVELS.map((level: any) => [level, 0]));
  const missing: any[] = [];
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

export function validateFeatureFixtures(features: any = []) {
  const blockers: any[] = [];
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

function fixture(kind: any, command: any, expected_artifacts: any, status: any, extra: any = {}) {
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

function qualityForKind(kind: any) {
  if (kind === 'execute' || kind === 'execute_and_validate_artifacts') return 'runtime_verified';
  if (kind === 'mock') return 'wiring_only';
  if (kind === 'real_optional') return 'integration_optional';
  if (kind === 'not_available') return 'missing';
  return 'static_contract';
}
