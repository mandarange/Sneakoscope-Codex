import { writeRouteCompletionProof } from './route-adapter.mjs';

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

export async function writeSelftestRouteProof(root, {
  missionId,
  route = '$Team',
  kind = 'team_gate',
  artifacts = null,
  gateSource = null,
  unverified = null
} = {}) {
  const defaults = DEFAULTS[kind] || DEFAULTS.team_gate;
  return writeRouteCompletionProof(root, {
    missionId,
    route,
    status: 'verified_partial',
    gate: { passed: true, source: gateSource || defaults.gateSource },
    summary: { selftest: true, tests_passed: 1, manual_review_required: true },
    artifacts: artifacts || defaults.artifacts,
    evidence: {
      route_gate: { passed: true },
      commands: [{ cmd: 'sks selftest --mock', status: 'verified_partial' }]
    },
    claims: [{
      id: `selftest-${kind.replaceAll('_', '-')}-proof`,
      text: CLAIM_TEXT[kind] || CLAIM_TEXT.team_gate,
      status: 'verified_partial'
    }],
    unverified: unverified || defaults.unverified
  });
}
