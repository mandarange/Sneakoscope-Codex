import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_BRIDGE_MANAGED_MARKER,
  repairManagedCodexLbClientSelection,
  upsertDesktopBridgeManagedConfig,
} from '../../../cli/install-helpers-codex-lb-config.js';

// The old Codex-LB toggle wrote this under the managed marker; no
// [model_providers.codex-lb] table backs it, so Codex cannot load it.
const toggled = `${DESKTOP_BRIDGE_MANAGED_MARKER}\nmodel_provider = "codex-lb"\nmodel = "gpt-6-astra"\n`;

test('a codex-lb selection the old toggle wrote is set back to the managed binding in place', () => {
  assert.equal(repairManagedCodexLbClientSelection(toggled), `${DESKTOP_BRIDGE_MANAGED_MARKER}\nmodel_provider = "openai"\nmodel = "gpt-6-astra"\n`);
});

test('a codex-lb selection that is not SKS-written, or that a real provider table backs, is left alone', () => {
  const unmarked = 'model_provider = "codex-lb"\n';
  assert.equal(repairManagedCodexLbClientSelection(unmarked), unmarked);
  const direct = `${toggled}\n[model_providers.codex-lb]\nname = "codex-lb"\nbase_url = "https://lb.example/backend-api/codex"\n`;
  assert.equal(repairManagedCodexLbClientSelection(direct), direct);
  for (const other of ['model_provider = "openai"\n', 'model_provider = "openrouter"\n', '']) {
    assert.equal(repairManagedCodexLbClientSelection(other), other);
  }
});

test('the managed binding keeps codex-lb only when a provider table makes it loadable', () => {
  const input = { bridgeBaseUrl: `http://127.0.0.1:53111/__sks/client/${'a'.repeat(43)}/backend-api/codex`, combinedCatalogPath: '/tmp/.codex/sks-bridge-catalog.json' };
  assert.match(upsertDesktopBridgeManagedConfig(toggled, input), /^model_provider = "openai"$/m);
  assert.match(upsertDesktopBridgeManagedConfig(toggled, input), /^model = "gpt-6-astra"$/m);
  const direct = `${toggled}\n[model_providers.codex-lb]\nname = "codex-lb"\n`;
  assert.match(upsertDesktopBridgeManagedConfig(direct, input), /^model_provider = "codex-lb"$/m);
});
