import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScoutGate } from '../../src/core/scouts/scout-gate.mjs';
import { buildScoutConsensus } from '../../src/core/scouts/scout-consensus.mjs';
import { buildScoutTeamPlan } from '../../src/core/scouts/scout-plan.mjs';
import { SCOUT_ROLES } from '../../src/core/scouts/scout-schema.mjs';

test('evaluateScoutGate passes when all five read-only scouts complete', () => {
  const results = SCOUT_ROLES.map((role) => ({
    schema: 'sks.scout-result.v1',
    scout_id: role.id,
    status: 'done',
    read_only: true,
    findings: [],
    suggested_tasks: [{ id: `${role.id}-task`, title: role.role, files: [], verification: ['npm run packcheck'] }],
    blockers: [],
    unverified: []
  }));
  const plan = buildScoutTeamPlan({ missionId: 'M-test', route: '$Team' });
  const consensus = buildScoutConsensus({ missionId: 'M-test', route: '$Team', results });
  const gate = evaluateScoutGate({ missionId: 'M-test', route: '$Team', plan, results, consensus, handoffWritten: true });
  assert.equal(gate.passed, true);
  assert.equal(gate.completed_scouts, 5);
  assert.equal(gate.read_only_confirmed, true);
});

test('evaluateScoutGate blocks when a scout is missing', () => {
  const results = SCOUT_ROLES.slice(0, 4).map((role) => ({
    scout_id: role.id,
    status: 'done',
    read_only: true,
    findings: [],
    suggested_tasks: [{ id: `${role.id}-task`, title: role.role, files: [], verification: ['npm run packcheck'] }],
    blockers: [],
    unverified: []
  }));
  const plan = buildScoutTeamPlan({ missionId: 'M-test', route: '$Team' });
  const consensus = buildScoutConsensus({ missionId: 'M-test', route: '$Team', results });
  const gate = evaluateScoutGate({ missionId: 'M-test', route: '$Team', plan, results, consensus, handoffWritten: true });
  assert.equal(gate.passed, false);
  assert.ok(gate.blockers.some((blocker) => blocker.includes('completed_scouts_4_of_5')));
});
