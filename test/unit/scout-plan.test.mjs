import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScoutTeamPlan, normalizeScoutPolicy, routeRequiresScoutIntake } from '../../src/core/scouts/scout-plan.mjs';
import { FIVE_SCOUT_STAGE_ID, SCOUT_COUNT } from '../../src/core/scouts/scout-schema.mjs';

test('scout policy requires five scouts for serious routes and skips lightweight routes', () => {
  assert.equal(routeRequiresScoutIntake('$Team', { task: 'implement feature' }), true);
  assert.equal(routeRequiresScoutIntake('$Research', { task: 'investigate' }), true);
  assert.equal(routeRequiresScoutIntake('$DFix', { task: 'tiny copy edit' }), false);
  assert.equal(routeRequiresScoutIntake('$Answer', { task: 'explain this' }), false);
  assert.equal(routeRequiresScoutIntake('$Help', { task: 'show commands' }), false);
});

test('scout policy supports force and explicit disable contracts', () => {
  assert.equal(routeRequiresScoutIntake('$DFix', { force: true }), true);
  assert.equal(routeRequiresScoutIntake('$Team', { noScouts: true }), false);
  const forced = normalizeScoutPolicy('$DFix', 'tiny edit', { force: true, scouts: 5 });
  assert.equal(forced.required, true);
  assert.equal(forced.stage_id, FIVE_SCOUT_STAGE_ID);
  assert.equal(forced.scout_count, SCOUT_COUNT);
});

test('buildScoutTeamPlan produces exactly five read-only scouts', () => {
  const plan = buildScoutTeamPlan({ missionId: 'M-test', route: '$Team', task: 'fixture' });
  assert.equal(plan.schema, 'sks.scout-team-plan.v1');
  assert.equal(plan.scout_count, 5);
  assert.equal(plan.read_only, true);
  assert.equal(plan.scouts.length, 5);
  assert.ok(plan.scouts.every((scout) => scout.write_policy === 'read_only'));
});
