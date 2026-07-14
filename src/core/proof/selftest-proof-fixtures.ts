import { writeRouteCompletionProof } from './route-adapter.js';

const CLAIM_TEXT = {
  hard_blocker: 'Hard blocker unblocks incomplete active gate after repeated identical compliance stops.',
  team_gate: 'Team selftest fixture reached Completion Proof gate before reflection validation.',
  subagent_gate: 'Subagent selftest fixture records Completion Proof after subagent evidence.'
};

const DEFAULTS = {
  hard_blocker: {
    artifacts: ['hard-blocker.json', 'compliance-loop-guard.json'],
    gateSource: 'selftest-hard-blocker',
    unverified: ['selftest fixture does not claim a real Team run completed']
  },
  team_gate: {
    artifacts: ['team-gate.json', 'team-session-cleanup.json'],
    gateSource: 'selftest-route-gate',
    unverified: ['selftest fixture does not claim a real Team implementation run completed']
  },
  subagent_gate: {
    artifacts: ['team-gate.json', 'team-session-cleanup.json', 'reflection-gate.json'],
    gateSource: 'selftest-subagent-gate',
    unverified: ['selftest fixture records mocked subagent evidence only']
  }
};

export async function writeSelftestRouteProof(root: any, {
  missionId,
  route = '$Team',
  kind = 'team_gate',
  artifacts = null,
  gateSource = null,
  unverified = null
}: any = {}) {
  const defaults = (DEFAULTS as Record<string, any>)[kind] || DEFAULTS.team_gate;
  return writeRouteCompletionProof(root, {
    missionId,
    route,
    // This fixture writes into a scratch temp directory (see selftestCommand's
    // `tmpdir('sks-selftest-')`) that is discarded after the call returns, so trust
    // artifacts and post-route retention are pointless here. The production
    // post-route path now skips global temp sweeping, but this mock fixture still
    // avoids unnecessary trust/retention work before its caller removes the root.
    lightweightEvidence: true,
    status: 'mock_only',
    executionClass: 'mock_fixture',
    gate: {
      passed: false,
      ok: false,
      execution_class: 'mock_fixture',
      source: gateSource || defaults.gateSource,
      blockers: ['selftest_fixture_cannot_claim_real_route_completion']
    },
    summary: { selftest: true, tests_passed: 1, manual_review_required: true },
    artifacts: artifacts || defaults.artifacts,
    evidence: {
      route_gate: {
        passed: false,
        ok: false,
        execution_class: 'mock_fixture',
        blockers: ['selftest_fixture_cannot_claim_real_route_completion']
      },
      commands: [{ cmd: 'sks selftest --mock', status: 'mock_only' }]
    },
    claims: [{
      id: `selftest-${kind.replaceAll('_', '-')}-proof`,
      text: (CLAIM_TEXT as Record<string, string>)[kind] || CLAIM_TEXT.team_gate,
      status: 'verified_partial'
    }],
    unverified: unverified || defaults.unverified,
    blockers: ['selftest_fixture_cannot_claim_real_route_completion']
  });
}
