import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCodexClientProvider } from '../../../cli/install-helpers-codex-lb-config.js';

test('enabling Codex LB selects that provider and disabling returns the OpenAI binding', () => {
  const openai = 'model_provider = "openai"\nmodel = "gpt-6-astra"\n';
  const enabled = bindCodexClientProvider(openai, 'codex-lb');
  assert.match(enabled, /^model_provider = "codex-lb"$/m);
  assert.equal(bindCodexClientProvider(enabled, 'openai').includes('model_provider = "openai"'), true);
});

test('a third-party model provider is left unchanged', () => {
  const custom = 'model_provider = "openrouter"\n';
  assert.equal(bindCodexClientProvider(custom, 'codex-lb'), custom);
});
