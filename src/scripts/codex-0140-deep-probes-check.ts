#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js';
import { detectCodex0140Capability } from '../core/codex-control/codex-0140-capability.js';

const saved = {
  fake: process.env.SKS_CODEX_0140_FAKE,
  version: process.env.SKS_CODEX_VERSION_FAKE,
  probe: process.env.SKS_CODEX_0140_PROBE,
  usageFail: process.env.SKS_CODEX_0140_FAKE_USAGE_VIEWS_FAIL
};

try {
  process.env.SKS_CODEX_0140_FAKE = '1';
  process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.140.0';
  delete process.env.SKS_CODEX_0140_PROBE;
  delete process.env.SKS_CODEX_0140_FAKE_USAGE_VIEWS_FAIL;
  const versionOnly = await detectCodex0140Capability({ codexBin: 'codex' });
  assertGate(versionOnly.ok === true, '0.140 version-only capability fixture must pass', versionOnly);
  assertGate(Object.values(versionOnly.feature_states).every((state) => state.certainty === 'assumed_by_version'), 'version-only mode must not pretend feature probes ran', versionOnly);

  process.env.SKS_CODEX_0140_PROBE = '1';
  const probed = await detectCodex0140Capability({ codexBin: 'codex' });
  assertGate(probed.ok === true, '0.140 feature-probe fixture must pass', probed);
  assertGate(Object.values(probed.feature_states).every((state) => state.certainty === 'fixture'), 'fixture feature-probe mode must expose fixture certainty', probed);

  process.env.SKS_CODEX_0140_FAKE_USAGE_VIEWS_FAIL = '1';
  const failed = await detectCodex0140Capability({ codexBin: 'codex' });
  assertGate(failed.ok === false && failed.blockers.includes('codex_0140_usage_views_probe_failed'), 'failed feature probe must block capability', failed);
  assertGate(failed.feature_states.usage_views.supported === false && failed.feature_states.usage_views.certainty === 'failed', 'failed feature state must be explicit', failed.feature_states.usage_views);

  emitGate('codex:0140-deep-probes', { features: Object.keys(probed.feature_states).length });
} finally {
  restore('SKS_CODEX_0140_FAKE', saved.fake);
  restore('SKS_CODEX_VERSION_FAKE', saved.version);
  restore('SKS_CODEX_0140_PROBE', saved.probe);
  restore('SKS_CODEX_0140_FAKE_USAGE_VIEWS_FAIL', saved.usageFail);
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
