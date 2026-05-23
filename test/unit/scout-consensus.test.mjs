import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScoutConsensus } from '../../src/core/scouts/scout-consensus.mjs';
import { SCOUT_RESULT_SCHEMA, SCOUT_ROLES } from '../../src/core/scouts/scout-schema.mjs';

test('buildScoutConsensus aggregates findings, tests, and implementation slices', () => {
  const results = SCOUT_ROLES.map((role, index) => ({
    schema: SCOUT_RESULT_SCHEMA,
    scout_id: role.id,
    status: 'done',
    read_only: true,
    read_only_confirmed: true,
    schema_validation: { ok: true, schema: SCOUT_RESULT_SCHEMA, issues: [] },
    parse_issues: [],
    source_policy: 'static_fixture',
    findings: [{ id: `finding-${index}`, kind: role.kind, claim: role.role, evidence: [], risk: 'low', action: 'act' }],
    suggested_tasks: [{ id: `task-${index}`, title: role.role, files: [`file-${index}.mjs`], verification: ['npm run packcheck'] }],
    blockers: [],
    unverified: []
  }));
  const consensus = buildScoutConsensus({ missionId: 'M-test', route: '$Team', results });
  assert.equal(consensus.schema, 'sks.scout-consensus.v1');
  assert.equal(consensus.scout_count, 5);
  assert.equal(consensus.completed_scouts, 5);
  assert.equal(consensus.status, 'passed');
  assert.ok(consensus.implementation_slices.length >= 5);
  assert.ok(consensus.required_tests.includes('npm run packcheck'));
});
