import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  fastEvidenceFromChain,
  isCodexLbFastChainVerified,
  resolveCodexLbFastCheckModel,
  serviceTierEvidenceFromRows
} from '../../dist/commands/codex-lb.js';

test('codex-lb Fast chain treats skipped success as unverified', () => {
  assert.equal(isCodexLbFastChainVerified({ ok: true, status: 'skipped', skipped: true }), false);
  assert.equal(isCodexLbFastChainVerified({ ok: true, status: 'chain_ok' }), true);
});

test('codex-lb Fast model selection prefers env, then top-level config, then a priority-capable catalog model', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-fast-model-'));
  const configPath = path.join(home, 'config.toml');
  const catalogPath = path.join(home, 'catalog.json');
  await fs.writeFile(catalogPath, JSON.stringify({ models: [
    { slug: 'unsupported-mini', supported_in_api: true, priority: 0, service_tiers: [], additional_speed_tiers: [] },
    { slug: 'gpt-priority-2', supported_in_api: true, priority: 2, service_tiers: [{ id: 'priority' }] },
    { slug: 'gpt-priority-1', supported_in_api: true, priority: 1, additional_speed_tiers: ['fast'] }
  ] }));

  await fs.writeFile(configPath, `model = "configured-model"\nmodel_catalog_json = "${catalogPath}"\n[features]\nfast_mode = true\n`);
  assert.deepEqual(await resolveCodexLbFastCheckModel({ config_path: configPath }, { SKS_CODEX_MODEL: 'env-model' }), {
    model: 'env-model', source: 'SKS_CODEX_MODEL', blockers: []
  });
  assert.deepEqual(await resolveCodexLbFastCheckModel({ config_path: configPath }, {}), {
    model: 'configured-model', source: 'global_config', blockers: []
  });

  await fs.writeFile(configPath, `model_catalog_json = "${catalogPath}"\n[features]\nfast_mode = true\n`);
  assert.deepEqual(await resolveCodexLbFastCheckModel({ config_path: configPath }, {}), {
    model: 'gpt-priority-1', source: 'model_catalog_json', blockers: []
  });
});

test('codex-lb Fast evidence accepts response body/SSE priority but never request-only priority or auto', async () => {
  const requestOnly = serviceTierEvidenceFromRows([{ request: { service_tier: 'priority' }, service_tier: 'priority' }]);
  assert.equal(requestOnly.requested_service_tier, 'priority');
  assert.equal(requestOnly.fast_actual, false);

  const auto = serviceTierEvidenceFromRows([{ type: 'response.completed', response: { service_tier: 'auto' } }]);
  assert.equal(auto.fast_actual, false);

  const responseBody = serviceTierEvidenceFromRows([{ id: 'resp_test', object: 'response', output: [], service_tier: 'priority' }]);
  assert.equal(responseBody.fast_actual, true);
  const sse = serviceTierEvidenceFromRows([{ type: 'response.completed', response: { service_tier: 'priority' } }]);
  assert.equal(sse.fast_actual, true);

  const evidence = await fastEvidenceFromChain({
    ok: true,
    requested_service_tier: 'priority',
    service_tier_evidence: { requested_service_tier: 'priority', effective_service_tier: 'auto', fast_actual: false }
  });
  assert.equal(evidence.fast_requested, true);
  assert.equal(evidence.fast_actual, false);
});
