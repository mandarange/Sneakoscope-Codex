import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexExecArgs } from '../codex-cli-syntax-builder.js';
import { buildCodexSdkConfig } from '../../codex-control/codex-sdk-config-policy.js';
import { CODEX_FAST_SERVICE_TIER_ID, codexServiceTierId } from '../codex-service-tier.js';
import { normalizeCodexFastModeUiConfig, codexFastModeDesktopStatus } from '../../codex-runtime/codex-desktop-config-policy.js';

// Codex's catalog lists `priority` as the Fast tier id and the schema calls `fast` a legacy alias
// (measured on 0.153.4 and 0.159.2: `fast` and `priority` both send service_tier=priority). SKS keeps
// fast/standard as its own words but writes Codex's ids.
test('SKS writes Codex service tier ids and still reads the legacy spellings', () => {
  assert.equal(CODEX_FAST_SERVICE_TIER_ID, 'priority');
  assert.equal(codexServiceTierId('fast'), 'priority');
  assert.equal(codexServiceTierId('standard'), 'default');

  for (const tier of ['fast', 'priority'] as const) {
    assert.ok(buildCodexExecArgs({ prompt: 'x', serviceTier: tier as any }).includes('service_tier=priority'), tier);
  }
  for (const tier of ['standard', 'default'] as const) {
    assert.ok(buildCodexExecArgs({ prompt: 'x', serviceTier: tier as any }).includes('service_tier=default'), tier);
  }

  const on = buildCodexSdkConfig({ route: 'r', missionId: 'm', serviceTier: 'fast' } as any) as any;
  const off = buildCodexSdkConfig({ route: 'r', missionId: 'm', serviceTier: 'standard' } as any) as any;
  assert.equal(on.service_tier, 'priority');
  assert.equal(off.service_tier, 'default');

  // `sks fast-mode on` writes the canonical id; `off` removes the key; existing legacy values stay readable.
  const written = normalizeCodexFastModeUiConfig('', { forceFastMode: true });
  assert.match(written, /^service_tier = "priority"$/m);
  assert.doesNotMatch(normalizeCodexFastModeUiConfig(written, { forceFastModeOff: true }), /service_tier/);
  for (const legacy of ['fast', 'priority']) {
    assert.equal(codexFastModeDesktopStatus(`service_tier = "${legacy}"\n`).on, true, legacy);
  }
  assert.equal(codexFastModeDesktopStatus('service_tier = "default"\n').on, false);
});
