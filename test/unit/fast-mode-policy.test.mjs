import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFastModePolicy, fastModeEnv, applyFastModeToRoster } from '../../dist/core/agents/fast-mode-policy.js';

test('fast mode policy defaults to fast without explicit opt-in', () => {
  const policy = resolveFastModePolicy({});
  assert.equal(policy.fast_mode, true);
  assert.equal(policy.service_tier, 'fast');
  assert.equal(policy.default_fast_mode, true);
  assert.equal(policy.disabled_by, 'none');
  assert.equal(policy.explicit_fast, false);
  assert.equal(policy.explicit_service_tier, null);
  assert.deepEqual(fastModeEnv(policy), {
    SKS_FAST_MODE: '1',
    SKS_SERVICE_TIER: 'fast',
    SKS_REASONING_PROFILE_SUFFIX: 'fast'
  });
});

test('fast mode policy records explicit no-fast and standard-tier opt-out', () => {
  const noFast = resolveFastModePolicy({ noFast: true });
  assert.equal(noFast.fast_mode, false);
  assert.equal(noFast.service_tier, 'standard');
  assert.equal(noFast.disabled_by, 'no-fast');

  const standard = resolveFastModePolicy({ serviceTier: 'standard' });
  assert.equal(standard.fast_mode, false);
  assert.equal(standard.service_tier, 'standard');
  assert.equal(standard.disabled_by, 'service-tier-standard');
});

test('fast mode policy rewrites roster reasoning profiles and service tier', () => {
  const roster = {
    roster: [{ id: 'agent_1', reasoning_profile: 'sks-agent-medium-standard' }],
    effort_policy: { decisions: [{ agent_id: 'agent_1', reasoning_profile: 'sks-agent-high-standard' }] }
  };
  const applied = applyFastModeToRoster(roster, resolveFastModePolicy());
  assert.equal(applied.service_tier, 'fast');
  assert.equal(applied.fast_mode, true);
  assert.equal(applied.roster[0].reasoning_profile, 'sks-agent-medium-fast');
  assert.equal(applied.effort_policy.decisions[0].reasoning_profile, 'sks-agent-high-fast');
});
