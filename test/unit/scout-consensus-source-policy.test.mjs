import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScoutConsensus } from '../../src/core/scouts/scout-consensus.mjs';
import { SCOUT_ROLES } from '../../src/core/scouts/scout-schema.mjs';

function resultFor(role, sourcePolicy = 'parsed_scout_output') {
  return {
    schema: 'sks.scout-result.v3',
    scout_id: role.id,
    status: sourcePolicy === 'parse_failed_blocked' ? 'blocked' : 'done',
    read_only: sourcePolicy !== 'parse_failed_blocked',
    read_only_confirmed: sourcePolicy !== 'parse_failed_blocked',
    schema_validation: { ok: sourcePolicy !== 'parse_failed_blocked', schema: 'sks.scout-result.v3', issues: sourcePolicy === 'parse_failed_blocked' ? ['scout_output_parse_failed:invalid_json'] : [] },
    summary: role.role,
    findings: [],
    suggested_tasks: [{ id: `${role.id}-task`, title: role.role, files: [], verification: ['npm run packcheck'] }],
    source_policy: sourcePolicy,
    blockers: sourcePolicy === 'parse_failed_blocked' ? ['scout_output_parse_failed:invalid_json'] : [],
    unverified: []
  };
}

test('buildScoutConsensus records parsed real output source policy', () => {
  const consensus = buildScoutConsensus({
    missionId: 'M-test',
    route: '$Team',
    results: SCOUT_ROLES.map((role) => resultFor(role))
  });
  assert.equal(consensus.status, 'passed');
  assert.equal(consensus.source_policy.primary_source, 'parsed_real_scout_outputs');
  assert.equal(consensus.source_policy.fallback_used, false);
  assert.equal(consensus.source_policy.synthetic_static_used, false);
  assert.equal(consensus.source_policy.mode, 'parsed_real_outputs');
  assert.equal(consensus.source_policy.parse_failures_block, true);
  assert.equal(consensus.source_policy.counts.parsed_scout_output, 5);
});

test('buildScoutConsensus blocks source policy when any parse fails', () => {
  const results = SCOUT_ROLES.map((role, index) => resultFor(role, index === 0 ? 'parse_failed_blocked' : 'parsed_scout_output'));
  const consensus = buildScoutConsensus({ missionId: 'M-test', route: '$Team', results });
  assert.equal(consensus.status, 'blocked');
  assert.equal(consensus.source_policy.mode, 'parsed_real_outputs');
  assert.ok(consensus.source_policy.rejected_schema_invalid_count >= 1);
  assert.ok(consensus.blockers.some((blocker) => blocker.includes('schema_validation_failed')));
});
