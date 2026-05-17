import test from 'node:test';
import assert from 'node:assert/strict';
import { containsPlaintextSecret, redactSecrets } from '../../src/core/secret-redaction.mjs';

test('codex access token and API keys are redacted', () => {
  const openAiKey = ['sk', 'proj', 'fixture', 'secret', 'value', 'for', 'redaction', 'only'].join('-');
  const codexLbKey = ['sk', 'clb', 'fixture', 'secret', 'value'].join('-');
  const env = {
    CODEX_ACCESS_TOKEN: ['codex', 'access', 'token', 'fixture', 'secret'].join('_'),
    OPENAI_API_KEY: openAiKey,
    CODEX_LB_API_KEY: codexLbKey
  };
  const redacted = redactSecrets({ CODEX_ACCESS_TOKEN: env.CODEX_ACCESS_TOKEN, text: `key ${env.OPENAI_API_KEY} ${env.CODEX_LB_API_KEY}` }, env);
  assert.equal(redacted.CODEX_ACCESS_TOKEN, '[redacted]');
  assert.equal(containsPlaintextSecret(redacted, env), false);
});
