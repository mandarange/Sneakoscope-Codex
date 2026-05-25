import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEAM_AGENT_SESSIONS,
  normalizeTeamAgentSessions,
  parseTeamSpecArgs,
  parseTeamSpecText
} from '../../dist/core/team-live.js';

test('Team prompt text accepts count-first agent budget tokens', () => {
  const agents = parseTeamSpecText('20:agents improve the route parser');
  assert.equal(agents.prompt, 'improve the route parser');
  assert.equal(agents.agentSessions, 20);
  assert.equal(agents.bundleSize, 20);
  assert.equal(agents.roleCounts.executor, 20);
  assert.equal(agents.roster.analysis_team.length, 20);

  const singular = parseTeamSpecText('20:agent improve the route parser');
  assert.equal(singular.agentSessions, 20);
  assert.equal(singular.bundleSize, 20);
  assert.equal(singular.roleCounts.executor, 20);
});

test('Team CLI args accept count-first agent budget tokens', () => {
  const spec = parseTeamSpecArgs(['20:agents', 'improve', 'the', 'route', 'parser', '--json']);
  assert.deepEqual(spec.cleanArgs, ['improve', 'the', 'route', 'parser']);
  assert.equal(spec.agentSessions, 20);
  assert.equal(spec.bundleSize, 20);
  assert.equal(spec.roleCounts.executor, 20);

  const quotedTask = parseTeamSpecArgs(['20:agents improve the route parser', '--json']);
  assert.deepEqual(quotedTask.cleanArgs, ['improve the route parser']);
  assert.equal(quotedTask.agentSessions, 20);
  assert.equal(quotedTask.bundleSize, 20);
  assert.equal(quotedTask.roleCounts.executor, 20);
});

test('Team agent budget tokens stay bounded by native max', () => {
  const spec = parseTeamSpecText('25:agents improve the route parser');
  assert.equal(MAX_TEAM_AGENT_SESSIONS, 20);
  assert.equal(spec.agentSessions, 20);
  assert.equal(spec.bundleSize, 20);
  assert.equal(spec.roleCounts.executor, 20);
  assert.equal(normalizeTeamAgentSessions(0), 1);
});

test('Team explicit executor role can differ from session budget', () => {
  const spec = parseTeamSpecText('20:agents executor:8 improve the route parser');
  assert.equal(spec.agentSessions, 20);
  assert.equal(spec.bundleSize, 8);
  assert.equal(spec.roleCounts.executor, 8);
});
