import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAstraSdkEffort } from '../codex-sdk-config-policy.js'

test('retired none/minimal efforts map to low for every Astra generation and only for Astra', () => {
  for (const model of ['gpt-6-astra', 'gpt-6.1-astra', 'GPT-7-Astra']) {
    assert.equal(normalizeAstraSdkEffort(model, 'minimal'), 'low', model)
    assert.equal(normalizeAstraSdkEffort(model, 'none'), 'low', model)
    assert.equal(normalizeAstraSdkEffort(model, 'high'), 'high', model)
  }
  for (const model of ['gpt-6.1-sol', 'gpt-6-luna', 'anthropic/claude-sonnet-4.5']) {
    assert.equal(normalizeAstraSdkEffort(model, 'none'), 'none', model)
  }
})
