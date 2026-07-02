import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveFastModePolicy,
  fastModeEnv,
  applyFastModeToRoster,
  writeFastModePropagationProof,
  writeFastModePreference,
  readFastModePreference,
  clearFastModePreference
} from '../../dist/core/agents/fast-mode-policy.js';

test('fast mode policy does not force fast without explicit opt-in', () => {
  const policy = resolveFastModePolicy({});
  assert.equal(policy.fast_mode, false);
  assert.equal(policy.service_tier, 'standard');
  assert.equal(policy.default_fast_mode, false);
  assert.equal(policy.disabled_by, 'default-standard');
  assert.equal(policy.explicit_fast, false);
  assert.equal(policy.explicit_service_tier, null);
  assert.deepEqual(fastModeEnv(policy), {
    SKS_FAST_MODE: '0',
    SKS_SERVICE_TIER: 'standard',
    SKS_CODEX_DESKTOP_SERVICE_TIER: 'default',
    SKS_REASONING_PROFILE_SUFFIX: 'standard'
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
  assert.equal(standard.codex_desktop_service_tier, 'default');
  assert.equal(standard.disabled_by, 'service-tier-standard');

  const priorityAlias = resolveFastModePolicy({ serviceTier: 'priority' });
  assert.equal(priorityAlias.fast_mode, true);
  assert.equal(priorityAlias.service_tier, 'fast');

  const defaultAlias = resolveFastModePolicy({ serviceTier: 'default' });
  assert.equal(defaultAlias.fast_mode, false);
  assert.equal(defaultAlias.service_tier, 'standard');
});

test('fast mode preference toggles project default while explicit flags still win', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-preference-'));
  const saved = await writeFastModePreference(root, 'standard', 'unit-test');
  assert.equal(saved.service_tier, 'standard');
  assert.equal(saved.fast_mode, false);

  const preference = await readFastModePreference(root);
  assert.equal(preference.service_tier, 'standard');

  const preferred = resolveFastModePolicy({ root });
  assert.equal(preferred.fast_mode, false);
  assert.equal(preferred.service_tier, 'standard');
  assert.equal(preferred.disabled_by, 'preference-standard');
  assert.equal(preferred.preference_source, 'project-state');

  const explicitFast = resolveFastModePolicy({ root, fastMode: true });
  assert.equal(explicitFast.fast_mode, true);
  assert.equal(explicitFast.service_tier, 'fast');
  assert.equal(explicitFast.disabled_by, 'none');

  const explicitFastTier = resolveFastModePolicy({ root, serviceTier: 'fast' });
  assert.equal(explicitFastTier.fast_mode, true);
  assert.equal(explicitFastTier.service_tier, 'fast');
  assert.equal(explicitFastTier.preference_mode, null);

  const standardTierBeatsFastFlag = resolveFastModePolicy({ root, serviceTier: 'standard', fastMode: true });
  assert.equal(standardTierBeatsFastFlag.fast_mode, false);
  assert.equal(standardTierBeatsFastFlag.service_tier, 'standard');
  assert.equal(standardTierBeatsFastFlag.disabled_by, 'service-tier-standard');

  const noFastBeatsFastTier = resolveFastModePolicy({ root, noFast: true, serviceTier: 'fast' });
  assert.equal(noFastBeatsFastTier.fast_mode, false);
  assert.equal(noFastBeatsFastTier.service_tier, 'standard');
  assert.equal(noFastBeatsFastTier.disabled_by, 'no-fast');

  await writeFastModePreference(root, 'fast', 'unit-test');
  assert.equal(resolveFastModePolicy({ root }).service_tier, 'fast');

  const cleared = await clearFastModePreference(root);
  assert.equal(cleared.removed, true);
  assert.equal(resolveFastModePolicy({ root }).service_tier, 'standard');
});

test('fast mode policy rewrites roster reasoning profiles and service tier', () => {
  const roster = {
    roster: [{ id: 'agent_1', reasoning_profile: 'sks-agent-medium-standard' }],
    effort_policy: { decisions: [{ agent_id: 'agent_1', reasoning_profile: 'sks-agent-high-standard' }] }
  };
  const applied = applyFastModeToRoster(roster, resolveFastModePolicy({ fastMode: true }));
  assert.equal(applied.service_tier, 'fast');
  assert.equal(applied.fast_mode, true);
  assert.equal(applied.roster[0].reasoning_profile, 'sks-agent-medium-fast');
  assert.equal(applied.effort_policy.decisions[0].reasoning_profile, 'sks-agent-high-fast');
});

test('fast mode proof accepts Codex SDK service tier propagation evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-fast-proof-'));
  const dir = path.join(root, 'sessions', 'agent');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'agent-process-report.json'), JSON.stringify({
    schema: 'sks.agent-process-report.v1',
    backend: 'codex-sdk',
    fast_mode: true,
    service_tier: 'fast'
  }));
  await fs.writeFile(path.join(dir, 'worker-process-report.json'), JSON.stringify({
    schema: 'sks.native-cli-worker-process-report.v1',
    fast_mode: true,
    service_tier: 'fast'
  }));

  const proof = await writeFastModePropagationProof(root, { policy: resolveFastModePolicy({ fastMode: true }) });
  assert.equal(proof.ok, true);
  assert.equal(proof.codex_sdk_process_report_count, 1);
});
